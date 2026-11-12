'use client';
import { useRouter } from 'next/navigation';
import { FiltroJanela, useJanela } from '@/components/painel/FiltroJanela';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Aviso, Carregando, Situacao } from '@/components/ui';
import { cnpj, dataHora, FORMA, NOMES_TIPO, reais, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface PedidoRel {
  id: number; criado_em: string; empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; comprador: string; situacao: string; situacao_pagamento: string;
  forma_pagamento: string; parcelas: number; ordem_compra: string | null; subtotal_centavos: number; promocao_centavos: number; desconto_centavos: number; juros_centavos: number;
  total_centavos: number; pago_centavos: number; aberto_centavos: number; vencido_centavos: number; reembolsado_centavos: number; a_faturar_centavos: number; unidades: number; descricao: string;
  itens: Array<{ codigo: string; nome: string; quantidade: number; unidade: string; preco_unitario_centavos: number; total_centavos: number }>;
}
interface Soma { pedidos: number; unidades: number; vendas_centavos: number; descontos_centavos: number; pago_centavos: number; aberto_centavos: number; a_faturar_centavos: number; vencido_centavos: number; reembolsado_centavos: number; ticket_medio_centavos: number }
interface PorCliente extends Soma { empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; ultimo_pedido: string }
interface Relatorio { janela: { rotulo: string }; totais: Soma & { cancelados: number; cancelados_centavos: number }; por_cliente: PorCliente[]; por_tipo: Array<Soma & { tipo_cliente: string }>; pedidos: PedidoRel[] }
export interface Empresa { id: string; razao_social: string; tipo_cliente: string }

const csv = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const valorDe = <T,>(k: keyof T & string, titulo: string, extra: Partial<Coluna<T>> = {}): Coluna<T> => ({
  chave: k, titulo, ordenavel: true, direita: true, render: (l) => reais(l[k] as number), valorCsv: (l) => csv(l[k] as number), ...extra,
});

const COL_CLIENTES: Coluna<PorCliente>[] = [
  { chave: 'razao_social', titulo: 'Cliente', ordenavel: true, render: (c) => <><b>{c.razao_social}</b><div className="pequeno muted">{NOMES_TIPO[c.tipo_cliente]} · {cnpj(c.cnpj)}</div></> },
  { chave: 'tipo_cliente', titulo: 'Perfil', filtro: 'opcoes', opcoes: NOMES_TIPO, oculta: true, valorCsv: (c) => NOMES_TIPO[c.tipo_cliente] },
  { chave: 'pedidos', titulo: 'Pedidos', ordenavel: true, direita: true },
  { chave: 'unidades', titulo: 'Unidades', ordenavel: true, direita: true },
  valorDe<PorCliente>('vendas_centavos', 'Vendas', { render: (c) => <b>{reais(c.vendas_centavos)}</b> }),
  valorDe<PorCliente>('ticket_medio_centavos', 'Ticket médio'),
  valorDe<PorCliente>('pago_centavos', 'Pago'),
  valorDe<PorCliente>('a_faturar_centavos', 'Aguardando cobrança'),
  valorDe<PorCliente>('aberto_centavos', 'Em aberto'),
  valorDe<PorCliente>('vencido_centavos', 'Vencido', { render: (c) => (c.vencido_centavos ? <b style={{ color: 'var(--vermelho)' }}>{reais(c.vencido_centavos)}</b> : '—') }),
  { chave: 'ultimo_pedido', titulo: 'Último pedido', ordenavel: true, render: (c) => dataHora(c.ultimo_pedido) },
];

const COL_PEDIDOS: Coluna<PedidoRel>[] = [
  { chave: 'id', titulo: 'Nº', ordenavel: true, render: (p) => <b>{p.id}</b> },
  { chave: 'criado_em', titulo: 'Data e hora', ordenavel: true, render: (p) => dataHora(p.criado_em), valorCsv: (p) => dataHora(p.criado_em) },
  { chave: 'razao_social', titulo: 'Cliente', ordenavel: true, filtro: 'opcoes', render: (p) => <>{p.razao_social}<div className="pequeno muted">{NOMES_TIPO[p.tipo_cliente]} · {p.comprador}{p.ordem_compra ? ` · OC ${p.ordem_compra}` : ''}</div></> },
  { chave: 'tipo_cliente', titulo: 'Perfil', filtro: 'opcoes', opcoes: NOMES_TIPO, oculta: true, valorCsv: (p) => NOMES_TIPO[p.tipo_cliente] },
  { chave: 'comprador', titulo: 'Comprador', oculta: true },
  { chave: 'ordem_compra', titulo: 'Ordem de compra', oculta: true },
  { chave: 'descricao', titulo: 'Descrição', render: (p) => (
    <ul className="pequeno" style={{ margin: 0, paddingLeft: 16, whiteSpace: 'normal', minWidth: 240 }}>
      {p.itens.map((i, k) => <li key={k}>{i.quantidade} {i.unidade} · {i.nome} <span className="muted">({i.codigo}, {reais(i.preco_unitario_centavos)})</span></li>)}
    </ul>
  ) },
  { chave: 'forma_pagamento', titulo: 'Pagamento', filtro: 'opcoes', opcoes: FORMA, render: (p) => <>{FORMA[p.forma_pagamento]}{p.forma_pagamento !== 'pix' ? ` ${p.parcelas}×` : ''}</>, valorCsv: (p) => `${FORMA[p.forma_pagamento]} ${p.parcelas}x` },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACAO_PEDIDO,
    render: (p) => <><Situacao valor={p.situacao} nomes={SITUACAO_PEDIDO} /><div className="pequeno muted">{SITUACAO_PAGAMENTO[p.situacao_pagamento]}</div></>, valorCsv: (p) => `${SITUACAO_PEDIDO[p.situacao]} / ${SITUACAO_PAGAMENTO[p.situacao_pagamento]}` },
  valorDe<PedidoRel>('subtotal_centavos', 'Produtos', { oculta: true }),
  valorDe<PedidoRel>('total_centavos', 'Total', { render: (p) => <b>{reais(p.total_centavos)}</b> }),
  valorDe<PedidoRel>('pago_centavos', 'Pago'),
  valorDe<PedidoRel>('a_faturar_centavos', 'Aguardando cobrança', { oculta: true }),
  valorDe<PedidoRel>('aberto_centavos', 'Em aberto'),
  valorDe<PedidoRel>('vencido_centavos', 'Vencido', { oculta: true }),
];

function Numeros({ itens }: { itens: Array<[string, string, string?]> }) {
  return (
    <div className="pn-numeros" style={{ marginBottom: 16 }}>
      {itens.map(([rotulo, valor, cor]) => <div key={rotulo} className="pn-numero"><span><strong style={cor ? { color: cor } : undefined}>{valor}</strong><small>{rotulo}</small></span></div>)}
    </div>
  );
}

/**
 * Relatório de pedidos (24/48/72 horas, semana, mês ou período), por cliente ou de todos:
 * totais, um quadro por cliente e o consolidado com a descrição de cada pedido. Exporta e imprime.
 */
export function RelatorioPedidos() {
  const router = useRouter();
  const { janela, mudar, consulta, pronto } = useJanela('24h');
  const empresas = useDados<{ itens: Empresa[] }>('/equipe/empresas?por_pagina=1000');
  const empresa = typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('cliente') ?? '';
  const { dados: r, erro } = useDados<Relatorio>(pronto ? `/equipe/relatorios/pedidos?${consulta}${empresa ? `&empresa_id=${empresa}` : ''}` : null);
  const escolherCliente = (id: string) => {
    const q = new URLSearchParams(location.search);
    if (id) q.set('cliente', id); else q.delete('cliente');
    history.replaceState(null, '', `?${q}`);
    mudar({});
  };
  const nomeCliente = empresas.dados?.itens.find((e) => e.id === empresa)?.razao_social;
  const titulo = `Pedidos · ${r?.janela.rotulo ?? ''}${nomeCliente ? ` · ${nomeCliente}` : janela.tipo ? ` · ${NOMES_TIPO[janela.tipo]}` : ' · todos os clientes'}`;
  const arquivo = `pedidos-${(r?.janela.rotulo ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}${nomeCliente ? `-${nomeCliente.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`;
  return (
    <>
      <FiltroJanela janela={janela} mudar={mudar} extra={
        <select value={empresa} onChange={(e) => escolherCliente(e.target.value)} style={{ width: 'auto', maxWidth: 320 }} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {(empresas.dados?.itens ?? []).filter((e) => !janela.tipo || e.tipo_cliente === janela.tipo).map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
        </select>
      } />
      <Aviso tipo="erro">{erro}</Aviso>
      {!r ? <Carregando /> : (
        <>
          <div className="linha entre" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{titulo}</h2>
            <button className="botao secundario nao-imprimir" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>
          </div>
          <Numeros itens={[
            ['Pedidos', String(r.totais.pedidos)], ['Vendas', reais(r.totais.vendas_centavos)], ['Ticket médio', reais(r.totais.ticket_medio_centavos)],
            ['Pago', reais(r.totais.pago_centavos), 'var(--verde)'], ['Aguardando cobrança (boleto a faturar, Pix expirado)', reais(r.totais.a_faturar_centavos)], ['Em aberto', reais(r.totais.aberto_centavos)],
            ['Vencido', reais(r.totais.vencido_centavos), r.totais.vencido_centavos ? 'var(--vermelho)' : undefined],
            ['Cancelados', `${r.totais.cancelados} · ${reais(r.totais.cancelados_centavos)}`],
          ]} />
          {!empresa && r.por_tipo.length > 1 && (
            <section className="pn-caixa tabela-rolagem" style={{ padding: 18, marginBottom: 16 }}>
              <b>Por perfil de cliente</b>
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>Perfil</th><th className="direita">Pedidos</th><th className="direita">Vendas</th><th className="direita">Pago</th><th className="direita">Aguardando cobrança</th><th className="direita">Em aberto</th><th className="direita">Vencido</th></tr></thead>
                <tbody>{r.por_tipo.map((t) => (
                  <tr key={t.tipo_cliente}><td>{NOMES_TIPO[t.tipo_cliente]}</td><td className="direita">{t.pedidos}</td><td className="direita"><b>{reais(t.vendas_centavos)}</b></td>
                    <td className="direita">{reais(t.pago_centavos)}</td><td className="direita">{reais(t.a_faturar_centavos)}</td><td className="direita">{reais(t.aberto_centavos)}</td><td className="direita">{reais(t.vencido_centavos)}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
          <div className="nao-imprimir pilha" style={{ gap: 28 }}>
            {!empresa && <Grade titulo="Por cliente" linhas={r.por_cliente} colunas={COL_CLIENTES} chave={(c) => c.empresa_id} aoClicar={(c) => escolherCliente(c.empresa_id)}
              ordemInicial={{ chave: 'vendas_centavos', dir: 'desc' }} nomeArquivo={`${arquivo}-por-cliente`} vazio="Nenhum pedido no período." />}
            <Grade titulo="Consolidado de pedidos" sub="Cada pedido com a descrição dos itens. Exportar leva a descrição completa." linhas={r.pedidos} colunas={COL_PEDIDOS} chave={(p) => p.id}
              aoClicar={(p) => router.push(`/painel/pedido/?id=${p.id}`)} ordemInicial={{ chave: 'criado_em', dir: 'desc' }} porPaginaInicial={20} nomeArquivo={arquivo} vazio="Nenhum pedido no período." />
          </div>
          <section className="so-impressao">
            {!empresa && (
              <table className="impressao">
                <thead><tr><th>Cliente</th><th>Perfil</th><th>Pedidos</th><th>Vendas</th><th>Pago</th><th>Aguardando cobrança</th><th>Em aberto</th><th>Vencido</th></tr></thead>
                <tbody>{r.por_cliente.map((c) => <tr key={c.empresa_id}><td>{c.razao_social}</td><td>{NOMES_TIPO[c.tipo_cliente]}</td><td>{c.pedidos}</td><td>{reais(c.vendas_centavos)}</td><td>{reais(c.pago_centavos)}</td><td>{reais(c.a_faturar_centavos)}</td><td>{reais(c.aberto_centavos)}</td><td>{reais(c.vencido_centavos)}</td></tr>)}</tbody>
              </table>
            )}
            <table className="impressao">
              <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Descrição</th><th>Pagamento</th><th>Situação</th><th>Total</th><th>Pago</th><th>Aguardando cobrança</th><th>Em aberto</th></tr></thead>
              <tbody>{r.pedidos.map((p) => (
                <tr key={p.id}><td>{p.id}</td><td>{dataHora(p.criado_em)}</td><td>{p.razao_social}<br />{p.comprador}{p.ordem_compra ? ` · OC ${p.ordem_compra}` : ''}</td><td>{p.descricao}</td>
                  <td>{FORMA[p.forma_pagamento]}{p.forma_pagamento !== 'pix' ? ` ${p.parcelas}×` : ''}</td><td>{SITUACAO_PEDIDO[p.situacao]}</td><td>{reais(p.total_centavos)}</td><td>{reais(p.pago_centavos)}</td><td>{reais(p.a_faturar_centavos)}</td><td>{reais(p.aberto_centavos)}</td></tr>
              ))}</tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
