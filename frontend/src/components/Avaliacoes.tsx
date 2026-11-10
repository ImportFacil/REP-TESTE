'use client';
import { useState } from 'react';
import { Estrelas } from '@/components/Estrelas';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { data } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Resumo {
  media: number | null; total: number; distribuicao: number[];
  avaliacoes: Array<{ id: number; nota: number; titulo: string; comentario: string; compra_verificada: boolean; criado_em: string; autor: string }>;
  minha: null | { nota: number; titulo: string; comentario: string; situacao: string; motivo_recusa: string | null };
}

const SITUACAO_MINHA: Record<string, string> = { pendente: 'Aguardando moderação', aprovada: 'Publicada', recusada: 'Recusada' };

/** Avaliações do produto na loja: média, distribuição, comentários aprovados e o formulário do cliente. */
export function Avaliacoes({ produtoId }: { produtoId: number }) {
  const { dados: r, recarregar } = useDados<Resumo>(`/catalogo/produtos/${produtoId}/avaliacoes`);
  const [nota, setNota] = useState(0);
  const [titulo, setTitulo] = useState('');
  const [comentario, setComentario] = useState('');
  const acao = useAcao();
  if (!r) return null;
  const enviar = () => acao.executar(async () => {
    await api(`/catalogo/produtos/${produtoId}/avaliacoes`, { corpo: { nota, titulo, comentario } });
    await recarregar();
  }, 'Obrigado! A avaliação aparece aqui depois da moderação.');

  return (
    <section className="cartao pilha" style={{ marginTop: 16 }} aria-labelledby="titulo-avaliacoes">
      <h2 id="titulo-avaliacoes" style={{ margin: 0 }}>Avaliações</h2>
      <div className="grade grade-2" style={{ alignItems: 'start' }}>
        <div className="pilha" style={{ gap: 6 }}>
          {r.media === null ? <p className="muted" style={{ margin: 0 }}>Ainda sem avaliações publicadas.</p> : (
            <>
              <div className="linha"><span style={{ fontSize: '2rem', fontWeight: 700 }}>{r.media.toLocaleString('pt-BR')}</span><Estrelas nota={r.media} tamanho={20} /></div>
              <span className="pequeno muted">{r.total} avaliação(ões)</span>
              {[5, 4, 3, 2, 1].map((n) => {
                const q = r.distribuicao[n - 1];
                return (
                  <div key={n} className="linha pequeno" style={{ gap: 8 }}>
                    <span style={{ width: 14 }}>{n}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--borda)' }} aria-hidden="true">
                      <div style={{ width: `${r.total ? (q / r.total) * 100 : 0}%`, height: '100%', borderRadius: 4, background: 'var(--ambar)' }} />
                    </div>
                    <span className="muted" style={{ width: 24, textAlign: 'right' }}>{q}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div>
          {r.minha ? (
            <div className="pilha" style={{ gap: 6 }}>
              <div className="linha entre"><b>Sua avaliação</b><Situacao valor={r.minha.situacao} nomes={SITUACAO_MINHA} /></div>
              <Estrelas nota={r.minha.nota} />
              <b>{r.minha.titulo}</b>
              <p style={{ margin: 0 }}>{r.minha.comentario}</p>
              {r.minha.motivo_recusa && <p className="pequeno" style={{ color: 'var(--vermelho)', margin: 0 }}>Motivo: {r.minha.motivo_recusa}</p>}
            </div>
          ) : (
            <form className="formulario" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
              <b>Avaliar este produto</b>
              <Estrelas nota={nota} aoEscolher={setNota} tamanho={24} />
              <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={120} /></Campo>
              <Campo rotulo="Comentário" dica="Como foi a entrega, a qualidade, o uso."><textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} required minLength={10} maxLength={2000} /></Campo>
              <Aviso tipo="erro">{acao.erro}</Aviso>
              <button className="botao" disabled={acao.enviando || nota === 0}>Enviar avaliação</button>
            </form>
          )}
          <Aviso tipo="ok">{acao.ok}</Aviso>
        </div>
      </div>
      {r.avaliacoes.length > 0 && (
        <ul className="pilha" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {r.avaliacoes.map((a) => (
            <li key={a.id} style={{ borderTop: '1px solid var(--borda)', paddingTop: 12 }}>
              <div className="linha" style={{ gap: 8 }}><Estrelas nota={a.nota} /><b>{a.titulo}</b></div>
              <p style={{ margin: '6px 0' }}>{a.comentario}</p>
              <span className="pequeno muted">{a.autor} · {data(a.criado_em)}{a.compra_verificada ? ' · Compra verificada' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
