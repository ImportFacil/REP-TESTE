'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CorpoOrcamento, type Orcamento } from '@/components/Importacao';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

export default function OrcamentoCliente() {
  const router = useRouter();
  const { eu } = useEu();
  const id = useParametro('id');
  const { dados: o, erro, recarregar } = useDados<Orcamento>(id ? `/orcamentos/${id}` : null);
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!o) return <Carregando />;
  const decidir = (aceitar: boolean) =>
    acao.executar(async () => {
      const r = await api<{ ordem_id: number | null }>(`/orcamentos/${o.id}/${aceitar ? 'aceitar' : 'recusar'}`, { metodo: 'POST' });
      if (r.ordem_id) router.push(`/loja/ordem/?id=${r.ordem_id}`);
      else await recarregar();
    });
  return (
    <>
      <p className="pequeno"><Link href="/loja/orcamentos/">‹ Orçamentos</Link></p>
      <Cabecalho titulo={`Orçamento ${o.id}`}>
        {o.situacao === 'enviado' && eu.usuario.papel === 'aprovador' && (
          <>
            <button className="botao" disabled={acao.enviando} onClick={() => void decidir(true)}>Aceitar proposta</button>
            <button className="botao secundario" disabled={acao.enviando} onClick={() => void decidir(false)}>Recusar</button>
          </>
        )}
        {o.ordem_id && <Link className="botao secundario" href={`/loja/ordem/?id=${o.ordem_id}`}>Ver ordem de importação</Link>}
      </Cabecalho>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      {o.situacao === 'solicitado' && <Aviso tipo="info">A equipe comercial está preparando a proposta.</Aviso>}
      {o.situacao === 'enviado' && eu.usuario.papel !== 'aprovador' && <Aviso tipo="info">O aprovador da empresa aceita ou recusa a proposta.</Aviso>}
      <div style={{ marginTop: 12 }}><CorpoOrcamento o={o} /></div>
    </>
  );
}
