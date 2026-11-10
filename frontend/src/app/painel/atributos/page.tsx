'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados } from '@/lib/hooks';

interface Atributo { id: number; codigo: string; nome: string; tipo: string; opcoes: string[]; unidade: string | null; obrigatorio: boolean; filtravel: boolean; visivel_na_loja: boolean; ordem: number; ativo: boolean; familias: number; produtos: number }
type Form = Omit<Atributo, 'familias' | 'produtos' | 'opcoes' | 'unidade' | 'id'> & { id: number | null; opcoes: string; unidade: string };

const TIPO_ATRIBUTO: Record<string, string> = { texto: 'Texto', numero: 'Número', lista: 'Lista de opções', sim_nao: 'Sim ou não' };
const SIM: Record<string, string> = { true: 'Sim', false: 'Não' };

const COLUNAS: Coluna<Atributo>[] = [
  { chave: 'nome', titulo: 'Nome / código', ordenavel: true, render: (a) => <><b>{a.nome}</b><div className="pequeno muted">{a.codigo}</div></> },
  { chave: 'codigo', titulo: 'Código', oculta: true },
  { chave: 'tipo', titulo: 'Tipo', filtro: 'opcoes', opcoes: TIPO_ATRIBUTO, render: (a) => <>{TIPO_ATRIBUTO[a.tipo]}{a.tipo === 'lista' && <div className="pequeno muted">{a.opcoes.join(', ')}</div>}</>, valorCsv: (a) => TIPO_ATRIBUTO[a.tipo] },
  { chave: 'obrigatorio', titulo: 'Obrigatório', filtro: 'opcoes', opcoes: SIM, valor: (a) => String(a.obrigatorio), render: (a) => SIM[String(a.obrigatorio)], valorCsv: (a) => SIM[String(a.obrigatorio)] },
  { chave: 'filtravel', titulo: 'Filtro na loja', filtro: 'opcoes', opcoes: SIM, valor: (a) => String(a.filtravel), render: (a) => SIM[String(a.filtravel)], valorCsv: (a) => SIM[String(a.filtravel)] },
  { chave: 'familias', titulo: 'Famílias', ordenavel: true, direita: true },
  { chave: 'produtos', titulo: 'Produtos com valor', ordenavel: true, direita: true },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativo', false: 'Inativo' }, valor: (a) => String(a.ativo), render: (a) => <Situacao valor={a.ativo ? 'ativa' : 'inativa'} nomes={{ ativa: 'Ativo', inativa: 'Inativo' }} /> },
];

export default function Atributos() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Atributo[]>('/equipe/catalogo/atributos');
  const [f, setF] = useState<Form | null>(null);
  const acao = useAcao();
  const abrir = (a?: Atributo) => setF(a
    ? { ...a, opcoes: a.opcoes.join('\n'), unidade: a.unidade ?? '' }
    : { id: null, codigo: '', nome: '', tipo: 'texto', opcoes: '', unidade: '', obrigatorio: false, filtravel: false, visivel_na_loja: true, ordem: (dados?.length ?? 0) + 1, ativo: true });
  const salvar = () => f && acao.executar(async () => {
    const corpo = {
      nome: f.nome, tipo: f.tipo, opcoes: f.tipo === 'lista' ? f.opcoes.split('\n').map((o) => o.trim()).filter(Boolean) : [], unidade: f.unidade || undefined,
      obrigatorio: f.obrigatorio, filtravel: f.filtravel, visivel_na_loja: f.visivel_na_loja, ordem: Number(f.ordem),
    };
    if (f.id === null) await api('/equipe/catalogo/atributos', { corpo: { ...corpo, codigo: f.codigo } });
    else await api(`/equipe/catalogo/atributos/${f.id}`, { metodo: 'PATCH', corpo: { ...corpo, ativo: f.ativo } });
    await recarregar();
    setF(null);
  }, 'Atributo salvo');

  const formulario = f && (
    <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <h2 style={{ margin: 0 }}>{f.id === null ? 'Novo atributo' : `Editar: ${f.nome}`}</h2>
      <div className="grade grade-3">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></Campo>
        <Campo rotulo="Código" dica="Minúsculas e _, não muda depois"><input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} disabled={f.id !== null} required pattern="[a-z][a-z0-9_]{1,39}" /></Campo>
        <Campo rotulo="Tipo">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPO_ATRIBUTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo rotulo="Unidade" dica="Ex.: kg, W, L (opcional)"><input value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })} /></Campo>
        <Campo rotulo="Ordem"><input type="number" min={0} value={f.ordem} onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })} /></Campo>
      </div>
      {f.tipo === 'lista' && <Campo rotulo="Opções (uma por linha)"><textarea rows={4} value={f.opcoes} onChange={(e) => setF({ ...f, opcoes: e.target.value })} /></Campo>}
      <div className="linha">
        <label className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.obrigatorio} onChange={(e) => setF({ ...f, obrigatorio: e.target.checked })} /> Obrigatório</label>
        <label className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.filtravel} onChange={(e) => setF({ ...f, filtravel: e.target.checked })} /> Aparece nos filtros da loja</label>
        <label className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.visivel_na_loja} onChange={(e) => setF({ ...f, visivel_na_loja: e.target.checked })} /> Visível na página do produto</label>
        {f.id !== null && <label className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>}
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
    </form>
  );

  return (
    <Grade
      titulo="Atributos"
      sub="Campos que descrevem os produtos (tensão, material, registro ANVISA…). Cada família de atributos usa alguns deles."
      acoes={pode && <button className="botao" onClick={() => abrir()}><Icone nome="mais" tamanho={16} /> Criar atributo</button>}
      topo={<><Aviso tipo="ok">{acao.ok}</Aviso>{formulario}</>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(a) => a.id}
      aoClicar={pode ? (a) => abrir(a) : undefined}
      ordemInicial={{ chave: 'nome', dir: 'asc' }}
      nomeArquivo="atributos"
    />
  );
}
