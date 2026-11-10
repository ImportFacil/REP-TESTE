'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Campo, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { paraCentavos, paraTexto } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Produto {
  id: number; codigo: string; nome: string; marca: string | null; categoria_id: string; subcategoria: string | null; descricao: string | null; ncm: string | null;
  unidade: string; multiplo_venda: number; estoque: number; preco_tabela_centavos: number; sob_orcamento: boolean; destaque: boolean; importado: boolean; ativo: boolean;
  especificacoes: Array<{ nome: string; valor: string }>; familia_id: number | null; atributos: Record<string, string>;
}
interface Categoria { id: string; nome: string; ativo: boolean }
interface Familia { id: number; nome: string; ativo: boolean; atributos: Array<{ id: number; codigo: string; nome: string; tipo: string; opcoes: string[]; unidade: string | null; obrigatorio: boolean }> }

const VAZIO: Produto = {
  id: 0, codigo: '', nome: '', marca: '', categoria_id: '', subcategoria: '', descricao: '', ncm: '', unidade: 'un', multiplo_venda: 1, estoque: 0,
  preco_tabela_centavos: 0, sob_orcamento: false, destaque: false, importado: false, ativo: true, especificacoes: [], familia_id: null, atributos: {},
};

/** Produto no formato do Bagisto: dados gerais, descrição, atributos da família, especificações, preço e estoque, configurações. */
export default function ProdutoPainel() {
  const id = useParametro('id');
  const novo = useParametro('novo') === '1';
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados: original, erro } = useDados<Produto>(id ? `/equipe/catalogo/produtos/${id}` : null);
  const { dados: categorias } = useDados<Categoria[]>('/equipe/catalogo/categorias');
  const { dados: familias } = useDados<Familia[]>('/equipe/catalogo/familias');
  const [p, setP] = useState<Produto | null>(null);
  const [preco, setPreco] = useState('');
  const [specs, setSpecs] = useState('');
  const acao = useAcao();

  useEffect(() => {
    const base = novo ? VAZIO : original;
    if (!base) return;
    setP({ ...base, marca: base.marca ?? '', subcategoria: base.subcategoria ?? '', descricao: base.descricao ?? '', ncm: base.ncm ?? '', atributos: base.atributos ?? {} });
    setPreco(base.preco_tabela_centavos ? paraTexto(base.preco_tabela_centavos) : '');
    setSpecs((base.especificacoes ?? []).map((e) => `${e.nome}: ${e.valor}`).join('\n'));
  }, [original, novo]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!p || !categorias || !familias) return <Carregando />;
  const familia = familias.find((f) => f.id === p.familia_id);
  const muda = (m: Partial<Produto>) => setP({ ...p, ...m });
  const mudaAtributo = (codigo: string, valor: string) => setP({ ...p, atributos: { ...p.atributos, [codigo]: valor } });

  const salvar = () => acao.executar(async () => {
    const especificacoes = specs.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { nome: l.slice(0, i).trim(), valor: l.slice(i + 1).trim() } : { nome: l, valor: '—' };
    });
    const atributos = Object.fromEntries((familia?.atributos ?? []).map((a) => [a.codigo, p.atributos[a.codigo] ?? '']));
    const corpo = {
      nome: p.nome, marca: p.marca || undefined, categoria_id: p.categoria_id, subcategoria: p.subcategoria || undefined, descricao: p.descricao || undefined,
      ncm: p.ncm || undefined, unidade: p.unidade, multiplo_venda: Number(p.multiplo_venda), estoque: Number(p.estoque),
      preco_tabela_centavos: paraCentavos(preco) ?? 0, sob_orcamento: p.sob_orcamento, destaque: p.destaque, especificacoes,
      ...(p.familia_id ? { familia_id: p.familia_id, atributos } : {}),
    };
    if (novo) {
      const r = await api<Produto>('/equipe/produtos', { corpo: { ...corpo, codigo: p.codigo, importado: p.importado } });
      router.replace(`/painel/produto/?id=${r.id}`);
    } else {
      await api(`/equipe/produtos/${p.id}`, { metodo: 'PATCH', corpo: { ...corpo, ativo: p.ativo } });
    }
  }, novo ? 'Produto criado' : 'Alterações salvas');

  const bloqueado = !pode;
  return (
    <>
      <p className="pequeno"><Link href="/painel/produtos/">‹ Produtos</Link></p>
      <div className="pn-cabecalho">
        <div>
          <h1>{novo ? 'Criar produto' : p.nome}</h1>
          {!novo && <p className="sub muted">Código {p.codigo}{familia ? ` · ${familia.nome}` : ''}</p>}
        </div>
        <div className="pn-cabecalho-acoes">
          {pode && <button className="botao" disabled={acao.enviando || !p.nome || !p.categoria_id || (novo && !p.codigo)} onClick={() => void salvar()}>{novo ? 'Criar produto' : 'Salvar produto'}</button>}
        </div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>

      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
        <div className="pn-dupla">
          <div className="pilha" style={{ gap: 16 }}>
            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Geral</h2>
              <div className="grade grade-2">
                <Campo rotulo="Código (SKU)" dica={novo ? 'Não muda depois de criado' : undefined}>
                  <input value={p.codigo} onChange={(e) => muda({ codigo: e.target.value })} disabled={!novo} required />
                </Campo>
                <Campo rotulo="Marca"><input value={p.marca ?? ''} onChange={(e) => muda({ marca: e.target.value })} /></Campo>
              </div>
              <Campo rotulo="Nome"><input value={p.nome} onChange={(e) => muda({ nome: e.target.value })} required /></Campo>
              <div className="grade grade-2">
                <Campo rotulo="Unidade"><input value={p.unidade} onChange={(e) => muda({ unidade: e.target.value })} /></Campo>
                <Campo rotulo="Múltiplo de venda" dica="Vende de tantas em tantas unidades"><input type="number" min={1} value={p.multiplo_venda} onChange={(e) => muda({ multiplo_venda: Number(e.target.value) })} /></Campo>
                <Campo rotulo="NCM" dica="8 dígitos"><input inputMode="numeric" value={p.ncm ?? ''} onChange={(e) => muda({ ncm: e.target.value })} /></Campo>
                <Campo rotulo="Subcategoria"><input value={p.subcategoria ?? ''} onChange={(e) => muda({ subcategoria: e.target.value })} /></Campo>
              </div>
            </section>

            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Descrição</h2>
              <textarea rows={5} value={p.descricao ?? ''} onChange={(e) => muda({ descricao: e.target.value })} aria-label="Descrição" />
            </section>

            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Atributos</h2>
              <Campo rotulo="Família de atributos" dica="Define os campos abaixo, como no Bagisto">
                <select value={p.familia_id ?? ''} onChange={(e) => muda({ familia_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sem família</option>
                  {familias.filter((f) => f.ativo || f.id === p.familia_id).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              {familia && (
                <div className="grade grade-2">
                  {familia.atributos.map((a) => {
                    const v = p.atributos[a.codigo] ?? '';
                    const rotulo = `${a.nome}${a.unidade ? ` (${a.unidade})` : ''}${a.obrigatorio ? ' *' : ''}`;
                    if (a.tipo === 'lista') return (
                      <Campo key={a.codigo} rotulo={rotulo}>
                        <select value={v} onChange={(e) => mudaAtributo(a.codigo, e.target.value)}><option value="">—</option>{a.opcoes.map((o) => <option key={o}>{o}</option>)}</select>
                      </Campo>
                    );
                    if (a.tipo === 'sim_nao') return (
                      <Campo key={a.codigo} rotulo={rotulo}>
                        <select value={v} onChange={(e) => mudaAtributo(a.codigo, e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="não">Não</option></select>
                      </Campo>
                    );
                    return (
                      <Campo key={a.codigo} rotulo={rotulo}>
                        <input inputMode={a.tipo === 'numero' ? 'decimal' : undefined} value={v} onChange={(e) => mudaAtributo(a.codigo, e.target.value)} />
                      </Campo>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Especificações</h2>
              <Campo rotulo="Uma por linha, no formato Nome: valor" dica="Aparecem na página do produto na loja">
                <textarea rows={6} value={specs} onChange={(e) => setSpecs(e.target.value)} />
              </Campo>
            </section>
          </div>

          <div className="pilha" style={{ gap: 16 }}>
            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Preço e estoque</h2>
              <Campo rotulo="Preço de tabela (R$)" dica="O cliente paga este preço menos o desconto do seu tipo"><input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} /></Campo>
              <Campo rotulo="Estoque"><input type="number" min={0} value={p.estoque} onChange={(e) => muda({ estoque: Number(e.target.value) })} /></Campo>
            </section>

            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Categoria</h2>
              <Campo rotulo="Categoria">
                <select value={p.categoria_id} onChange={(e) => muda({ categoria_id: e.target.value })} required>
                  <option value="">Escolha…</option>
                  {categorias.filter((c) => c.ativo || c.id === p.categoria_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </section>

            <section className="pn-caixa formulario" style={{ padding: 18 }}>
              <h2 style={{ margin: 0 }}>Configurações</h2>
              {!novo && <label className="linha"><input type="checkbox" checked={p.ativo} onChange={(e) => muda({ ativo: e.target.checked })} style={{ width: 'auto' }} /> Ativo (aparece na loja)</label>}
              <label className="linha"><input type="checkbox" checked={p.destaque} onChange={(e) => muda({ destaque: e.target.checked })} style={{ width: 'auto' }} /> Destaque na vitrine</label>
              <label className="linha"><input type="checkbox" checked={p.sob_orcamento} onChange={(e) => muda({ sob_orcamento: e.target.checked })} style={{ width: 'auto' }} /> Sob orçamento (sem preço na loja)</label>
              {novo && <label className="linha"><input type="checkbox" checked={p.importado} onChange={(e) => muda({ importado: e.target.checked })} style={{ width: 'auto' }} /> Linha de importação</label>}
            </section>
          </div>
        </div>
      </fieldset>
    </>
  );
}
