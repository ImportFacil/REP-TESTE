'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Lista { id: number; nome: string; itens: number; atualizado_em: string; criado_por: string | null }

/** Listas de compra da empresa: a reposição de sempre, pronta para mandar ao carrinho. Todos os usuários da empresa usam. */
export default function Listas() {
  const router = useRouter();
  const { dados, erro } = useDados<Lista[]>('/loja/listas');
  const [nome, setNome] = useState('');
  const acao = useAcao();
  const criar = () => acao.executar(async () => {
    const l = await api<{ id: number }>('/loja/listas', { corpo: { nome } });
    router.push(`/loja/lista/?id=${l.id}`);
  });
  return (
    <>
      <Cabecalho titulo="Listas de compra" sub="Listas da empresa (todos os usuários veem e usam). Guarde o carrinho numa lista ou monte a partir do catálogo." />
      <form className="linha cartao" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void criar(); }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da nova lista (ex.: Reposição mensal de EPI)" required minLength={2} maxLength={80} style={{ flex: 1 }} aria-label="Nome da nova lista" />
        <button className="botao" disabled={acao.enviando}>Criar lista</button>
      </form>
      <Aviso tipo="erro">{erro ?? acao.erro}</Aviso>
      {!dados ? <Carregando /> : !dados.length ? <Vazio>Nenhuma lista ainda.</Vazio> : (
        <div className="grade grade-auto">
          {dados.map((l) => (
            <Link key={l.id} href={`/loja/lista/?id=${l.id}`} className="cartao" style={{ textDecoration: 'none', color: 'inherit' }}>
              <b>{l.nome}</b>
              <div className="pequeno muted" style={{ marginTop: 6 }}>{l.itens} produto(s) · atualizada {dataHora(l.atualizado_em)}{l.criado_por ? ` · criada por ${l.criado_por}` : ''}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
