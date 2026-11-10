import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

/** Mensagens que passam pela fila. */
export interface MensagemFila {
  tipo: 'webhook';
  evento_webhook_id: number;
}

export const FILA = Symbol('FILA');
export type Processador = (m: MensagemFila) => Promise<void>;

export interface Fila {
  publicar(m: MensagemFila): Promise<void>;
}

/**
 * Local e testes: processa na hora, no mesmo processo.
 * Uma falha fica registrada no evento e não derruba a requisição que publicou.
 */
export class FilaMemoria implements Fila {
  private processador?: Processador;
  definirProcessador(p: Processador) {
    this.processador = p;
  }
  async publicar(m: MensagemFila): Promise<void> {
    if (!this.processador) throw new Error('Fila em memória sem processador.');
    await this.processador(m).catch(() => undefined);
  }
}

/** AWS: SQS com fila de erros (depois de 5 tentativas a mensagem vai para lá e dispara um alarme). */
export class FilaSqs implements Fila {
  private readonly sqs = new SQSClient({});
  constructor(private readonly url: string) {}

  async publicar(m: MensagemFila): Promise<void> {
    await this.sqs.send(new SendMessageCommand({ QueueUrl: this.url, MessageBody: JSON.stringify(m) }));
  }

  /** Usado pelo worker: busca mensagens, processa e apaga só as que deram certo. */
  async consumir(processar: Processador, parar: () => boolean): Promise<void> {
    while (!parar()) {
      let r;
      try {
        r = await this.sqs.send(new ReceiveMessageCommand({ QueueUrl: this.url, MaxNumberOfMessages: 10, WaitTimeSeconds: 20 }));
      } catch (e) {
        // Falha passageira (rede, credenciais renovando): espera e tenta de novo, sem derrubar o processo.
        console.error('Falha ao ler a fila; nova tentativa em 5 s:', (e as Error).message);
        await new Promise((ok) => setTimeout(ok, 5000));
        continue;
      }
      for (const msg of r.Messages ?? []) {
        try {
          await processar(JSON.parse(msg.Body ?? '{}'));
          await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.url, ReceiptHandle: msg.ReceiptHandle }));
        } catch (e) {
          console.error('Falha ao processar mensagem; ela volta para a fila:', (e as Error).message);
        }
      }
    }
  }
}
