import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { FILA, FilaSqs, type Fila } from './pagamentos/fila';
import { WebhookService } from './pagamentos/webhook.service';
import { RotinasService } from './rotinas/rotinas.service';
import { registrarErro } from './observabilidade';

/**
 * Trabalhos em segundo plano: as rotinas (a cada 5 minutos, com trava no banco) e o consumo da fila de eventos.
 * Rodam no worker (`dist/worker.js`) ou, para economizar em homologação, dentro da própria API (WORKER_NA_API=true).
 * Devolve uma função que para tudo e espera o fim do ciclo em andamento.
 */
export async function iniciarTrabalhos(app: INestApplicationContext): Promise<() => Promise<void>> {
  const log = app.get(Logger);
  const fila = app.get<Fila>(FILA);
  const webhooks = app.get(WebhookService);
  const rotinas = app.get(RotinasService);
  let parar = false;

  const ciclo = async () => {
    try {
      await rotinas.executarPendentes();
    } catch (e) {
      log.error(`Falha nas rotinas: ${(e as Error).message}`);
      registrarErro(e, { onde: 'rotinas' });
    }
  };
  await ciclo();
  const timer = setInterval(ciclo, 5 * 60_000);

  let consumo: Promise<void> = Promise.resolve();
  if (fila instanceof FilaSqs) {
    log.log('Consumindo a fila de eventos.');
    consumo = fila
      .consumir((m) => webhooks.processar(m).catch((e) => { registrarErro(e, { mensagem: m }); throw e; }), () => parar)
      .catch((e) => {
        log.error(`O consumo da fila parou: ${(e as Error).message}`);
        registrarErro(e, { onde: 'fila' });
      });
  } else {
    log.log('Fila em memória: os eventos são processados pela própria API; aqui só rodam as rotinas.');
  }

  return async () => {
    parar = true;
    clearInterval(timer);
    await consumo;
  };
}
