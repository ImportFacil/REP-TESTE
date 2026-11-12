'use client';
import { useRouter } from 'next/navigation';
import { FiltroJanela, useJanela } from '@/components/painel/FiltroJanela';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Aviso, Carregando, Situacao } from '@/components/ui';
import { cnpj, NOMES_TIPO, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Cliente {
  empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; situacao_empresa: string; faixa: string | null; limite_centavos: number;
  pedidos: number; vendas_centavos: number; recebido_centavos: number; pagamentos: number; reembolsos_centavos: number; aberto_centavos: number; vencido_centavos: number;
  a_vencer_7d_centavos: number; maior_atraso_dias: number; credito_usado_centavos: number; credito_disponivel_centavos: number;
}
interface Relatorio {
  janela: { rotulo: string };
  totais: { empresas: number; pedidos: number; vendas_centavos: number; recebido_centavos: number; reembolsos_centavos: number; aberto_centavos: number; vencido_centavos: number; a_vencer_7d_centavos: number; limite_centavos: number; credito_disponivel_centavos: number; empresas_com_atraso: number };
  por_tipo: Array<{ tipo_cliente: string; empresas: number; vendas_centavos: number; recebido_centavos: number; aberto_centavos: number; vencido_centavos: number }>;
  clientes: Cliente[];
}
const csv = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const din = (k: keyof Cliente & string, titulo: string, extra: Partial<Coluna<Cliente>> = {}): Coluna<Cliente> => ({ chave: k, titulo, ordenavel: true, direita: true, render: (c) => reais(c[k] as number), valorCsv: (c) => csv(c[k] as number), ...extra });

const COLUNAS: Coluna<Cliente>[] = [
  { chave: 'razao_social', titulo: 'Cliente', ordenavel: true, render: (c) => <><b>{c.razao_social}</b><div className="pequeno muted">{NOMES_TIPO[c.tipo_cliente]} · {cnpj(c.cnpj)}{c.faixa ? ` · faixa ${c.faixa}` : ''}</div></> },
  { chave: 'tipo_cliente', titulo: 'Perfil', filtro: 'opcoes', opcoes: NOMES_TIPO, oculta: true, valorCsv: (c) => NOMES_TIPO[c.tipo_cliente] },
  { chave: 'pedidos', titulo: 'Pedidos', ordenavel: true, direita: true },
  din('vendas_centavos', 'Vendido'),
  din('recebido_centavos', 'Recebido', { render: (c) => <span style={{ color: c.recebido_centavos ? 'var(--verde)' : undefined }}>{reais(c.recebido_centavos)}</span> }),
  din('reembolsos_centavos', 'Reembolsos', { oculta: true }),
  din('aberto_centavos', 'Em aberto hoje'),
  din('vencido_centavos', 'Vencido', { render: (c) => (c.vencido_centavos ? <b style={{ color: 'var(--vermelho)' }}>{reais(c.vencido_centavos)}</b> : '—') }),
  din('a_vencer_7d_centavos', 'Vence em 7 dias'),
  { chave: 'maior_atraso_dias', titulo: 'Maior atraso', ordenavel: true, direita: true, filtro: 'numero', render: (c) => (c.maior_atraso_dias ? `${c.maior_atraso_dias} dia(s)` : '—') },
  din('limite_centavos', 'Limite de crédito', { oculta: true }),
  din('credito_disponivel_centavos', 'Crédito disponível'),
  { chave: 'situacao_empresa', titulo: 'Cadastro', filtro: 'opcoes', render: (c) => <Situacao valor={c.situacao_empresa} /> },
];

/** Financeiro de todos os clientes: vendido e recebido na janela (24/48/72 horas, semana, mês, período) e a posição de hoje. */
export function RelatorioFinanceiro() {
  const router = useRouter();
  const { janela, mudar, consulta, pronto } = useJanela('24h');
  const { dados: r, erro } = useDados<Relatorio>(pronto ? `/equipe/relatorios/financeiro?${consulta}` : null);
  return (
    <>
      <FiltroJanela janela={janela} mudar={mudar} />
      <Aviso tipo="erro">{erro}</Aviso>
      {!r ? <Carregando /> : (
        <>
          <div className="linha entre" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Financeiro · {r.janela.rotulo} · {janela.tipo ? NOMES_TIPO[janela.tipo] : 'todos os clientes'}</h2>
            <button className="botao secundario nao-imprimir" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>
          </div>
          <div className="pn-numeros" style={{ marginBottom: 16 }}>
            {([
              ['Vendido no período', reais(r.totais.vendas_centavos)], ['Recebido no período', reais(r.totais.recebido_centavos), 'var(--verde)'],
              ['Em aberto hoje', reais(r.totais.aberto_centavos)], ['Vencido hoje', reais(r.totais.vencido_centavos), r.totais.vencido_centavos ? 'var(--vermelho)' : undefined],
              ['Vence nos próximos 7 dias', reais(r.totais.a_vencer_7d_centavos)], ['Clientes com atraso', `${r.totais.empresas_com_atraso} de ${r.totais.empresas}`],
              ['Crédito disponível', reais(r.totais.credito_disponivel_centavos)],
            ] as Array<[string, string, string?]>).map(([rotulo, valor, cor]) => <div key={rotulo} className="pn-numero"><span><strong style={cor ? { color: cor } : undefined}>{valor}</strong><small>{rotulo}</small></span></div>)}
          </div>
          <p className="pequeno muted">Vendido e recebido: só o que aconteceu no período. Em aberto, vencido, atraso e crédito: a posição de hoje, de pedidos e de numerários de importação.</p>
          {!janela.tipo && (
            <section className="pn-caixa tabela-rolagem" style={{ padding: 18, marginBottom: 16 }}>
              <b>Por perfil de cliente</b>
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>Perfil</th><th className="direita">Clientes</th><th className="direita">Vendido</th><th className="direita">Recebido</th><th className="direita">Em aberto</th><th className="direita">Vencido</th></tr></thead>
                <tbody>{r.por_tipo.map((t) => (
                  <tr key={t.tipo_cliente}><td>{NOMES_TIPO[t.tipo_cliente]}</td><td className="direita">{t.empresas}</td><td className="direita">{reais(t.vendas_centavos)}</td>
                    <td className="direita">{reais(t.recebido_centavos)}</td><td className="direita">{reais(t.aberto_centavos)}</td><td className="direita">{reais(t.vencido_centavos)}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
          <div className="nao-imprimir">
            <Grade titulo="Clientes" linhas={r.clientes} colunas={COLUNAS} chave={(c) => c.empresa_id} aoClicar={(c) => router.push(`/painel/empresa/?id=${c.empresa_id}`)}
              ordemInicial={{ chave: 'vencido_centavos', dir: 'desc' }} porPaginaInicial={20} nomeArquivo={`financeiro-clientes-${r.janela.rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
          </div>
          <section className="so-impressao">
            <table className="impressao">
              <thead><tr><th>Cliente</th><th>Perfil</th><th>Pedidos</th><th>Vendido</th><th>Recebido</th><th>Em aberto</th><th>Vencido</th><th>Atraso</th><th>Crédito disponível</th></tr></thead>
              <tbody>{r.clientes.map((c) => (
                <tr key={c.empresa_id}><td>{c.razao_social}</td><td>{NOMES_TIPO[c.tipo_cliente]}</td><td>{c.pedidos}</td><td>{reais(c.vendas_centavos)}</td><td>{reais(c.recebido_centavos)}</td>
                  <td>{reais(c.aberto_centavos)}</td><td>{reais(c.vencido_centavos)}</td><td>{c.maior_atraso_dias ? `${c.maior_atraso_dias} d` : '—'}</td><td>{reais(c.credito_disponivel_centavos)}</td></tr>
              ))}</tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
