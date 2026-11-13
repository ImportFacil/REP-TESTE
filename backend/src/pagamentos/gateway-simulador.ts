import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EventoGateway, GatewayPagamento, ParcelaCriada } from './gateway';

/**
 * Gateway simulado, para desenvolvimento e homologação (proibido em produção).
 * Gera códigos de Pix e boleto fictícios e assina os avisos como um gateway real faria,
 * para que o caminho do webhook seja o mesmo de produção.
 */
export class GatewaySimulador implements GatewayPagamento {
  readonly nome = 'simulador';

  constructor(private readonly segredo: string) {}

  private id(prefixo: string) {
    return `sim_${prefixo}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  async criarPix(valor: number): Promise<ParcelaCriada> {
    const id = this.id('pix');
    return { id_gateway: id, pix_copia_cola: `00020126SIMULADOR-EXPORTFACIL-${id}-${valor}5204000053039865802BR6304ABCD` };
  }

  async criarBoletos(parcelas: Array<{ valor: number; vencimento: string }>): Promise<ParcelaCriada[]> {
    return parcelas.map((p) => {
      const id = this.id('bol');
      const digitos = Array.from(randomBytes(47), (b) => String(b % 10)).join('');
      return { id_gateway: id, linha_digitavel: digitos, pix_copia_cola: `00020126SIMULADOR-BOLETO-${id}-${p.valor}6304ABCD` };
    });
  }

  async cobrarCartao(_valor: number, _parcelas: number, token: string) {
    // Tokens de teste: "tok_recusado" simula cartão negado.
    if (token === 'tok_recusado') return { aprovado: false, id_gateway: this.id('car'), motivo: 'Cartão recusado pela operadora.' };
    return { aprovado: true, id_gateway: this.id('car') };
  }

  async cancelar(): Promise<void> {}

  assinar(corpo: string): string {
    return createHmac('sha256', this.segredo).update(corpo).digest('hex');
  }

  /** Monta um aviso de pagamento assinado, como o banco mandaria. */
  eventoPagamento(idGatewayParcela: string, valor: number, meio: 'pix' | 'boleto' | 'cartao'): { corpo: string; assinatura: string } {
    const corpo = JSON.stringify({
      id: `evt_${randomUUID()}`,
      tipo: 'pagamento_confirmado',
      parcela: idGatewayParcela,
      valor,
      meio,
      pago_em: new Date().toISOString(),
    });
    return { corpo, assinatura: this.assinar(corpo) };
  }

  lerWebhook(corpoBruto: Buffer, cabecalhos: Record<string, string | string[] | undefined>): EventoGateway | null {
    const recebida = String(cabecalhos['x-assinatura'] ?? '');
    const esperada = this.assinar(corpoBruto.toString('utf8'));
    const ok = recebida.length === esperada.length && timingSafeEqual(Buffer.from(recebida), Buffer.from(esperada));
    if (!ok) return null;
    const d = JSON.parse(corpoBruto.toString('utf8'));
    return {
      id_evento: String(d.id),
      tipo: d.tipo === 'pagamento_confirmado' ? 'pagamento_confirmado' : d.tipo === 'pagamento_estornado' ? 'pagamento_estornado' : 'outro',
      id_gateway_parcela: d.parcela,
      valor_centavos: Number(d.valor),
      pago_em: d.pago_em,
      meio: d.meio,
    };
  }
}
