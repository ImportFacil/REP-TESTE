'use client';
import { useEffect, useState } from 'react';
import { Campo } from '@/components/ui';
import { enderecoEmLinha, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

export interface CorpoFechamento { forma_pagamento: 'pix' | 'boleto' | 'cartao'; parcelas: number; token_cartao?: string; endereco_id?: number; ordem_compra?: string; observacao?: string }
interface Condicoes {
  pix: { total_centavos: number };
  boleto: { disponivel: boolean; motivo: string | null; opcoes: Array<{ parcelas: number }> };
  cartao: Array<{ parcelas: number; total_centavos: number; sem_juros: boolean }>;
}
type Endereco = { id: number; apelido: string; padrao: boolean; endereco: Parameters<typeof enderecoEmLinha>[0] };

/** Forma de pagamento, entrega e ordem de compra para fechar um pedido (aprovação de requisição ou cotação aceita). */
export function Fechamento({ subtotal, inicial, aoMudar }: { subtotal: number; inicial?: Partial<CorpoFechamento>; aoMudar: (c: CorpoFechamento) => void }) {
  const cond = useDados<Condicoes>(subtotal > 0 ? `/pedidos/condicoes?subtotal_centavos=${subtotal}` : null);
  const enderecos = useDados<Endereco[]>('/loja/enderecos');
  const [forma, setForma] = useState<CorpoFechamento['forma_pagamento']>(inicial?.forma_pagamento ?? 'pix');
  const [parcelas, setParcelas] = useState(inicial?.parcelas ?? 1);
  const [enderecoId, setEnderecoId] = useState<number | undefined>(inicial?.endereco_id);
  const [oc, setOc] = useState(inicial?.ordem_compra ?? '');
  const [obs, setObs] = useState(inicial?.observacao ?? '');
  const [recusar, setRecusar] = useState(false);
  const opcoes = forma === 'pix' ? [1] : forma === 'boleto' ? (cond.dados?.boleto.opcoes.map((o) => o.parcelas) ?? [1]) : (cond.dados?.cartao.map((c) => c.parcelas) ?? [1]);
  useEffect(() => {
    aoMudar({
      forma_pagamento: forma, parcelas: opcoes.includes(parcelas) ? parcelas : 1, ...(forma === 'cartao' && { token_cartao: recusar ? 'tok_recusado' : 'tok_teste' }),
      ...(enderecoId && { endereco_id: enderecoId }), ...(oc.trim() && { ordem_compra: oc.trim() }), ...(obs.trim() && { observacao: obs.trim() }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forma, parcelas, enderecoId, oc, obs, recusar, cond.dados]);
  const total = forma === 'pix' ? cond.dados?.pix.total_centavos : forma === 'cartao' ? cond.dados?.cartao[parcelas - 1]?.total_centavos : subtotal;
  return (
    <div className="pilha" style={{ gap: 10 }}>
      <div className="grade grade-2">
        <Campo rotulo="Forma de pagamento">
          <select value={forma} onChange={(e) => { setForma(e.target.value as CorpoFechamento['forma_pagamento']); setParcelas(1); }}>
            <option value="pix">Pix à vista (com desconto)</option>
            <option value="boleto" disabled={cond.dados ? !cond.dados.boleto.disponivel : false}>Boleto parcelado{cond.dados && !cond.dados.boleto.disponivel ? ' (indisponível)' : ''}</option>
            <option value="cartao">Cartão de crédito</option>
          </select>
        </Campo>
        <Campo rotulo="Parcelas">
          <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} disabled={forma === 'pix'}>
            {opcoes.map((n) => <option key={n} value={n}>{n}×{forma === 'cartao' && cond.dados?.cartao[n - 1] ? ` (total ${reais(cond.dados.cartao[n - 1].total_centavos)}${cond.dados.cartao[n - 1].sem_juros ? ', sem juros' : ''})` : ''}</option>)}
          </select>
        </Campo>
      </div>
      {forma === 'boleto' && cond.dados && !cond.dados.boleto.disponivel && <span className="pequeno" style={{ color: 'var(--vermelho)' }}>{cond.dados.boleto.motivo}</span>}
      {forma === 'cartao' && <label className="linha pequeno"><input type="checkbox" checked={recusar} onChange={(e) => setRecusar(e.target.checked)} style={{ width: 'auto' }} /> Simular cartão recusado (ambiente de testes)</label>}
      <div className="grade grade-2">
        <Campo rotulo="Entrega">
          <select value={enderecoId ?? enderecos.dados?.find((x) => x.padrao)?.id ?? ''} onChange={(e) => setEnderecoId(Number(e.target.value) || undefined)} disabled={!enderecos.dados?.length}>
            {!enderecos.dados?.length && <option value="">Sem endereço cadastrado</option>}
            {enderecos.dados?.map((x) => <option key={x.id} value={x.id}>{x.apelido}{x.padrao ? ' (padrão)' : ''}: {enderecoEmLinha(x.endereco)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nº da ordem de compra" dica="O número do pedido no sistema da sua empresa"><input value={oc} onChange={(e) => setOc(e.target.value)} maxLength={60} /></Campo>
      </div>
      <textarea placeholder="Observação para a ImportFácil (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} aria-label="Observação" />
      <div className="linha entre"><span>Total estimado</span><b className="numero">{reais(total ?? subtotal)}</b></div>
    </div>
  );
}
