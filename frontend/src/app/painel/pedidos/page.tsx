'use client';
import { useRouter } from 'next/navigation';
import { useEu } from '@/components/Shell';
import { FiltroJanela, useJanela } from '@/components/painel/FiltroJanela';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { FORMA, NOMES_TIPO, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO, dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; razao_social: string; tipo_cliente: string; criado_em: string; forma_pagamento: string; parcelas: number; total_centavos: number; situacao: string; situacao_pagamento: string; ordem_compra: string | null; cotacao_id: number | null }

const COLUNAS: Coluna<Linha>[] = [
  { chave: 'id', titulo: 'Nº', ordenavel: true, render: (p) => <b>{p.id}</b> },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes',
    render: (p) => <>{p.razao_social}{(p.ordem_compra || p.cotacao_id) && <div className="pequeno muted">{p.ordem_compra ? `OC ${p.ordem_compra}` : ''}{p.ordem_compra && p.cotacao_id ? ' · ' : ''}{p.cotacao_id ? `cotação ${p.cotacao_id}` : ''}</div>}</> },
  { chave: 'ordem_compra', titulo: 'Ordem de compra', filtro: 'texto', oculta: true },
  { chave: 'tipo_cliente', titulo: 'Perfil', filtro: 'opcoes', opcoes: NOMES_TIPO, render: (p) => NOMES_TIPO[p.tipo_cliente] ?? p.tipo_cliente, valorCsv: (p) => NOMES_TIPO[p.tipo_cliente] ?? p.tipo_cliente },
  { chave: 'criado_em', titulo: 'Data e hora', ordenavel: true, filtro: 'data', render: (p) => dataHora(p.criado_em), valorCsv: (p) => dataHora(p.criado_em) },
  { chave: 'forma_pagamento', titulo: 'Pagamento', filtro: 'opcoes', opcoes: FORMA,
    render: (p) => <>{FORMA[p.forma_pagamento]}{p.forma_pagamento !== 'pix' ? ` ${p.parcelas}×` : ''}</>, valorCsv: (p) => `${FORMA[p.forma_pagamento]} ${p.parcelas}x` },
  { chave: 'situacao_pagamento', titulo: 'Situação do pagamento', filtro: 'opcoes', opcoes: SITUACAO_PAGAMENTO,
    render: (p) => <Situacao valor={p.situacao_pagamento} nomes={SITUACAO_PAGAMENTO} />, valorCsv: (p) => SITUACAO_PAGAMENTO[p.situacao_pagamento] },
  { chave: 'situacao', titulo: 'Situação do pedido', filtro: 'opcoes', opcoes: SITUACAO_PEDIDO,
    render: (p) => <Situacao valor={p.situacao} nomes={SITUACAO_PEDIDO} />, valorCsv: (p) => SITUACAO_PEDIDO[p.situacao] },
  { chave: 'total_centavos', titulo: 'Total', ordenavel: true, direita: true, filtro: 'numero', valor: (p) => p.total_centavos,
    render: (p) => reais(p.total_centavos), valorCsv: (p) => (p.total_centavos / 100).toFixed(2).replace('.', ',') },
];

export default function PedidosPainel() {
  const router = useRouter();
  const { eu } = useEu();
  const { janela, mudar, consulta, pronto } = useJanela('todos', true);
  const { dados, carregando, recarregar } = useDados<{ itens: Linha[]; total: number; janela: { rotulo: string } | null }>(pronto ? `/equipe/pedidos?por_pagina=1000&${consulta}` : null);
  const fin = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const emLote = async (linhas: Linha[], caminho: (p: Linha) => string) => {
    const erros: string[] = [];
    for (const p of linhas) await api(caminho(p), { metodo: 'POST' }).catch((e: Error) => erros.push(`Nº ${p.id}: ${e.message}`));
    await recarregar();
    if (erros.length) throw new Error(`Alguns pedidos não mudaram. ${erros.slice(0, 3).join(' · ')}${erros.length > 3 ? ` (+${erros.length - 3})` : ''}`);
  };
  return (
    <Grade
      titulo="Pedidos"
      sub={dados ? `${dados.total} pedido(s)${dados.janela ? ` · ${dados.janela.rotulo}` : ''}${janela.tipo ? ` · ${NOMES_TIPO[janela.tipo]}` : ''}, dos mais recentes para os mais antigos${dados.total > 1000 ? ' (os 1.000 mais recentes aparecem aqui; use o período para ver os outros)' : ''}` : ' '}
      topo={<FiltroJanela janela={janela} mudar={mudar} comTodos />}
      linhas={dados?.itens}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(p) => p.id}
      aoClicar={(p) => router.push(`/painel/pedido/?id=${p.id}`)}
      ordemInicial={{ chave: 'criado_em', dir: 'desc' }}
      nomeArquivo="pedidos"
      vazio="Nenhum pedido."
      acoesLote={[
        { rotulo: 'Avançar para a próxima etapa', confirmar: 'Avançar {n} pedido(s) para a próxima etapa (separação, envio ou entrega)?', executar: (l) => emLote(l, (p) => `/equipe/pedidos/${p.id}/avancar`) },
        ...(fin ? [{ rotulo: 'Faturar boletos', confirmar: 'Faturar {n} pedido(s) no boleto? As parcelas são emitidas na hora.', executar: (l: Linha[]) => emLote(l.filter((p) => p.situacao_pagamento === 'aguardando_faturamento'), (p) => `/equipe/pedidos/${p.id}/faturar`) }] : []),
      ]}
    />
  );
}
