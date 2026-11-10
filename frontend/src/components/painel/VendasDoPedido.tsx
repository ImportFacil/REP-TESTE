'use client';
import { useState } from 'react';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora, paraCentavos, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Nota { id: number; numero: number; serie: string; chave: string; valor_centavos: number; situacao: string; emitida_em: string; motivo_cancelamento: string | null }
interface Envio { id: number; transportadora: string; codigo_rastreio: string | null; volumes: number; peso_kg: string | null; enviado_em: string; entregue_em: string | null }
interface Reembolso { id: number; valor_centavos: number; meio: string; motivo: string; devolver_estoque: boolean; criado_em: string }
interface Item { produto_id: number; nome: string; quantidade: number; preco_unitario_centavos: number }
const MEIO: Record<string, string> = { pix: 'Devolução por Pix', estorno_cartao: 'Estorno no cartão', abatimento_boleto: 'Abatimento nos boletos' };

/** Vendas de um pedido no formato do Bagisto: nota fiscal, envio (transportadora e rastreio), entrega e reembolso. */
export function VendasDoPedido({ pedido, papel, aoMudar }: {
  pedido: { id: number; situacao: string; situacao_pagamento: string; total_centavos: number; itens: Item[] };
  papel: string;
  aoMudar: () => Promise<void> | void;
}) {
  const { dados: v, recarregar } = useDados<{ notas: Nota[]; envios: Envio[]; reembolsos: Reembolso[] }>(`/equipe/vendas/pedidos/${pedido.id}`);
  const acao = useAcao();
  const [envio, setEnvio] = useState({ transportadora: '', codigo_rastreio: '', volumes: '1', peso_kg: '' });
  const [reemb, setReemb] = useState({ valor: '', motivo: '', devolver: false, qtd: {} as Record<number, string> });
  const fin = ['financeiro', 'administrador'].includes(papel);
  const com = ['comercial', 'administrador'].includes(papel);
  if (!v) return null;

  const feito = async () => { await recarregar(); await aoMudar(); };
  const nota = v.notas.find((n) => n.situacao === 'emitida');
  const pagoOuFaturado = ['pago', 'em_aberto'].includes(pedido.situacao_pagamento);
  const reembolsado = v.reembolsos.reduce((s, r) => s + r.valor_centavos, 0);
  const pendenteEntrega = v.envios.find((e) => !e.entregue_em);

  return (
    <div className="grade grade-2" style={{ marginTop: 20, alignItems: 'start' }}>
      <section className="pn-caixa formulario" style={{ padding: 18 }}>
        <h2 style={{ margin: 0 }}>Nota fiscal</h2>
        {v.notas.length === 0 && <p className="muted pequeno" style={{ margin: 0 }}>Nenhuma nota emitida.</p>}
        {v.notas.map((n) => (
          <div key={n.id} style={{ display: 'grid', gap: 4 }}>
            <div className="linha"><b>Nº {n.numero} · série {n.serie}</b><Situacao valor={n.situacao === 'emitida' ? 'pago' : 'cancelado'} nomes={{ pago: 'Emitida', cancelado: 'Cancelada' }} /></div>
            <div className="pequeno muted">{dataHora(n.emitida_em)} · {reais(n.valor_centavos)}{n.motivo_cancelamento ? ` · ${n.motivo_cancelamento}` : ''}</div>
            <div className="codigo-copia" style={{ fontSize: '0.72rem' }} title="Chave de acesso">{n.chave}</div>
          </div>
        ))}
        {fin && !nota && pedido.situacao !== 'cancelado' && (
          <div>
            <button className="botao" disabled={acao.enviando || !pagoOuFaturado} onClick={() => void acao.executar(async () => { await api(`/equipe/vendas/pedidos/${pedido.id}/nota`, { metodo: 'POST' }); await feito(); }, 'Nota emitida')}>Emitir nota fiscal</button>
            {!pagoOuFaturado && <p className="pequeno muted">Disponível depois do pagamento confirmado ou do faturamento do boleto.</p>}
          </div>
        )}
        {fin && nota && (
          <div><button className="botao leve pequeno" disabled={acao.enviando} onClick={() => {
            const motivo = window.prompt('Motivo do cancelamento da nota', 'Dados do destinatário incorretos');
            if (motivo) void acao.executar(async () => { await api(`/equipe/vendas/notas/${nota.id}/cancelar`, { corpo: { motivo } }); await feito(); }, 'Nota cancelada');
          }}>Cancelar nota</button></div>
        )}
      </section>

      <section className="pn-caixa formulario" style={{ padding: 18 }}>
        <h2 style={{ margin: 0 }}>Envio</h2>
        {v.envios.map((e) => (
          <div key={e.id} style={{ display: 'grid', gap: 2 }}>
            <div className="linha"><b>{e.transportadora}</b><Situacao valor={e.entregue_em ? 'entregue' : 'enviado'} nomes={{ entregue: 'Entregue', enviado: 'Em trânsito' }} /></div>
            <div className="pequeno muted">Rastreio {e.codigo_rastreio ?? '—'} · {e.volumes} volume(s){e.peso_kg ? ` · ${Number(e.peso_kg).toLocaleString('pt-BR')} kg` : ''}</div>
            <div className="pequeno muted">Enviado {dataHora(e.enviado_em)}{e.entregue_em ? ` · entregue ${dataHora(e.entregue_em)}` : ''}</div>
          </div>
        ))}
        {com && pedido.situacao === 'em_separacao' && (
          <form className="formulario" onSubmit={(ev) => { ev.preventDefault(); void acao.executar(async () => {
            await api(`/equipe/vendas/pedidos/${pedido.id}/envio`, { corpo: { transportadora: envio.transportadora, codigo_rastreio: envio.codigo_rastreio || undefined, volumes: Number(envio.volumes) || 1, peso_kg: envio.peso_kg ? Number(envio.peso_kg.replace(',', '.')) : undefined } });
            await feito();
          }, 'Envio registrado'); }}>
            <div className="grade grade-2">
              <Campo rotulo="Transportadora"><input value={envio.transportadora} onChange={(e) => setEnvio({ ...envio, transportadora: e.target.value })} required minLength={2} list="transportadoras" /></Campo>
              <Campo rotulo="Código de rastreio"><input value={envio.codigo_rastreio} onChange={(e) => setEnvio({ ...envio, codigo_rastreio: e.target.value })} /></Campo>
              <Campo rotulo="Volumes"><input type="number" min={1} value={envio.volumes} onChange={(e) => setEnvio({ ...envio, volumes: e.target.value })} /></Campo>
              <Campo rotulo="Peso (kg)"><input inputMode="decimal" value={envio.peso_kg} onChange={(e) => setEnvio({ ...envio, peso_kg: e.target.value })} /></Campo>
            </div>
            <datalist id="transportadoras">{['Jadlog', 'Braspress', 'TNT Mercúrio', 'Rodonaves', 'Correios', 'Retirada no depósito'].map((t) => <option key={t} value={t} />)}</datalist>
            <div><button className="botao" disabled={acao.enviando}>Registrar envio</button></div>
          </form>
        )}
        {com && pedido.situacao === 'enviado' && pendenteEntrega && (
          <div><button className="botao" disabled={acao.enviando} onClick={() => void acao.executar(async () => { await api(`/equipe/vendas/envios/${pendenteEntrega.id}/entregue`, { metodo: 'POST' }); await feito(); }, 'Entrega confirmada')}>Confirmar entrega</button></div>
        )}
        {!v.envios.length && pedido.situacao !== 'em_separacao' && <p className="muted pequeno" style={{ margin: 0 }}>{pedido.situacao === 'novo' ? 'O envio é registrado quando o pedido estiver em separação.' : 'Nenhum envio registrado.'}</p>}
      </section>

      <section className="pn-caixa formulario" style={{ padding: 18, gridColumn: '1 / -1' }}>
        <h2 style={{ margin: 0 }}>Reembolsos</h2>
        {v.reembolsos.map((r) => (
          <div key={r.id} className="linha" style={{ justifyContent: 'space-between' }}>
            <span><b>{reais(r.valor_centavos)}</b> · {MEIO[r.meio]} · {r.motivo}{r.devolver_estoque ? ' · estoque devolvido' : ''}</span>
            <span className="pequeno muted">{dataHora(r.criado_em)}</span>
          </div>
        ))}
        {v.reembolsos.length === 0 && <p className="muted pequeno" style={{ margin: 0 }}>Nenhum reembolso.</p>}
        {fin && pagoOuFaturado && reembolsado < pedido.total_centavos && (
          <form className="formulario" onSubmit={(ev) => { ev.preventDefault(); void acao.executar(async () => {
            const itens = Object.entries(reemb.qtd).map(([id, q]) => ({ produto_id: Number(id), quantidade: Number(q) })).filter((i) => i.quantidade > 0);
            await api(`/equipe/vendas/pedidos/${pedido.id}/reembolso`, { corpo: { valor_centavos: paraCentavos(reemb.valor), motivo: reemb.motivo, devolver_estoque: reemb.devolver, itens: reemb.devolver ? itens : undefined } });
            setReemb({ valor: '', motivo: '', devolver: false, qtd: {} });
            await feito();
          }, 'Reembolso registrado'); }}>
            <p className="pequeno muted" style={{ margin: 0 }}>Pode reembolsar até {reais(pedido.total_centavos - reembolsado)}. Pix: devolução por Pix; cartão: estorno; boleto: abatimento nas parcelas em aberto.</p>
            <div className="grade grade-2">
              <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={reemb.valor} onChange={(e) => setReemb({ ...reemb, valor: e.target.value })} required /></Campo>
              <Campo rotulo="Motivo"><input value={reemb.motivo} onChange={(e) => setReemb({ ...reemb, motivo: e.target.value })} required minLength={3} /></Campo>
            </div>
            <label className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={reemb.devolver} onChange={(e) => setReemb({ ...reemb, devolver: e.target.checked })} /> Devolver itens ao estoque</label>
            {reemb.devolver && (
              <div className="grade grade-2">
                {pedido.itens.map((i) => (
                  <Campo key={i.produto_id} rotulo={`${i.nome} (comprou ${i.quantidade})`}>
                    <input type="number" min={0} max={i.quantidade} value={reemb.qtd[i.produto_id] ?? ''} onChange={(e) => setReemb({ ...reemb, qtd: { ...reemb.qtd, [i.produto_id]: e.target.value } })} />
                  </Campo>
                ))}
              </div>
            )}
            <div><button className="botao secundario" disabled={acao.enviando}>Registrar reembolso</button></div>
          </form>
        )}
      </section>
      <div style={{ gridColumn: '1 / -1' }}><Aviso tipo="erro">{acao.erro}</Aviso><Aviso tipo="ok">{acao.ok}</Aviso></div>
    </div>
  );
}
