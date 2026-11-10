import { Inject, Injectable, Logger, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BANCO, type Banco } from '../banco/banco.module';
import { FILA, FilaMemoria, type Fila, type MensagemFila } from './fila';
import { GATEWAY, type GatewayPagamento } from './gateway';
import { PagamentosService } from './pagamentos.service';

/**
 * Recebe os avisos do gateway. Responde rápido: confere a assinatura, guarda o aviso
 * (o id do evento é único, então aviso repetido é ignorado) e põe na fila.
 * O processamento acontece no worker (ou na hora, no ambiente local).
 */
@Injectable()
export class WebhookService implements OnModuleInit {
  private readonly log = new Logger(WebhookService.name);

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(GATEWAY) private readonly gateway: GatewayPagamento | null,
    @Inject(FILA) private readonly fila: Fila,
    private readonly pagamentos: PagamentosService,
  ) {}

  onModuleInit() {
    if (this.fila instanceof FilaMemoria) this.fila.definirProcessador((m) => this.processar(m));
  }

  async receber(origem: string, corpo: Buffer, cabecalhos: Record<string, string | string[] | undefined>): Promise<{ recebido: boolean; repetido?: boolean }> {
    if (!this.gateway || origem !== this.gateway.nome) throw new UnauthorizedException('Origem desconhecida.');
    const evento = this.gateway.lerWebhook(corpo, cabecalhos);
    if (!evento) {
      await this.db.insertInto('eventos_webhook').values({
        origem, id_evento: `assinatura-invalida-${randomUUID()}`, tipo: 'desconhecido',
        conteudo: JSON.stringify({ bruto: corpo.toString('utf8').slice(0, 4000) }), assinatura_valida: false,
      }).execute();
      this.log.warn(`Webhook de ${origem} com assinatura inválida foi recusado.`);
      throw new UnauthorizedException('Assinatura inválida.');
    }
    const novo = await this.db.insertInto('eventos_webhook')
      .values({ origem, id_evento: evento.id_evento, tipo: evento.tipo, conteudo: JSON.stringify(evento), assinatura_valida: true })
      .onConflict((oc) => oc.columns(['origem', 'id_evento']).doNothing())
      .returning('id').executeTakeFirst();
    if (!novo) return { recebido: true, repetido: true };
    await this.fila.publicar({ tipo: 'webhook', evento_webhook_id: novo.id });
    return { recebido: true };
  }

  /** Processa um aviso guardado. Erros ficam gravados no evento e a mensagem volta à fila. */
  async processar(m: MensagemFila): Promise<void> {
    const ev = await this.db.selectFrom('eventos_webhook').selectAll().where('id', '=', m.evento_webhook_id).executeTakeFirst();
    if (!ev || ev.processado_em) return;
    try {
      const dados = ev.conteudo as { tipo: string; id_gateway_parcela?: string; valor_centavos?: number; pago_em?: string; meio?: 'pix' | 'boleto' | 'cartao' };
      if (dados.tipo === 'pagamento_confirmado' && dados.id_gateway_parcela) {
        const r = await this.pagamentos.baixarParcela(dados.id_gateway_parcela, Number(dados.valor_centavos), new Date(dados.pago_em ?? Date.now()), ev.id_evento, dados.meio);
        if (r === 'desconhecida') this.log.warn(`Pagamento de parcela desconhecida: ${dados.id_gateway_parcela}`);
      }
      await this.db.updateTable('eventos_webhook').set({ processado_em: new Date(), erro: null }).where('id', '=', ev.id).execute();
    } catch (e) {
      await this.db.updateTable('eventos_webhook').set({ erro: (e as Error).message.slice(0, 2000) }).where('id', '=', ev.id).execute();
      throw e;
    }
  }
}
