'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiPublica } from '@/lib/api';

interface PaginaResumo { slug: string; titulo: string; no_rodape: boolean }

/** Rodapé da loja: páginas de conteúdo publicadas e inscrição na newsletter (abertos, sem login). */
export function Rodape() {
  const [paginas, setPaginas] = useState<PaginaResumo[]>([]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { apiPublica<PaginaResumo[]>('/conteudo/paginas').then((p) => setPaginas(p.filter((x) => x.no_rodape))).catch(() => undefined); }, []);

  const inscrever = async () => {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await apiPublica<{ novo: boolean }>('/newsletter', { email });
      setMsg({ ok: true, texto: r.novo ? 'Inscrição feita. Confira o seu e-mail.' : 'Este e-mail já recebe as novidades.' });
      setEmail('');
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <footer className="rodape">
      <div className="rodape-paginas">
        <b>ImportFácil</b>
        <nav aria-label="Páginas institucionais">{paginas.map((p) => <Link key={p.slug} href={`/pagina/?p=${p.slug}`}>{p.titulo}</Link>)}</nav>
      </div>
      <form className="rodape-news" onSubmit={(e) => { e.preventDefault(); void inscrever(); }}>
        <label htmlFor="news-email"><b>Novidades por e-mail</b><span className="pequeno muted">Lançamentos, promoções e chegadas de importação.</span></label>
        <div className="linha">
          <input id="news-email" type="email" required placeholder="seu@email.com.br" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="botao" disabled={enviando}>Inscrever</button>
        </div>
        {msg && <div className="pequeno" role="status" style={{ color: msg.ok ? 'var(--verde)' : 'var(--vermelho)' }}>{msg.texto}</div>}
      </form>
    </footer>
  );
}
