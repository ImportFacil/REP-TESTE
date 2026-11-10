import type { FormaPagamento } from '../banco/tipos';

/**
 * Contrato com o gateway de pagamento. Trocar de gateway (Asaas, Pagar.me…) muda só
 * a implementação desta interface, não o resto do sistema.
 */
export const GATEWAY = Symbol('GATEWAY');

export interface ParcelaCriada {
  id_gateway: string;
  linha_digitavel?: string;
  pix_copia_cola?: string;
}

export interface EventoGateway {
  id_evento: string;
  tipo: 'pagamento_confirmado' | 'pagamento_estornado' | 'outro';
  id_gateway_parcela?: string;
  valor_centavos?: number;
  pago_em?: string;
  meio?: FormaPagamento;
}

export interface GatewayPagamento {
  readonly nome: string;
  /** Pix com QR Code dinâmico e validade. */
  criarPix(valor: number, expiraEm: Date, descricao: string): Promise<ParcelaCriada>;
  /** Boletos registrados, um por parcela (cada um traz também o Pix no QR Code). */
  criarBoletos(parcelas: Array<{ valor: number; vencimento: string }>, descricao: string): Promise<ParcelaCriada[]>;
  /** Cartão: os dados são digitados no formulário do gateway; a API recebe só o token. */
  cobrarCartao(valor: number, parcelas: number, tokenCartao: string, descricao: string): Promise<{ aprovado: boolean; id_gateway: string; motivo?: string }>;
  cancelar(idGateway: string): Promise<void>;
  /** Confere a assinatura do aviso (webhook) e o traduz; devolve null se a assinatura for inválida. */
  lerWebhook(corpoBruto: Buffer, cabecalhos: Record<string, string | string[] | undefined>): EventoGateway | null;
}
