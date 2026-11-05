'use client';
import { reais } from '@/lib/formato';

export interface DetalheCredito {
  empresa: { id: string; razao_social: string; cnpj: string; tipo_cliente: string; conta_e_ordem_liberada: boolean };
  cadastro: {
    situacao: string; faturamento_mensal_centavos: number | null; compras_mensais_previstas_centavos: number | null; limite_solicitado_centavos: number | null;
    anos_cnpj: number | null; faixa: string | null; limite_aprovado_centavos: number; parecer: string | null; enviado_em: string | null; decidido_em: string | null; proxima_revisao_em: string | null;
  };
  documentos: Array<{ id: string; tipo: string; descricao: string; nome_arquivo: string; tamanho_bytes: number; criado_em: string }>;
  exigidos: Array<{ tipo: string; descricao: string; enviado: boolean }>;
  faltando: string[];
  resumo: { limite_centavos: number; usado_centavos: number; disponivel_centavos: number; faixa: string | null; bloqueado: boolean; motivo_bloqueio: string | null };
  historico_limites: Array<{ faixa: string; valor_centavos: number; motivo: string | null; criado_em: string; aprovado_por: string }>;
}

export function ResumoLimite({ d }: { d: DetalheCredito }) {
  return (
    <div className="grade grade-3">
      <div className="cartao indicador"><small>Limite aprovado</small><strong>{reais(d.cadastro.limite_aprovado_centavos)}</strong><div className="pequeno muted">{d.cadastro.faixa ? `Faixa ${d.cadastro.faixa}` : 'Sem faixa'}</div></div>
      <div className="cartao indicador"><small>Em uso</small><strong>{reais(d.resumo.usado_centavos)}</strong></div>
      <div className="cartao indicador"><small>Disponível</small><strong>{reais(d.resumo.disponivel_centavos)}</strong></div>
    </div>
  );
}
