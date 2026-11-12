'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { GraficoVendas } from '@/components/painel/GraficoVendas';
import { RelatorioFinanceiro } from '@/components/painel/RelatorioFinanceiro';
import { RelatorioPedidos } from '@/components/painel/RelatorioPedidos';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Aviso, Carregando } from '@/components/ui';
import { data, dataHora, FORMA, NOMES_TIPO, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';
import { PERIODOS, ROTULO_PERIODO } from '@/lib/periodos';

type Aba = 'vendas' | 'pedidos' | 'financeiro' | 'produtos' | 'clientes';
interface LinhaVendas { periodo: string; pedidos: number; subtotal_centavos: number; promocoes_centavos: number; descontos_pix_centavos: number; juros_centavos: number; vendas_centavos: number; reembolsos_centavos: number; liquido_centavos: number; ticket_medio_centavos: number }
interface Vendas {
  periodo: { de: string; ate: string; agrupar: string };
  totais: Omit<LinhaVendas, 'periodo'> & { cancelados: { pedidos: number; valor_centavos: number } };
  serie: LinhaVendas[];
  por_forma: Array<{ chave: string; pedidos: number; vendas_centavos: number }>;
  por_tipo_cliente: Array<{ chave: string; pedidos: number; vendas_centavos: number }>;
}
interface LinhaProduto { produto_id: number; codigo: string; nome: string; categoria: string; quantidade: number; vendas_centavos: number; pedidos: number; empresas: number; estoque: number }
interface Produtos { produtos: LinhaProduto[]; categorias: Array<{ categoria_id: string; categoria: string; produtos: number; quantidade: number; vendas_centavos: number }>; totais: { produtos_vendidos: number; produtos_sem_venda: number; quantidade: number; vendas_centavos: number } }
interface LinhaCliente { empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; situacao: string; pedidos: number; vendas_centavos: number; ticket_medio_centavos: number; ultimo_pedido: string | null; primeiro_pedido: string | null }
interface Clientes { clientes: LinhaCliente[]; totais: { empresas: number; compraram: number; primeira_compra_no_periodo: number; novas_empresas: number; vendas_centavos: number } }

const ABAS: Record<Aba, string> = { vendas: 'Vendas', pedidos: 'Pedidos por cliente', financeiro: 'Financeiro dos clientes', produtos: 'Produtos', clientes: 'Clientes' };
const AGRUPAR: Record<string, string> = { dia: 'Por dia', semana: 'Por semana', mes: 'Por mês' };
const csv = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const rotuloPeriodo = (p: string, g: string) => (g === 'mes' ? `${p.slice(5, 7)}/${p.slice(2, 4)}` : `${p.slice(8, 10)}/${p.slice(5, 7)}`);

function Numeros({ itens }: { itens: Array<[string, string]> }) {
  return (
    <div className="pn-numeros" style={{ marginBottom: 16 }}>
      {itens.map(([rotulo, valor]) => <div key={rotulo} className="pn-numero"><span><strong>{valor}</strong><small>{rotulo}</small></span></div>)}
    </div>
  );
}

const COL_VENDAS = (g: string): Coluna<LinhaVendas>[] => [
  { chave: 'periodo', titulo: g === 'mes' ? 'Mês' : g === 'semana' ? 'Semana de' : 'Dia', ordenavel: true, render: (l) => (g === 'mes' ? l.periodo.slice(0, 7).split('-').reverse().join('/') : data(`${l.periodo}T12:00:00`)) },
  { chave: 'pedidos', titulo: 'Pedidos', ordenavel: true, direita: true },
  { chave: 'subtotal_centavos', titulo: 'Produtos', direita: true, render: (l) => reais(l.subtotal_centavos), valorCsv: (l) => csv(l.subtotal_centavos) },
  { chave: 'promocoes_centavos', titulo: 'Promoções', direita: true, render: (l) => (l.promocoes_centavos ? `− ${reais(l.promocoes_centavos)}` : '—'), valorCsv: (l) => csv(l.promocoes_centavos) },
  { chave: 'descontos_pix_centavos', titulo: 'Desconto Pix', direita: true, render: (l) => (l.descontos_pix_centavos ? `− ${reais(l.descontos_pix_centavos)}` : '—'), valorCsv: (l) => csv(l.descontos_pix_centavos) },
  { chave: 'juros_centavos', titulo: 'Juros cartão', direita: true, render: (l) => (l.juros_centavos ? `+ ${reais(l.juros_centavos)}` : '—'), valorCsv: (l) => csv(l.juros_centavos) },
  { chave: 'vendas_centavos', titulo: 'Vendas', ordenavel: true, direita: true, render: (l) => <b>{reais(l.vendas_centavos)}</b>, valorCsv: (l) => csv(l.vendas_centavos) },
  { chave: 'reembolsos_centavos', titulo: 'Reembolsos', direita: true, render: (l) => (l.reembolsos_centavos ? `− ${reais(l.reembolsos_centavos)}` : '—'), valorCsv: (l) => csv(l.reembolsos_centavos) },
  { chave: 'liquido_centavos', titulo: 'Líquido', ordenavel: true, direita: true, render: (l) => reais(l.liquido_centavos), valorCsv: (l) => csv(l.liquido_centavos) },
  { chave: 'ticket_medio_centavos', titulo: 'Ticket médio', direita: true, render: (l) => reais(l.ticket_medio_centavos), valorCsv: (l) => csv(l.ticket_medio_centavos) },
];
const COL_PRODUTOS: Coluna<LinhaProduto>[] = [
  { chave: 'nome', titulo: 'Produto', ordenavel: true, render: (p) => <><b>{p.nome}</b><div className="pequeno muted">{p.codigo}</div></> },
  { chave: 'codigo', titulo: 'Código', oculta: true },
  { chave: 'categoria', titulo: 'Categoria', ordenavel: true, filtro: 'opcoes' },
  { chave: 'quantidade', titulo: 'Quantidade', ordenavel: true, direita: true },
  { chave: 'pedidos', titulo: 'Pedidos', ordenavel: true, direita: true },
  { chave: 'empresas', titulo: 'Empresas', ordenavel: true, direita: true },
  { chave: 'vendas_centavos', titulo: 'Vendas', ordenavel: true, direita: true, render: (p) => <b>{reais(p.vendas_centavos)}</b>, valorCsv: (p) => csv(p.vendas_centavos) },
  { chave: 'estoque', titulo: 'Estoque hoje', ordenavel: true, direita: true },
];
const COL_CLIENTES: Coluna<LinhaCliente>[] = [
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, render: (c) => <><b>{c.razao_social}</b><div className="pequeno muted">{NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente}</div></> },
  { chave: 'tipo_cliente', titulo: 'Grupo', filtro: 'opcoes', opcoes: NOMES_TIPO, oculta: true, valorCsv: (c) => NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente },
  { chave: 'pedidos', titulo: 'Pedidos', ordenavel: true, direita: true, filtro: 'numero' },
  { chave: 'vendas_centavos', titulo: 'Vendas', ordenavel: true, direita: true, render: (c) => <b>{reais(c.vendas_centavos)}</b>, valorCsv: (c) => csv(c.vendas_centavos) },
  { chave: 'ticket_medio_centavos', titulo: 'Ticket médio', ordenavel: true, direita: true, render: (c) => reais(c.ticket_medio_centavos), valorCsv: (c) => csv(c.ticket_medio_centavos) },
  { chave: 'primeiro_pedido', titulo: 'Primeira compra', ordenavel: true, render: (c) => (c.primeiro_pedido ? data(c.primeiro_pedido) : <span className="muted">Nunca</span>) },
  { chave: 'ultimo_pedido', titulo: 'Última compra', ordenavel: true, filtro: 'data', render: (c) => (c.ultimo_pedido ? dataHora(c.ultimo_pedido) : <span className="muted">Nunca</span>) },
];

/** Relatórios (como no Bagisto): vendas, produtos e clientes de um período, com gráfico e exportação. */
export default function Relatorios() {
  const router = useRouter();
  const { eu } = useEu();
  const fin = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const [aba, setAba] = useState<Aba>('vendas');
  const [periodo, setPeriodo] = useState('30');
  const [agrupar, setAgrupar] = useState('dia');
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const a = q.get('aba');
    if (a && a in ABAS) setAba(a as Aba);
  }, []);
  const p = useMemo(() => PERIODOS[periodo](), [periodo]);
  const qs = `de=${p.de}&ate=${p.ate}`;
  const vendas = useDados<Vendas>(aba === 'vendas' ? `/equipe/relatorios/vendas?${qs}&agrupar=${agrupar}` : null);
  const produtos = useDados<Produtos>(aba === 'produtos' ? `/equipe/relatorios/produtos?${qs}` : null);
  const clientes = useDados<Clientes>(aba === 'clientes' ? `/equipe/relatorios/clientes?${qs}` : null);
  const erro = vendas.erro ?? produtos.erro ?? clientes.erro;
  const trocar = (a: Aba) => { setAba(a); history.replaceState(null, '', `?aba=${a}`); };
  const abas = (Object.keys(ABAS) as Aba[]).filter((a) => a !== 'financeiro' || fin);
  const janelaPropria = aba === 'pedidos' || aba === 'financeiro';

  return (
    <>
      <div className="pn-cabecalho">
        <div><h1>Relatórios</h1><p className="sub muted">Pedidos cancelados não contam como venda. Valores do período escolhido, no fuso de Brasília.</p></div>
        <div className="pn-cabecalho-acoes" style={{ display: janelaPropria ? 'none' : 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select style={{ width: 'auto' }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">{Object.entries(ROTULO_PERIODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {aba === 'vendas' && <select style={{ width: 'auto' }} value={agrupar} onChange={(e) => setAgrupar(e.target.value)} aria-label="Agrupar">{Object.entries(AGRUPAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        </div>
      </div>
      <div className="pn-abas nao-imprimir" role="tablist" style={{ marginBottom: 16 }}>
        {abas.map((a) => <button key={a} role="tab" aria-selected={aba === a} className={`botao ${aba === a ? '' : 'leve'}`} onClick={() => trocar(a)}>{ABAS[a]}</button>)}
      </div>
      <Aviso tipo="erro">{erro}</Aviso>

      {aba === 'pedidos' && <RelatorioPedidos />}
      {aba === 'financeiro' && fin && <RelatorioFinanceiro />}

      {aba === 'vendas' && (!vendas.dados ? <Carregando /> : (
        <>
          <Numeros itens={[
            ['Vendas', reais(vendas.dados.totais.vendas_centavos)], ['Pedidos', String(vendas.dados.totais.pedidos)], ['Ticket médio', reais(vendas.dados.totais.ticket_medio_centavos)],
            ['Reembolsos', reais(vendas.dados.totais.reembolsos_centavos)], ['Líquido', reais(vendas.dados.totais.liquido_centavos)],
            ['Cancelados', `${vendas.dados.totais.cancelados.pedidos} · ${reais(vendas.dados.totais.cancelados.valor_centavos)}`],
          ]} />
          <div className="pn-dupla" style={{ marginBottom: 16 }}>
            <section className="pn-caixa" style={{ padding: 18 }}>
              <b>Vendas {AGRUPAR[agrupar].toLowerCase()}</b>
              <GraficoVendas titulo="Vendas no período" resumo={reais(vendas.dados.totais.vendas_centavos)} pontos={vendas.dados.serie.map((l) => ({ tempo: l.periodo, rotulo: rotuloPeriodo(l.periodo, agrupar), valor: l.vendas_centavos, dica: `${rotuloPeriodo(l.periodo, agrupar)}: ${reais(l.vendas_centavos)} em ${l.pedidos} pedido(s)` }))} />
            </section>
            <section className="pn-caixa" style={{ padding: 18 }}>
              <b>Por forma de pagamento</b>
              <table style={{ marginBottom: 14 }}><tbody>{vendas.dados.por_forma.map((f) => <tr key={f.chave}><td>{FORMA[f.chave] ?? f.chave}</td><td className="direita">{f.pedidos}</td><td className="direita"><b>{reais(f.vendas_centavos)}</b></td></tr>)}</tbody></table>
              <b>Por tipo de cliente</b>
              <table><tbody>{vendas.dados.por_tipo_cliente.map((f) => <tr key={f.chave}><td>{NOMES_TIPO[f.chave] ?? f.chave}</td><td className="direita">{f.pedidos}</td><td className="direita"><b>{reais(f.vendas_centavos)}</b></td></tr>)}</tbody></table>
            </section>
          </div>
          <Grade titulo="" linhas={vendas.dados.serie.filter((l) => l.pedidos || l.reembolsos_centavos)} colunas={COL_VENDAS(agrupar)} chave={(l) => l.periodo}
            ordemInicial={{ chave: 'periodo', dir: 'desc' }} nomeArquivo={`relatorio-vendas-${p.de}-a-${p.ate}`} vazio="Nenhuma venda no período." />
        </>
      ))}

      {aba === 'produtos' && (!produtos.dados ? <Carregando /> : (
        <>
          <Numeros itens={[
            ['Vendas', reais(produtos.dados.totais.vendas_centavos)], ['Produtos vendidos', String(produtos.dados.totais.produtos_vendidos)],
            ['Unidades', produtos.dados.totais.quantidade.toLocaleString('pt-BR')], ['Ativos sem venda', String(produtos.dados.totais.produtos_sem_venda)],
          ]} />
          <section className="pn-caixa" style={{ padding: 18, marginBottom: 16 }}>
            <b>Vendas por categoria</b>
            <GraficoVendas titulo="Vendas por categoria" pontos={produtos.dados.categorias.slice(0, 12).map((c) => ({ rotulo: c.categoria.split(' ')[0], valor: c.vendas_centavos, dica: `${c.categoria}: ${reais(c.vendas_centavos)} (${c.produtos} produto(s))` }))} />
          </section>
          <Grade titulo="" linhas={produtos.dados.produtos} colunas={COL_PRODUTOS} chave={(l) => l.produto_id} aoClicar={(l) => router.push(`/painel/produto/?id=${l.produto_id}`)}
            ordemInicial={{ chave: 'vendas_centavos', dir: 'desc' }} nomeArquivo={`relatorio-produtos-${p.de}-a-${p.ate}`} vazio="Nenhum produto vendido no período." />
        </>
      ))}

      {aba === 'clientes' && (!clientes.dados ? <Carregando /> : (
        <>
          <Numeros itens={[
            ['Vendas', reais(clientes.dados.totais.vendas_centavos)], ['Empresas que compraram', `${clientes.dados.totais.compraram} de ${clientes.dados.totais.empresas}`],
            ['Primeira compra no período', String(clientes.dados.totais.primeira_compra_no_periodo)], ['Empresas cadastradas no período', String(clientes.dados.totais.novas_empresas)],
          ]} />
          <Grade titulo="" linhas={clientes.dados.clientes} colunas={COL_CLIENTES} chave={(l) => l.empresa_id} aoClicar={(l) => router.push(`/painel/empresa/?id=${l.empresa_id}`)}
            ordemInicial={{ chave: 'vendas_centavos', dir: 'desc' }} nomeArquivo={`relatorio-clientes-${p.de}-a-${p.ate}`} />
        </>
      ))}
    </>
  );
}
