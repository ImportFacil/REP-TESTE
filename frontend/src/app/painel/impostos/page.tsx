'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { pct } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Regra { id: number; nome: string; ncm_prefixo: string | null; uf: string | null; origem: 'nacional' | 'importado' | null; aliquota_federal_bp: number; aliquota_estadual_bp: number; ativo: boolean }
type Form = { id: number | null; nome: string; ncm_prefixo: string; uf: string; origem: string; federal: string; estadual: string; ativo: boolean };
const ORIGEM: Record<string, string> = { nacional: 'Nacional', importado: 'Importada' };
const bp = (t: string) => Math.round(Number(t.replace(',', '.')) * 100);

const COLUNAS: Coluna<Regra>[] = [
  { chave: 'nome', titulo: 'Regra', ordenavel: true, render: (r) => <b>{r.nome}</b> },
  { chave: 'ncm_prefixo', titulo: 'NCM começa com', render: (r) => r.ncm_prefixo ?? <span className="muted">Qualquer</span>, valorCsv: (r) => r.ncm_prefixo ?? 'Qualquer' },
  { chave: 'uf', titulo: 'UF de destino', filtro: 'opcoes', render: (r) => r.uf ?? <span className="muted">Qualquer</span>, valorCsv: (r) => r.uf ?? 'Qualquer' },
  { chave: 'origem', titulo: 'Origem', filtro: 'opcoes', opcoes: ORIGEM, render: (r) => (r.origem ? ORIGEM[r.origem] : <span className="muted">Qualquer</span>), valorCsv: (r) => (r.origem ? ORIGEM[r.origem] : 'Qualquer') },
  { chave: 'aliquota_federal_bp', titulo: 'Federal', direita: true, ordenavel: true, render: (r) => pct(r.aliquota_federal_bp), valorCsv: (r) => pct(r.aliquota_federal_bp) },
  { chave: 'aliquota_estadual_bp', titulo: 'Estadual', direita: true, ordenavel: true, render: (r) => pct(r.aliquota_estadual_bp), valorCsv: (r) => pct(r.aliquota_estadual_bp) },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativa', false: 'Inativa' }, valor: (r) => String(r.ativo), render: (r) => <Situacao valor={r.ativo ? 'ativa' : 'inativa'} />, valorCsv: (r) => (r.ativo ? 'Ativa' : 'Inativa') },
];

/** Configurações → Impostos (no Bagisto, "Impostos"): o valor aproximado dos tributos que sai em cada nota fiscal. */
export default function Impostos() {
  const { eu } = useEu();
  const pode = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Regra[]>('/equipe/configuracoes/impostos');
  const [f, setF] = useState<Form | null>(null);
  const acao = useAcao();
  const abrir = (r?: Regra) => setF(r
    ? { id: r.id, nome: r.nome, ncm_prefixo: r.ncm_prefixo ?? '', uf: r.uf ?? '', origem: r.origem ?? '', federal: String(r.aliquota_federal_bp / 100).replace('.', ','), estadual: String(r.aliquota_estadual_bp / 100).replace('.', ','), ativo: r.ativo }
    : { id: null, nome: '', ncm_prefixo: '', uf: '', origem: '', federal: '', estadual: '', ativo: true });
  const salvar = () => f && acao.executar(async () => {
    const corpo = { nome: f.nome, ncm_prefixo: f.ncm_prefixo || null, uf: f.uf || null, origem: f.origem || null, aliquota_federal_bp: bp(f.federal), aliquota_estadual_bp: bp(f.estadual), ativo: f.ativo };
    if (f.id === null) await api('/equipe/configuracoes/impostos', { corpo });
    else await api(`/equipe/configuracoes/impostos/${f.id}`, { metodo: 'PATCH', corpo });
    await recarregar();
    setF(null);
  }, 'Regra salva');
  return (
    <Grade
      titulo="Impostos"
      sub="O valor aproximado dos tributos (Lei 12.741/2012) que sai em cada nota fiscal. Vale a regra mais específica: NCM, depois UF de destino, depois origem. Confira as alíquotas na tabela do IBPT."
      acoes={pode && <button className="botao" onClick={() => abrir()}><Icone nome="mais" tamanho={16} /> Criar regra</button>}
      topo={<>
        <Aviso tipo="ok">{acao.ok}</Aviso>
        {f && (
          <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
            <h2 style={{ margin: 0 }}>{f.id === null ? 'Nova regra' : `Editar: ${f.nome}`}</h2>
            <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={3} /></Campo>
            <div className="grade grade-3">
              <Campo rotulo="NCM começa com" dica="2 a 8 dígitos; vazio = qualquer"><input inputMode="numeric" value={f.ncm_prefixo} onChange={(e) => setF({ ...f, ncm_prefixo: e.target.value.replace(/\D/g, '') })} maxLength={8} /></Campo>
              <Campo rotulo="UF de destino" dica="Vazio = qualquer"><input value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} maxLength={2} pattern="[A-Za-z]{2}" /></Campo>
              <Campo rotulo="Origem"><select value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}><option value="">Qualquer</option><option value="nacional">Nacional</option><option value="importado">Importada</option></select></Campo>
              <Campo rotulo="Alíquota federal (%)"><input inputMode="decimal" value={f.federal} onChange={(e) => setF({ ...f, federal: e.target.value })} required /></Campo>
              <Campo rotulo="Alíquota estadual (%)"><input inputMode="decimal" value={f.estadual} onChange={(e) => setF({ ...f, estadual: e.target.value })} required /></Campo>
            </div>
            <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativa</label>
            <Aviso tipo="erro">{acao.erro}</Aviso>
            <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
          </form>
        )}
      </>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(r) => r.id}
      aoClicar={pode ? abrir : undefined}
      nomeArquivo="regras-de-impostos"
    />
  );
}
