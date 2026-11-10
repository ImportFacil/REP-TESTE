'use client';
import Link from 'next/link';
import { useEu } from '@/components/Shell';
import { Cabecalho, Indicador } from '@/components/ui';
import { reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

export default function InicioPainel() {
  const { eu } = useEu();
  const fin = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const analise = useDados<unknown[]>('/equipe/credito?situacao=em_analise');
  const faturar = useDados<{ total: number }>('/equipe/pedidos?situacao_pagamento=aguardando_faturamento&por_pagina=1');
  const separar = useDados<{ total: number }>('/equipe/pedidos?situacao=novo&situacao_pagamento=pago&por_pagina=1');
  const orcamentos = useDados<unknown[]>('/equipe/orcamentos?situacao=solicitado');
  const ordens = useDados<unknown[]>('/equipe/ordens?abertas=true');
  const receb = useDados<{ total_vencido_centavos: number; vencidas: unknown[] }>(fin ? '/equipe/recebiveis' : null);
  return (
    <>
      <Cabecalho titulo={`Olá, ${eu.usuario.nome.split(' ')[0]}`} sub="O que pede atenção hoje." />
      <div className="grade grade-3">
        <Link href="/painel/credito/" className="sem-sublinhado"><Indicador rotulo="Cadastros de crédito em análise" valor={analise.dados?.length ?? '…'} /></Link>
        <Link href="/painel/pedidos/?situacao_pagamento=aguardando_faturamento"><Indicador rotulo="Pedidos no boleto para faturar" valor={faturar.dados?.total ?? '…'} /></Link>
        <Link href="/painel/pedidos/?situacao=novo&situacao_pagamento=pago"><Indicador rotulo="Pedidos pagos para separar" valor={separar.dados?.total ?? '…'} /></Link>
        <Link href="/painel/orcamentos/"><Indicador rotulo="Orçamentos aguardando proposta" valor={orcamentos.dados?.length ?? '…'} /></Link>
        <Link href="/painel/ordens/"><Indicador rotulo="Ordens de importação em andamento" valor={ordens.dados?.length ?? '…'} /></Link>
        {fin && <Link href="/painel/recebiveis/"><Indicador rotulo="Vencido a receber" valor={receb.dados ? reais(receb.dados.total_vencido_centavos) : '…'} detalhe={receb.dados ? `${receb.dados.vencidas.length} parcela(s)` : undefined} /></Link>}
      </div>
    </>
  );
}
