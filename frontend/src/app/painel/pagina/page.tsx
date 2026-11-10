'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { useEu } from '@/components/Shell';
import { Aviso, Campo, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Pagina { id: number; slug: string; titulo: string; resumo: string | null; conteudo: string; publicada: boolean; no_rodape: boolean; ordem: number }
const NOVA: Pagina = { id: 0, slug: '', titulo: '', resumo: '', conteudo: '## Título da seção\n\nTexto do parágrafo.\n\n- Item da lista\n- Outro item', publicada: false, no_rodape: true, ordem: 100 };

/** Editor de página de conteúdo: texto em Markdown simples, com a prévia como fica na loja. */
export default function EditarPagina() {
  const id = useParametro('id');
  const novo = useParametro('novo') === '1';
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados: paginas } = useDados<Pagina[]>('/equipe/conteudo/paginas');
  const [p, setP] = useState<Pagina | null>(null);
  const acao = useAcao();

  useEffect(() => {
    if (novo) setP({ ...NOVA });
    else if (paginas && id) { const x = paginas.find((q) => String(q.id) === id); if (x) setP({ ...x, resumo: x.resumo ?? '' }); }
  }, [paginas, id, novo]);

  if (paginas && !novo && id && !paginas.some((q) => String(q.id) === id)) return <Aviso tipo="erro">Página não encontrada.</Aviso>;
  if (!p) return <Carregando />;
  const muda = (m: Partial<Pagina>) => setP({ ...p, ...m });
  const salvar = () => acao.executar(async () => {
    const corpo = { titulo: p.titulo, resumo: p.resumo || undefined, conteudo: p.conteudo, publicada: p.publicada, no_rodape: p.no_rodape, ordem: Number(p.ordem) };
    if (novo) {
      const r = await api<Pagina>('/equipe/conteudo/paginas', { corpo: { ...corpo, slug: p.slug || undefined } });
      router.replace(`/painel/pagina/?id=${r.id}`);
    } else {
      await api(`/equipe/conteudo/paginas/${p.id}`, { metodo: 'PATCH', corpo });
    }
  }, novo ? 'Página criada' : 'Página salva');

  return (
    <>
      <p className="pequeno"><Link href="/painel/paginas/">‹ Páginas</Link></p>
      <div className="pn-cabecalho">
        <div>
          <h1>{novo ? 'Criar página' : p.titulo}</h1>
          {!novo && <p className="sub muted">{p.publicada ? <><Link href={`/pagina/?p=${p.slug}`} target="_blank">/pagina/?p={p.slug}</Link> · publicada</> : 'Rascunho: só a equipe vê'}</p>}
        </div>
        <div className="pn-cabecalho-acoes">{pode && <button className="botao" disabled={acao.enviando || !p.titulo || !p.conteudo.trim()} onClick={() => void salvar()}>{novo ? 'Criar página' : 'Salvar página'}</button>}</div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      <div className="pn-dupla" style={{ marginTop: 12 }}>
        <fieldset disabled={!pode} className="pn-caixa formulario" style={{ padding: 18, margin: 0 }}>
          <div className="grade grade-2">
            <Campo rotulo="Título"><input value={p.titulo} onChange={(e) => muda({ titulo: e.target.value })} required maxLength={120} /></Campo>
            <Campo rotulo="Endereço" dica={novo ? 'Vazio: sai do título. Não muda depois.' : 'Não muda (links já divulgados continuam valendo)'}>
              <input value={p.slug} onChange={(e) => muda({ slug: e.target.value.toLowerCase() })} disabled={!novo} pattern="[a-z0-9\-]{2,60}" placeholder="sai-do-titulo" />
            </Campo>
          </div>
          <Campo rotulo="Resumo" dica="Aparece no índice das páginas"><input value={p.resumo ?? ''} onChange={(e) => muda({ resumo: e.target.value })} maxLength={300} /></Campo>
          <Campo rotulo="Conteúdo" dica='"## " para título, "- " para lista, **negrito**, [texto](endereço)'>
            <textarea rows={18} value={p.conteudo} onChange={(e) => muda({ conteudo: e.target.value })} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem' }} />
          </Campo>
          <div className="linha" style={{ flexWrap: 'wrap', gap: 16 }}>
            <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={p.publicada} onChange={(e) => muda({ publicada: e.target.checked })} /> Publicada</label>
            <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={p.no_rodape} onChange={(e) => muda({ no_rodape: e.target.checked })} /> No rodapé da loja</label>
            <label className="linha">Ordem <input type="number" min={0} value={p.ordem} onChange={(e) => muda({ ordem: Number(e.target.value) })} style={{ width: 90 }} /></label>
          </div>
        </fieldset>
        <section className="pn-caixa" style={{ padding: 18 }} aria-label="Prévia">
          <div className="pequeno muted" style={{ marginBottom: 8 }}>Prévia</div>
          <h1 style={{ marginTop: 0 }}>{p.titulo || 'Sem título'}</h1>
          {p.resumo && <p className="sub muted">{p.resumo}</p>}
          <Markdown texto={p.conteudo} />
        </section>
      </div>
    </>
  );
}
