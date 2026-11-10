'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Aviso, Campo } from '@/components/ui';
import { api } from '@/lib/api';
import { data, dataHora } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';
import { hojeIso } from '@/lib/periodos';

interface Cotacao { id: number; moeda: string; data: string; taxa: number; fonte: string; criado_em: string; criado_por: string | null }
const MOEDAS: Record<string, string> = { USD: 'Dólar (USD)', EUR: 'Euro (EUR)', CNY: 'Yuan (CNY)' };
const taxa = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const COLUNAS: Coluna<Cotacao>[] = [
  { chave: 'data', titulo: 'Data', ordenavel: true, filtro: 'data', render: (c) => data(`${c.data}T12:00:00`) },
  { chave: 'moeda', titulo: 'Moeda', filtro: 'opcoes', opcoes: MOEDAS, render: (c) => MOEDAS[c.moeda] ?? c.moeda },
  { chave: 'taxa', titulo: 'Cotação', ordenavel: true, direita: true, render: (c) => <b>{taxa(c.taxa)}</b>, valorCsv: (c) => String(c.taxa).replace('.', ',') },
  { chave: 'fonte', titulo: 'Fonte', filtro: 'opcoes' },
  { chave: 'criado_em', titulo: 'Registrada', render: (c) => <>{dataHora(c.criado_em)}{c.criado_por && <div className="pequeno muted">por {c.criado_por}</div>}</> },
];

/** Configurações → Câmbio (no Bagisto, "Taxas de câmbio"): as cotações usadas nas propostas de importação. */
export default function Cambio() {
  const { eu } = useEu();
  const pode = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Cotacao[]>('/equipe/configuracoes/cambio');
  const atual = useDados<Array<{ moeda: string; data: string; taxa: number }>>('/equipe/configuracoes/cambio/atual');
  const [f, setF] = useState({ moeda: 'USD', data: hojeIso(), taxa: '', fonte: 'PTAX venda (Banco Central)' });
  const acao = useAcao();
  const salvar = () => acao.executar(async () => {
    await api('/equipe/configuracoes/cambio', { corpo: { moeda: f.moeda, data: f.data, taxa: Number(f.taxa.replace(',', '.')), fonte: f.fonte || undefined } });
    await Promise.all([recarregar(), atual.recarregar()]);
    setF({ ...f, taxa: '' });
  }, 'Cotação registrada');
  return (
    <Grade
      titulo="Câmbio"
      sub="Cotações por dia, usadas nas propostas de importação. Registrar de novo no mesmo dia corrige a cotação (fica na auditoria)."
      topo={<>
        <div className="pn-numeros" style={{ marginBottom: 16 }}>
          {Object.keys(MOEDAS).map((m) => {
            const c = atual.dados?.find((x) => x.moeda === m);
            return <div key={m} className="pn-numero"><span><strong>{c ? taxa(c.taxa) : '—'}</strong><small>{MOEDAS[m]}{c ? ` · ${data(`${c.data}T12:00:00`)}` : ' · sem cotação'}</small></span></div>;
          })}
        </div>
        {pode && (
          <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
            <div className="grade grade-3" style={{ alignItems: 'end' }}>
              <Campo rotulo="Moeda"><select value={f.moeda} onChange={(e) => setF({ ...f, moeda: e.target.value })}>{Object.entries(MOEDAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              <Campo rotulo="Data"><input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} required /></Campo>
              <Campo rotulo="Cotação (R$)" dica="Até 4 casas"><input inputMode="decimal" value={f.taxa} onChange={(e) => setF({ ...f, taxa: e.target.value })} required placeholder="5,3875" /></Campo>
              <Campo rotulo="Fonte"><input value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} maxLength={80} /></Campo>
              <div><button className="botao" disabled={acao.enviando}>Registrar cotação</button></div>
            </div>
            <Aviso tipo="erro">{acao.erro}</Aviso>
            <Aviso tipo="ok">{acao.ok}</Aviso>
          </form>
        )}
      </>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(c) => c.id}
      ordemInicial={{ chave: 'data', dir: 'desc' }}
      nomeArquivo="cambio"
      vazio="Nenhuma cotação registrada."
    />
  );
}
