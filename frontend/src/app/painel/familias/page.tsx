'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados } from '@/lib/hooks';

interface Familia { id: number; codigo: string; nome: string; ativo: boolean; produtos: number; atributos: Array<{ id: number; nome: string; codigo: string }> }
interface Atributo { id: number; codigo: string; nome: string; ativo: boolean }
type Form = { id: number | null; codigo: string; nome: string; ativo: boolean; atributos: number[] };

const COLUNAS: Coluna<Familia>[] = [
  { chave: 'nome', titulo: 'Nome / código', ordenavel: true, render: (f) => <><b>{f.nome}</b><div className="pequeno muted">{f.codigo}</div></> },
  { chave: 'atributos', titulo: 'Atributos', valor: (f) => f.atributos.map((a) => a.nome).join(', '), render: (f) => <span className="pequeno">{f.atributos.map((a) => a.nome).join(' · ')}</span> },
  { chave: 'produtos', titulo: 'Produtos', ordenavel: true, direita: true },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativa', false: 'Inativa' }, valor: (f) => String(f.ativo), render: (f) => <Situacao valor={f.ativo ? 'ativa' : 'inativa'} /> },
];

export default function Familias() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Familia[]>('/equipe/catalogo/familias');
  const { dados: atributos } = useDados<Atributo[]>('/equipe/catalogo/atributos');
  const [f, setF] = useState<Form | null>(null);
  const acao = useAcao();
  const abrir = (x?: Familia) => setF(x ? { id: x.id, codigo: x.codigo, nome: x.nome, ativo: x.ativo, atributos: x.atributos.map((a) => a.id) } : { id: null, codigo: '', nome: '', ativo: true, atributos: [] });
  const mover = (k: number, d: number) => { if (!f) return; const l = [...f.atributos]; const [x] = l.splice(k, 1); l.splice(k + d, 0, x); setF({ ...f, atributos: l }); };
  const salvar = () => f && acao.executar(async () => {
    if (f.id === null) await api('/equipe/catalogo/familias', { corpo: { codigo: f.codigo, nome: f.nome, atributos: f.atributos } });
    else await api(`/equipe/catalogo/familias/${f.id}`, { metodo: 'PATCH', corpo: { nome: f.nome, ativo: f.ativo, atributos: f.atributos } });
    await recarregar();
    setF(null);
  }, 'Família salva');
  const nome = (id: number) => atributos?.find((a) => a.id === id)?.nome ?? id;

  const formulario = f && (
    <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <h2 style={{ margin: 0 }}>{f.id === null ? 'Nova família de atributos' : `Editar: ${f.nome}`}</h2>
      <div className="grade grade-3">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></Campo>
        <Campo rotulo="Código" dica="Minúsculas e _, não muda depois"><input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} disabled={f.id !== null} required pattern="[a-z][a-z0-9_]{1,39}" /></Campo>
      </div>
      <div className="grade grade-2" style={{ alignItems: 'start' }}>
        <div>
          <b className="pequeno">Atributos disponíveis</b>
          <div className="pilha" style={{ gap: 4, marginTop: 6 }}>
            {atributos?.filter((a) => a.ativo && !f.atributos.includes(a.id)).map((a) => (
              <button type="button" key={a.id} className="pn-botao-borda" style={{ justifyContent: 'space-between' }} onClick={() => setF({ ...f, atributos: [...f.atributos, a.id] })}>
                {a.nome} <Icone nome="mais" tamanho={14} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <b className="pequeno">Na família, nesta ordem ({f.atributos.length})</b>
          <ol className="pilha" style={{ gap: 4, marginTop: 6, paddingLeft: 18 }}>
            {f.atributos.map((id, k) => (
              <li key={id}>
                <div className="linha" style={{ justifyContent: 'space-between' }}>
                  <span>{nome(id)}</span>
                  <span className="linha" style={{ gap: 2 }}>
                    <button type="button" className="pn-seta" disabled={k === 0} onClick={() => mover(k, -1)} aria-label="Subir"><Icone nome="acima" tamanho={16} /></button>
                    <button type="button" className="pn-seta" disabled={k === f.atributos.length - 1} onClick={() => mover(k, 1)} aria-label="Descer"><Icone nome="abaixo" tamanho={16} /></button>
                    <button type="button" className="pn-seta" onClick={() => setF({ ...f, atributos: f.atributos.filter((x) => x !== id) })} aria-label="Tirar da família"><Icone nome="fechar" tamanho={16} /></button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {f.id !== null && <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativa</label>}
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
    </form>
  );

  return (
    <Grade
      titulo="Famílias de atributos"
      sub="Cada produto pertence a uma família, que define os atributos do cadastro (como no Bagisto)."
      acoes={pode && <button className="botao" onClick={() => abrir()}><Icone nome="mais" tamanho={16} /> Criar família</button>}
      topo={<><Aviso tipo="ok">{acao.ok}</Aviso>{formulario}</>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(x) => x.id}
      aoClicar={pode ? (x) => abrir(x) : undefined}
      ordemInicial={{ chave: 'nome', dir: 'asc' }}
      nomeArquivo="familias-atributos"
    />
  );
}
