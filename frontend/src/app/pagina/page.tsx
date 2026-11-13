'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { Rodape } from '@/components/Rodape';
import { Carregando } from '@/components/ui';
import { apiPublica } from '@/lib/api';
import { sessaoAtual } from '@/lib/auth';
import { data } from '@/lib/formato';
import { useParametro } from '@/lib/hooks';

interface Pagina { slug: string; titulo: string; resumo: string | null; conteudo: string; atualizado_em: string }
interface Resumo { slug: string; titulo: string; resumo: string | null }

/** Páginas de conteúdo da loja (sobre, políticas, perguntas frequentes), abertas sem login. */
export default function PaginaDeConteudo() {
  const slug = useParametro('p');
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [todas, setTodas] = useState<Resumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [voltar, setVoltar] = useState<{ href: string; rotulo: string }>({ href: '/entrar/', rotulo: 'Entrar' });

  useEffect(() => {
    const s = sessaoAtual();
    if (s) setVoltar(s.origem === 'equipe' ? { href: '/painel/', rotulo: 'Voltar ao Painel' } : { href: '/loja/', rotulo: 'Voltar à loja' });
    apiPublica<Resumo[]>('/conteudo/paginas').then(setTodas).catch(() => setTodas([]));
  }, []);
  useEffect(() => {
    setPagina(null);
    setErro(null);
    if (slug) apiPublica<Pagina>(`/conteudo/paginas/${encodeURIComponent(slug)}`).then((p) => { setPagina(p); document.title = `${p.titulo} · Export Fácil`; }).catch((e: Error) => setErro(e.message));
  }, [slug]);

  return (
    <div className="pagina-aberta">
      <header className="linha entre" style={{ padding: '14px 0', borderBottom: '1px solid var(--borda)', marginBottom: 24 }}>
        <Link href="/pagina/" className="marca" style={{ padding: 0, textDecoration: 'none', color: 'inherit' }}>
          <div className="marca-icone">IF</div>
          <div><b>Export Fácil</b><span>Loja B2B e importação</span></div>
        </Link>
        <Link className="botao secundario" href={voltar.href}>{voltar.rotulo}</Link>
      </header>
      {slug ? (
        erro ? <div className="aviso erro">{erro}</div> : !pagina ? <Carregando /> : (
          <article>
            <p className="pequeno"><Link href="/pagina/">‹ Todas as páginas</Link></p>
            <h1 style={{ marginBottom: 4 }}>{pagina.titulo}</h1>
            {pagina.resumo && <p className="sub muted" style={{ marginTop: 0 }}>{pagina.resumo}</p>}
            <Markdown texto={pagina.conteudo} />
            <p className="pequeno muted">Atualizada em {data(pagina.atualizado_em)}.</p>
          </article>
        )
      ) : (
        <>
          <h1>Informações</h1>
          {!todas ? <Carregando /> : (
            <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
              {todas.map((p) => (
                <Link key={p.slug} href={`/pagina/?p=${p.slug}`} className="cartao" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <b>{p.titulo}</b>
                  {p.resumo && <p className="pequeno muted" style={{ margin: '6px 0 0' }}>{p.resumo}</p>}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      <Rodape />
    </div>
  );
}
