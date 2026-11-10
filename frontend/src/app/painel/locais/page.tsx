'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados } from '@/lib/hooks';

interface Local { id: number; codigo: string; nome: string; cidade: string; uf: string; prioridade: number; ativo: boolean; unidades: number; produtos: number }
type Form = Omit<Local, 'id' | 'unidades' | 'produtos'> & { id: number | null };

const COLUNAS: Coluna<Local>[] = [
  { chave: 'prioridade', titulo: 'Prioridade', ordenavel: true, direita: true },
  { chave: 'nome', titulo: 'Local', ordenavel: true, render: (l) => <><b>{l.nome}</b><div className="pequeno muted">{l.codigo}</div></> },
  { chave: 'cidade', titulo: 'Cidade', ordenavel: true, render: (l) => `${l.cidade}/${l.uf}` },
  { chave: 'produtos', titulo: 'Produtos com estoque', ordenavel: true, direita: true },
  { chave: 'unidades', titulo: 'Unidades', ordenavel: true, direita: true, render: (l) => l.unidades.toLocaleString('pt-BR') },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativo', false: 'Inativo' }, valor: (l) => String(l.ativo),
    render: (l) => <Situacao valor={l.ativo ? 'ativa' : 'inativa'} nomes={{ ativa: 'Ativo', inativa: 'Inativo' }} />, valorCsv: (l) => (l.ativo ? 'Ativo' : 'Inativo') },
];

/** Configurações → Locais de estoque (no Bagisto, "Fontes de estoque"): o estoque do produto é a soma dos locais. */
export default function Locais() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Local[]>('/equipe/configuracoes/locais');
  const [f, setF] = useState<Form | null>(null);
  const acao = useAcao();
  const abrir = (l?: Local) => setF(l ? { id: l.id, codigo: l.codigo, nome: l.nome, cidade: l.cidade, uf: l.uf, prioridade: l.prioridade, ativo: l.ativo }
    : { id: null, codigo: '', nome: '', cidade: '', uf: '', prioridade: (dados?.length ?? 0) * 10 + 10, ativo: true });
  const salvar = () => f && acao.executar(async () => {
    const corpo = { nome: f.nome, cidade: f.cidade, uf: f.uf, prioridade: Number(f.prioridade), ativo: f.ativo };
    if (f.id === null) await api('/equipe/configuracoes/locais', { corpo: { ...corpo, codigo: f.codigo } });
    else await api(`/equipe/configuracoes/locais/${f.id}`, { metodo: 'PATCH', corpo });
    await recarregar();
    setF(null);
  }, 'Local salvo');
  return (
    <Grade
      titulo="Locais de estoque"
      sub="Cada venda tira primeiro do local de menor número de prioridade; entradas (devoluções, ajustes, planilha) vão para ele. A divisão por produto fica na página do produto."
      acoes={pode && <button className="botao" onClick={() => abrir()}><Icone nome="mais" tamanho={16} /> Criar local</button>}
      topo={<>
        <Aviso tipo="ok">{acao.ok}</Aviso>
        {f && (
          <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
            <h2 style={{ margin: 0 }}>{f.id === null ? 'Novo local' : `Editar: ${f.nome}`}</h2>
            <div className="grade grade-3">
              <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></Campo>
              <Campo rotulo="Código" dica={f.id === null ? 'Minúsculas, números e "-"' : 'Não muda'}><input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toLowerCase() })} disabled={f.id !== null} required pattern="[a-z0-9\-]{2,30}" /></Campo>
              <Campo rotulo="Prioridade" dica="Menor sai primeiro"><input type="number" min={0} value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: Number(e.target.value) })} /></Campo>
              <Campo rotulo="Cidade"><input value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} required minLength={2} /></Campo>
              <Campo rotulo="UF"><input value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} required maxLength={2} pattern="[A-Za-z]{2}" /></Campo>
            </div>
            <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo (recebe entradas)</label>
            <Aviso tipo="erro">{acao.erro}</Aviso>
            <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
          </form>
        )}
      </>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(l) => l.id}
      aoClicar={pode ? abrir : undefined}
      ordemInicial={{ chave: 'prioridade', dir: 'asc' }}
      nomeArquivo="locais-de-estoque"
    />
  );
}
