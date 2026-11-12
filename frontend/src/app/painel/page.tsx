'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useEu } from '@/components/Shell';
import { GraficoVendas } from '@/components/painel/GraficoVendas';
import { Icone } from '@/components/painel/Icone';
import { Situacao } from '@/components/ui';
import { FORMA, NOMES_TIPO, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';
import { PERIODOS, ROTULO_PERIODO } from '@/lib/periodos';

interface Totais { vendas_centavos: number; pedidos: number; ticket_medio_centavos: number; clientes: number; variacao: Record<string, number> }
interface Resumo {
  periodo: { de: string; ate: string; dias: number };
  geral: Totais & { a_receber_centavos: number; vencido_centavos: number; parcelas_vencidas: number };
  hoje: Totais;
  serie: Array<{ dia: string; vendas_centavos: number; pedidos: number }>;
  produtos_mais_vendidos: Array<{ id: number; codigo: string; nome: string; quantidade: number; vendas_centavos: number }>;
  clientes_que_mais_compram: Array<{ id: string; razao_social: string; tipo_cliente: string; pedidos: number; vendas_centavos: number }>;
  estoque_baixo: Array<{ id: number; codigo: string; nome: string; estoque: number; preco_tabela_centavos: number }>;
  pedidos_recentes: Array<{ id: number; razao_social: string; total_centavos: number; situacao: string; situacao_pagamento: string; forma_pagamento: string; criado_em: string }>;
}
interface Avisos { contagens: Record<string, number> }


function Variacao({ v }: { v: number | undefined }) {
  if (v === undefined) return null;
  const cls = v > 0 ? 'sobe' : v < 0 ? 'desce' : 'igual';
  return <span className={`pn-var ${cls}`}>{v > 0 ? '↑' : v < 0 ? '↓' : '•'} {Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>;
}

function Numero({ icone, valor, rotulo, variacao, href }: { icone: string; valor: string | number; rotulo: string; variacao?: number; href?: string }) {
  const corpo = (
    <>
      <span className="pn-numero-icone"><Icone nome={icone} tamanho={26} /></span>
      <span><strong>{valor}</strong><small>{rotulo}</small><Variacao v={variacao} /></span>
    </>
  );
  return href ? <Link href={href} className="pn-numero">{corpo}</Link> : <div className="pn-numero">{corpo}</div>;
}

export default function PainelDeControle() {
  const { eu } = useEu();
  const [periodo, setPeriodo] = useState('30');
  const p = useMemo(() => PERIODOS[periodo](), [periodo]);
  const { dados: r, erro } = useDados<Resumo>(`/equipe/painel?de=${p.de}&ate=${p.ate}`);
  const { dados: av } = useDados<Avisos>('/equipe/painel/avisos');
  const fin = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const c = av?.contagens ?? {};
  const intervalo = `${data(p.de + 'T12:00:00')} – ${data(p.ate + 'T12:00:00')}`;

  return (
    <>
      <div className="pn-cabecalho">
        <div>
          <h1>Oi, {eu.usuario.nome.split(' ')[0]}!</h1>
          <p className="sub muted">Revise rapidamente o que está acontecendo na loja.</p>
        </div>
        <label className="pn-periodo">
          <Icone nome="calendario" tamanho={18} />
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
            {Object.entries(ROTULO_PERIODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}

      <div className="pn-dupla">
        <div>
          <div className="pn-secao-titulo" style={{ marginTop: 0 }}>Detalhes gerais <span className="pequeno muted" style={{ fontWeight: 400 }}>· {intervalo}</span></div>
          <div className="pn-caixa pn-numeros">
            <Numero icone="dinheiro" valor={r ? reais(r.geral.vendas_centavos) : '…'} rotulo="Total de vendas" variacao={r?.geral.variacao.vendas} />
            <Numero icone="pedidos" valor={r?.geral.pedidos ?? '…'} rotulo="Total de pedidos" variacao={r?.geral.variacao.pedidos} href="/painel/pedidos/" />
            <Numero icone="empresas" valor={r?.geral.clientes ?? '…'} rotulo="Empresas que compraram" variacao={r?.geral.variacao.clientes} href="/painel/empresas/" />
            <Numero icone="media" valor={r ? reais(r.geral.ticket_medio_centavos) : '…'} rotulo="Valor médio por pedido" variacao={r?.geral.variacao.ticket_medio} />
            {fin && <Numero icone="financeiro" valor={r ? reais(r.geral.a_receber_centavos) : '…'} rotulo="Parcelas a receber" href="/painel/recebiveis/" />}
            {fin && <Numero icone="alerta" valor={r ? reais(r.geral.vencido_centavos) : '…'} rotulo={`Vencido (${r?.geral.parcelas_vencidas ?? 0} parcela(s))`} href="/painel/recebiveis/" />}
          </div>

          <div className="pn-secao-titulo">Detalhes de hoje</div>
          <div className="pn-caixa pn-numeros">
            <Numero icone="dinheiro" valor={r ? reais(r.hoje.vendas_centavos) : '…'} rotulo="Vendas de hoje" variacao={r?.hoje.variacao.vendas} />
            <Numero icone="pedidos" valor={r?.hoje.pedidos ?? '…'} rotulo="Pedidos de hoje" variacao={r?.hoje.variacao.pedidos} />
            <Numero icone="empresas" valor={r?.hoje.clientes ?? '…'} rotulo="Empresas que compraram hoje" variacao={r?.hoje.variacao.clientes} />
          </div>

          <div className="pn-secao-titulo">O que pede atenção</div>
          <div className="pn-caixa pn-numeros">
            <Numero icone="credito" valor={c.cadastros_em_analise ?? '…'} rotulo="Cadastros de crédito em análise" href="/painel/credito/" />
            <Numero icone="documento" valor={c.boletos_para_faturar ?? '…'} rotulo="Pedidos no boleto para faturar" href="/painel/pedidos/?situacao_pagamento=aguardando_faturamento" />
            <Numero icone="caixa" valor={c.pagos_para_separar ?? '…'} rotulo="Pedidos pagos para separar" href="/painel/pedidos/?situacao=novo&situacao_pagamento=pago" />
            <Numero icone="conteudo" valor={c.orcamentos_aguardando ?? '…'} rotulo="Orçamentos aguardando proposta" href="/painel/orcamentos/" />
            <Numero icone="importacao" valor={c.ordens_em_andamento ?? '…'} rotulo="Ordens de importação em andamento" href="/painel/ordens/" />
          </div>

          <div className="pn-secao-titulo">Limite de estoque</div>
          <div className="pn-caixa">
            {!r ? <div className="pn-vazio">Carregando…</div> : !r.estoque_baixo.length ? <div className="pn-vazio">Nenhum produto com estoque baixo.</div> : r.estoque_baixo.map((x) => (
              <Link key={x.id} href={`/painel/produto/?id=${x.id}`} className="pn-lista-item">
                <span className="pn-miniatura"><Icone nome="caixa" /></span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{x.nome}</b><span className="pequeno muted">Código {x.codigo}</span></span>
                <span style={{ textAlign: 'right' }}><b className="numero">{reais(x.preco_tabela_centavos)}</b><span className="pequeno" style={{ display: 'block', color: x.estoque <= 1 ? 'var(--vermelho)' : 'var(--ambar)' }}>{x.estoque} em estoque</span></span>
                <Icone nome="proximo" tamanho={16} />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="pn-secao-titulo" style={{ marginTop: 0 }}>Estatísticas da loja</div>
          <div className="pn-caixa">
            <div className="pn-cartao-cabecalho">
              <span><span className="pequeno muted" style={{ display: 'block', fontWeight: 600 }}>Total de vendas</span><b style={{ fontSize: '1.2rem' }}>{r ? reais(r.geral.vendas_centavos) : '…'}</b></span>
              <span className="pequeno muted" style={{ textAlign: 'right' }}>{intervalo}<br />{r?.geral.pedidos ?? 0} pedidos</span>
            </div>
            <div style={{ padding: '4px 10px 10px' }}>{r && <GraficoVendas titulo="Vendas por dia" resumo={reais(r.geral.vendas_centavos)} pontos={r.serie.map((d) => ({ tempo: d.dia, rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`, valor: d.vendas_centavos, dica: `${data(d.dia + 'T12:00:00')}: ${reais(d.vendas_centavos)} em ${d.pedidos} pedido(s)` }))} />}</div>
          </div>

          <div className="pn-caixa" style={{ marginTop: 16 }}>
            <div className="pn-cartao-cabecalho"><b>Produtos mais vendidos</b><span className="pequeno muted">{ROTULO_PERIODO[periodo]}</span></div>
            {!r?.produtos_mais_vendidos.length ? <div className="pn-vazio">Sem vendas no período.</div> : r.produtos_mais_vendidos.map((x) => (
              <div key={x.id} className="pn-lista-item">
                <span className="pn-miniatura"><Icone nome="caixa" /></span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: '0.9rem' }}>{x.nome}</b><span className="pequeno muted">{x.quantidade} vendido(s)</span></span>
                <b className="numero pequeno">{reais(x.vendas_centavos)}</b>
              </div>
            ))}
          </div>

          <div className="pn-caixa" style={{ marginTop: 16 }}>
            <div className="pn-cartao-cabecalho"><b>Empresas que mais compram</b><span className="pequeno muted">{ROTULO_PERIODO[periodo]}</span></div>
            {!r?.clientes_que_mais_compram.length ? <div className="pn-vazio">Sem vendas no período.</div> : r.clientes_que_mais_compram.map((x) => (
              <Link key={x.id} href={`/painel/empresa/?id=${x.id}`} className="pn-lista-item">
                <span className="pn-miniatura"><Icone nome="empresas" /></span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: '0.9rem' }}>{x.razao_social}</b><span className="pequeno muted">{NOMES_TIPO[x.tipo_cliente] ?? x.tipo_cliente} · {x.pedidos} pedido(s)</span></span>
                <b className="numero pequeno">{reais(x.vendas_centavos)}</b>
              </Link>
            ))}
          </div>

          <div className="pn-caixa" style={{ marginTop: 16 }}>
            <div className="pn-cartao-cabecalho"><b>Pedidos recentes</b><Link className="pequeno" href="/painel/pedidos/">Ver todos</Link></div>
            {r?.pedidos_recentes.map((x) => (
              <Link key={x.id} href={`/painel/pedido/?id=${x.id}`} className="pn-lista-item">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: '0.9rem' }}>Nº {x.id} · {x.razao_social}</b>
                  <span className="pequeno muted">{data(x.criado_em)} · {FORMA[x.forma_pagamento]} · <Situacao valor={x.situacao} nomes={SITUACAO_PEDIDO} /> <Situacao valor={x.situacao_pagamento} nomes={SITUACAO_PAGAMENTO} /></span>
                </span>
                <b className="numero pequeno">{reais(x.total_centavos)}</b>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
