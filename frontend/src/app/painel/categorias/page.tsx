'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { NOMES_TIPO } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Categoria { id: string; nome: string; icone: string | null; tipos_cliente: string[] | null; ordem: number; ativo: boolean; produtos: number; produtos_ativos: number }
type Form = { id: string; nome: string; icone: string; tipos_cliente: string[]; ordem: number; ativo: boolean; novo: boolean };

const COLUNAS: Coluna<Categoria>[] = [
  { chave: 'ordem', titulo: 'Ordem', ordenavel: true, direita: true },
  { chave: 'nome', titulo: 'Nome', ordenavel: true, render: (c) => <><b>{c.nome}</b><div className="pequeno muted">/{c.id}</div></> },
  { chave: 'tipos_cliente', titulo: 'Quem vê', filtro: 'opcoes', opcoes: { todos: 'Todos os tipos', ...NOMES_TIPO },
    valor: (c) => (c.tipos_cliente?.length ? c.tipos_cliente.join(',') : 'todos'),
    render: (c) => (c.tipos_cliente?.length ? c.tipos_cliente.map((t) => NOMES_TIPO[t] ?? t).join(', ') : <span className="muted">Todos os tipos</span>),
    valorCsv: (c) => (c.tipos_cliente?.length ? c.tipos_cliente.map((t) => NOMES_TIPO[t] ?? t).join(', ') : 'Todos') },
  { chave: 'produtos_ativos', titulo: 'Produtos ativos', ordenavel: true, direita: true, render: (c) => `${c.produtos_ativos} de ${c.produtos}` },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativa', false: 'Inativa' }, valor: (c) => String(c.ativo),
    render: (c) => <Situacao valor={c.ativo ? 'ativa' : 'inativa'} />, valorCsv: (c) => (c.ativo ? 'Ativa' : 'Inativa') },
];

export default function Categorias() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Categoria[]>('/equipe/catalogo/categorias');
  const [f, setF] = useState<Form | null>(null);
  const acao = useAcao();
  // o filtro "Quem vê" compara a lista toda; para filtrar por um tipo, a busca resolve (ex.: "hospital")
  const abrir = (c?: Categoria) => setF(c
    ? { id: c.id, nome: c.nome, icone: c.icone ?? '', tipos_cliente: c.tipos_cliente ?? [], ordem: c.ordem, ativo: c.ativo, novo: false }
    : { id: '', nome: '', icone: '', tipos_cliente: [], ordem: (dados?.length ?? 0) + 1, ativo: true, novo: true });
  const salvar = () => f && acao.executar(async () => {
    const corpo = { nome: f.nome, icone: f.icone || undefined, tipos_cliente: f.tipos_cliente, ordem: Number(f.ordem) };
    if (f.novo) await api('/equipe/catalogo/categorias', { corpo: { ...corpo, id: f.id || undefined } });
    else await api(`/equipe/catalogo/categorias/${f.id}`, { metodo: 'PATCH', corpo: { ...corpo, ativo: f.ativo } });
    await recarregar();
    setF(null);
  }, 'Categoria salva');

  const formulario = f && (
    <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <h2 style={{ margin: 0 }}>{f.novo ? 'Nova categoria' : `Editar: ${f.nome}`}</h2>
      <div className="grade grade-3">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></Campo>
        <Campo rotulo="Código no endereço" dica={f.novo ? 'Vazio: sai do nome' : 'Não muda'}><input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} disabled={!f.novo} pattern="[a-z0-9-]{2,40}" /></Campo>
        <Campo rotulo="Ordem na loja"><input type="number" min={0} value={f.ordem} onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })} /></Campo>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pequeno" style={{ fontWeight: 600, marginBottom: 6 }}>Quem vê a categoria (nenhum marcado = todos os tipos)</legend>
        <div className="linha">
          {Object.entries(NOMES_TIPO).map(([k, v]) => (
            <label key={k} className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.tipos_cliente.includes(k)}
              onChange={(e) => setF({ ...f, tipos_cliente: e.target.checked ? [...f.tipos_cliente, k] : f.tipos_cliente.filter((x) => x !== k) })} /> {v}</label>
          ))}
        </div>
      </fieldset>
      {!f.novo && <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativa (aparece na loja)</label>}
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
    </form>
  );

  return (
    <Grade
      titulo="Categorias"
      sub="A ordem e quem vê cada categoria na loja. Para tirar da loja, inative (nada é apagado)."
      acoes={pode && <button className="botao" onClick={() => abrir()}><Icone nome="mais" tamanho={16} /> Criar categoria</button>}
      topo={<><Aviso tipo="ok">{acao.ok}</Aviso>{formulario}</>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(c) => c.id}
      aoClicar={pode ? (c) => abrir(c) : undefined}
      ordemInicial={{ chave: 'ordem', dir: 'asc' }}
      nomeArquivo="categorias"
    />
  );
}
