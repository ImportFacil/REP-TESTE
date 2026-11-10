'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Campo, Carregando, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { data, dataHora, NOMES_TIPO, paraCentavos, paraTexto, pct, reais } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Item { id: number; produto_id: number; quantidade: number; preco_cliente_centavos: number; preco_proposto_centavos: number | null; codigo: string; nome: string; unidade: string; estoque: number; preco_tabela_centavos: number }
interface Cotacao {
  id: number; situacao: string; mensagem: string | null; resposta: string | null; validade: string | null; criado_em: string; respondida_em: string | null; pedido_id: number | null;
  razao_social: string; tipo_cliente: string; solicitante: string; solicitante_email: string; respondida_por_nome: string | null; itens: Item[]; tabela_centavos: number; proposto_centavos: number | null;
}
const NOMES: Record<string, string> = { solicitada: 'Esperando resposta', respondida: 'Respondida', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', cancelada: 'Cancelada' };
const COR: Record<string, string> = { solicitada: 'pendente', respondida: 'em_aberto', aceita: 'aprovado', recusada: 'recusado', expirada: 'expirada', cancelada: 'cancelada' };

/** Responder uma cotação de preço: preço por item (com o desconto sobre a tabela do cliente), validade e mensagem. */
export default function ResponderCotacao() {
  const id = useParametro('id');
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados: c, erro, setDados } = useDados<Cotacao>(id ? `/equipe/cotacoes/${id}` : null);
  const [precos, setPrecos] = useState<Record<number, string>>({});
  const [resposta, setResposta] = useState('');
  const [dias, setDias] = useState(15);
  const acao = useAcao();
  useEffect(() => {
    if (!c) return;
    setPrecos(Object.fromEntries(c.itens.map((i) => [i.produto_id, paraTexto(i.preco_proposto_centavos ?? i.preco_cliente_centavos)])));
    setResposta(c.resposta ?? '');
  }, [c]);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!c) return <Carregando />;
  const editavel = pode && ['solicitada', 'respondida', 'expirada'].includes(c.situacao);
  const valor = (i: Item) => paraCentavos(precos[i.produto_id] ?? '') ?? 0;
  const total = c.itens.reduce((s, i) => s + i.quantidade * valor(i), 0);
  const desconto = c.tabela_centavos ? Math.round((1 - total / c.tabela_centavos) * 10_000) : 0;
  const aplicar = (bp: number) => setPrecos(Object.fromEntries(c.itens.map((i) => [i.produto_id, paraTexto(Math.round((i.preco_cliente_centavos * (10_000 - bp)) / 10_000))])));
  const responder = () => acao.executar(async () => {
    setDados(await api<Cotacao>(`/equipe/cotacoes/${c.id}/resposta`, { metodo: 'PUT', corpo: { itens: c.itens.map((i) => ({ produto_id: i.produto_id, preco_proposto_centavos: valor(i) })), resposta: resposta || undefined, validade_dias: dias } }));
  }, 'Resposta enviada ao cliente');
  return (
    <>
      <p className="pequeno"><Link href="/painel/cotacoes/">‹ Cotações de preço</Link></p>
      <div className="pn-cabecalho">
        <div>
          <h1>Cotação nº {c.id}</h1>
          <p className="sub muted">{c.razao_social} ({NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente}) · {c.solicitante} &lt;{c.solicitante_email}&gt; · {dataHora(c.criado_em)}</p>
        </div>
        <div className="pn-cabecalho-acoes"><Situacao valor={COR[c.situacao]} nomes={{ [COR[c.situacao]]: NOMES[c.situacao] }} /></div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      {c.mensagem && <Aviso tipo="info">Pedido do cliente: {c.mensagem}</Aviso>}
      {c.pedido_id && <Aviso tipo="ok">Aceita pelo cliente: <Link href={`/painel/pedido/?id=${c.pedido_id}`}>pedido {c.pedido_id}</Link></Aviso>}
      <section className="pn-caixa tabela-rolagem" style={{ padding: 18, marginTop: 12 }}>
        <table>
          <thead><tr><th>Produto</th><th className="direita">Qtd.</th><th className="direita">Estoque</th><th className="direita">Tabela do cliente</th><th className="direita">Preço proposto</th><th className="direita">Desconto</th><th className="direita">Total</th></tr></thead>
          <tbody>{c.itens.map((i) => (
            <tr key={i.id}>
              <td><Link href={`/painel/produto/?id=${i.produto_id}`}><b>{i.nome}</b></Link><div className="pequeno muted">{i.codigo} · tabela geral {reais(i.preco_tabela_centavos)}</div></td>
              <td className="direita">{i.quantidade} {i.unidade}</td>
              <td className="direita" style={{ color: i.estoque < i.quantidade ? 'var(--vermelho)' : undefined }}>{i.estoque}</td>
              <td className="direita numero">{reais(i.preco_cliente_centavos)}</td>
              <td className="direita" style={{ width: 150 }}>{editavel
                ? <input inputMode="decimal" value={precos[i.produto_id] ?? ''} onChange={(e) => setPrecos({ ...precos, [i.produto_id]: e.target.value })} aria-label={`Preço proposto para ${i.codigo}`} />
                : reais(i.preco_proposto_centavos)}</td>
              <td className="direita pequeno">{pct(Math.round((1 - valor(i) / Math.max(1, i.preco_cliente_centavos)) * 10_000))}</td>
              <td className="direita numero">{reais(i.quantidade * valor(i))}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="linha entre" style={{ marginTop: 10 }}><span>Pela tabela do cliente: {reais(c.tabela_centavos)}</span><b>Proposta: {reais(total)} ({pct(desconto)} de desconto)</b></div>
      </section>
      {editavel ? (
        <section className="pn-caixa formulario" style={{ padding: 18, marginTop: 16 }}>
          <div className="linha" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="pequeno">Desconto igual em todos os itens:</span>
            {[300, 500, 800, 1000, 1500].map((bp) => <button key={bp} type="button" className="botao leve pequeno" onClick={() => aplicar(bp)}>{pct(bp)}</button>)}
          </div>
          <div className="grade grade-2">
            <Campo rotulo="Validade (dias)" dica={`Vence em ${data(new Date(Date.now() + dias * 86_400_000))}`}><input type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Number(e.target.value))} /></Campo>
            <Campo rotulo="Mensagem ao cliente"><input value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={2000} placeholder="Condições, prazo de entrega, frete…" /></Campo>
          </div>
          <button className="botao" disabled={acao.enviando || c.itens.some((i) => valor(i) <= 0)} onClick={() => void responder()}>{c.situacao === 'solicitada' ? 'Enviar resposta' : 'Responder de novo'}</button>
        </section>
      ) : c.resposta && <p className="pequeno">Resposta{c.respondida_por_nome ? ` de ${c.respondida_por_nome}` : ''}: {c.resposta}{c.validade ? ` · válida até ${data(`${c.validade}T12:00:00`)}` : ''}</p>}
    </>
  );
}
