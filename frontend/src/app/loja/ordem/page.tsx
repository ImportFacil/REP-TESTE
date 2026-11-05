'use client';
import Link from 'next/link';
import { CorpoOrdem, type Ordem } from '@/components/Importacao';
import { Aviso, Cabecalho, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { MODALIDADE } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

export default function OrdemCliente() {
  const id = useParametro('id');
  const { dados: o, erro, recarregar } = useDados<Ordem>(id ? `/ordens/${id}` : null);
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!o) return <Carregando />;
  return (
    <>
      <p className="pequeno"><Link href="/loja/ordens/">‹ Ordens de importação</Link></p>
      <Cabecalho titulo={`Ordem ${o.id}`} sub={MODALIDADE[o.modalidade]} />
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <CorpoOrdem
        o={o}
        acoesNumerario={(n) => n.situacao === 'aguardando' && n.cobranca?.situacao !== 'pendente' ? (
          <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void acao.executar(async () => { await api(`/numerarios/${n.id}/novo-pix`, { metodo: 'POST' }); await recarregar(); })}>Gerar novo Pix</button>
        ) : null}
      />
    </>
  );
}
