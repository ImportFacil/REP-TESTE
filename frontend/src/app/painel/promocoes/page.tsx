'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { data, NOMES_TIPO, paraCentavos, paraTexto, pct, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Promocao {
  id: number; nome: string; descricao: string | null; cupom: string | null; tipo_desconto: 'percentual' | 'valor_fixo'; desconto_bp: number | null; desconto_centavos: number | null;
  tipos_cliente: string[] | null; categorias: string[] | null; subtotal_minimo_centavos: number; inicio: string | null; fim: string | null;
  limite_usos: number | null; limite_por_empresa: number | null; ativo: boolean; usos: number; descontado_centavos: number;
}
interface Categoria { id: string; nome: string }
interface Form {
  id: number | null; nome: string; descricao: string; cupom: string; tipo_desconto: 'percentual' | 'valor_fixo'; percentual: string; valor: string;
  tipos_cliente: string[]; categorias: string[]; minimo: string; inicio: string; fim: string; limite_usos: string; limite_por_empresa: string; ativo: boolean;
}

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const vigencia = (p: Promocao) => {
  if (!p.ativo) return 'inativa';
  if (p.fim && p.fim < hoje()) return 'expirada';
  if (p.inicio && p.inicio > hoje()) return 'agendada';
  if (p.limite_usos !== null && p.usos >= p.limite_usos) return 'esgotada';
  return 'ativa';
};
const VIGENCIA = { ativa: 'Valendo', agendada: 'Agendada', expirada: 'Terminou', esgotada: 'Esgotada', inativa: 'Inativa' };

const COLUNAS: Coluna<Promocao>[] = [
  { chave: 'nome', titulo: 'Promoção', ordenavel: true, render: (p) => <><b>{p.nome}</b>{p.descricao && <div className="pequeno muted">{p.descricao}</div>}</> },
  { chave: 'cupom', titulo: 'Cupom', filtro: 'opcoes', opcoes: { sem: 'Automática (sem cupom)', com: 'Com cupom' }, valor: (p) => (p.cupom ? 'com' : 'sem'),
    render: (p) => (p.cupom ? <code className="codigo-copia" style={{ display: 'inline-block', whiteSpace: 'nowrap', wordBreak: 'normal' }}>{p.cupom}</code> : <span className="muted">Automática</span>), valorCsv: (p) => p.cupom ?? 'Automática' },
  { chave: 'desconto', titulo: 'Desconto', direita: true, valor: (p) => (p.tipo_desconto === 'percentual' ? `${pct(p.desconto_bp ?? 0)}` : reais(p.desconto_centavos)),
    render: (p) => <><b>{p.tipo_desconto === 'percentual' ? pct(p.desconto_bp ?? 0) : reais(p.desconto_centavos)}</b>
      {p.subtotal_minimo_centavos > 0 && <div className="pequeno muted">acima de {reais(p.subtotal_minimo_centavos)}</div>}</> },
  { chave: 'alcance', titulo: 'Vale para', valor: (p) => [p.tipos_cliente?.map((t) => NOMES_TIPO[t] ?? t).join(', ') || 'Todos os tipos', p.categorias?.length ? `${p.categorias.length} categoria(s)` : 'todos os produtos'].join(' · ') },
  { chave: 'periodo', titulo: 'Período', valor: (p) => (p.inicio || p.fim ? `${p.inicio ? data(p.inicio) : '…'} a ${p.fim ? data(p.fim) : 'sem fim'}` : 'Sem prazo') },
  { chave: 'usos', titulo: 'Usos', ordenavel: true, direita: true, render: (p) => <>{p.usos}{p.limite_usos ? ` de ${p.limite_usos}` : ''}{p.limite_por_empresa ? <div className="pequeno muted">{p.limite_por_empresa} por empresa</div> : null}</> },
  { chave: 'descontado_centavos', titulo: 'Total descontado', ordenavel: true, direita: true, valor: (p) => p.descontado_centavos / 100, render: (p) => reais(p.descontado_centavos),
    valorCsv: (p) => (p.descontado_centavos / 100).toFixed(2).replace('.', ',') },
  { chave: 'vigencia', titulo: 'Situação', filtro: 'opcoes', opcoes: VIGENCIA, valor: vigencia,
    render: (p) => { const v = vigencia(p); return <Situacao valor={v === 'ativa' ? 'ativa' : v === 'agendada' ? 'aguardando' : 'inativa'} nomes={{ ativa: VIGENCIA.ativa, aguardando: VIGENCIA.agendada, inativa: VIGENCIA[v] }} />; },
    valorCsv: (p) => VIGENCIA[vigencia(p)] },
];

const VAZIO: Form = { id: null, nome: '', descricao: '', cupom: '', tipo_desconto: 'percentual', percentual: '', valor: '', tipos_cliente: [], categorias: [], minimo: '', inicio: '', fim: '', limite_usos: '', limite_por_empresa: '', ativo: true };

/** Marketing → Promoções (as "regras de carrinho" do Bagisto): desconto automático ou por cupom, com período, público e limites. */
export default function Promocoes() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Promocao[]>('/equipe/marketing/promocoes');
  const { dados: categorias } = useDados<Categoria[]>('/equipe/catalogo/categorias');
  const [f, setF] = useState<Form | null>(null);
  const acao = useAcao();

  const abrir = (p?: Promocao) => setF(p ? {
    id: p.id, nome: p.nome, descricao: p.descricao ?? '', cupom: p.cupom ?? '', tipo_desconto: p.tipo_desconto,
    percentual: p.desconto_bp ? String(p.desconto_bp / 100).replace('.', ',') : '', valor: p.desconto_centavos ? paraTexto(p.desconto_centavos) : '',
    tipos_cliente: p.tipos_cliente ?? [], categorias: p.categorias ?? [], minimo: p.subtotal_minimo_centavos ? paraTexto(p.subtotal_minimo_centavos) : '',
    inicio: p.inicio ?? '', fim: p.fim ?? '', limite_usos: p.limite_usos ? String(p.limite_usos) : '', limite_por_empresa: p.limite_por_empresa ? String(p.limite_por_empresa) : '', ativo: p.ativo,
  } : { ...VAZIO });

  const salvar = () => f && acao.executar(async () => {
    const corpo = {
      nome: f.nome, descricao: f.descricao || null, cupom: f.cupom.trim() || null, tipo_desconto: f.tipo_desconto,
      ...(f.tipo_desconto === 'percentual' ? { desconto_bp: Math.round(Number(f.percentual.replace(',', '.')) * 100) } : { desconto_centavos: paraCentavos(f.valor) ?? 0 }),
      tipos_cliente: f.tipos_cliente, categorias: f.categorias, subtotal_minimo_centavos: paraCentavos(f.minimo) ?? 0,
      inicio: f.inicio || null, fim: f.fim || null,
      limite_usos: f.limite_usos ? Number(f.limite_usos) : null, limite_por_empresa: f.limite_por_empresa ? Number(f.limite_por_empresa) : null,
      ativo: f.ativo,
    };
    if (f.id === null) await api('/equipe/marketing/promocoes', { corpo });
    else await api(`/equipe/marketing/promocoes/${f.id}`, { metodo: 'PATCH', corpo });
    await recarregar();
    setF(null);
  }, 'Promoção salva');

  const alternar = (lista: string[], v: string, marcado: boolean) => (marcado ? [...lista, v] : lista.filter((x) => x !== v));

  const formulario = f && (
    <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <h2 style={{ margin: 0 }}>{f.id === null ? 'Nova promoção' : `Editar: ${f.nome}`}</h2>
      <div className="grade grade-2">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={3} /></Campo>
        <Campo rotulo="Cupom" dica="Vazio: a promoção vale sozinha no carrinho"><input value={f.cupom} onChange={(e) => setF({ ...f, cupom: e.target.value.toUpperCase() })} pattern="[A-Za-z0-9_\-]{3,30}" style={{ textTransform: 'uppercase' }} /></Campo>
      </div>
      <Campo rotulo="Descrição (opcional)"><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} maxLength={500} /></Campo>
      <div className="grade grade-3">
        <Campo rotulo="Tipo de desconto">
          <select value={f.tipo_desconto} onChange={(e) => setF({ ...f, tipo_desconto: e.target.value as Form['tipo_desconto'] })}>
            <option value="percentual">Percentual sobre os produtos</option>
            <option value="valor_fixo">Valor fixo (R$)</option>
          </select>
        </Campo>
        {f.tipo_desconto === 'percentual'
          ? <Campo rotulo="Desconto (%)" dica="Até 90%"><input inputMode="decimal" value={f.percentual} onChange={(e) => setF({ ...f, percentual: e.target.value })} required /></Campo>
          : <Campo rotulo="Desconto (R$)"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required /></Campo>}
        <Campo rotulo="Pedido a partir de (R$)" dica="Em produtos, antes do Pix"><input inputMode="decimal" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} /></Campo>
        <Campo rotulo="Começa em"><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
        <Campo rotulo="Termina em"><input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></Campo>
        <div className="grade grade-2">
          <Campo rotulo="Usos no total"><input type="number" min={1} value={f.limite_usos} onChange={(e) => setF({ ...f, limite_usos: e.target.value })} placeholder="Sem limite" /></Campo>
          <Campo rotulo="Por empresa"><input type="number" min={1} value={f.limite_por_empresa} onChange={(e) => setF({ ...f, limite_por_empresa: e.target.value })} placeholder="Sem limite" /></Campo>
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pequeno" style={{ fontWeight: 600, marginBottom: 6 }}>Tipos de cliente (nenhum marcado = todos)</legend>
        <div className="linha">{Object.entries(NOMES_TIPO).map(([k, v]) => (
          <label key={k} className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.tipos_cliente.includes(k)} onChange={(e) => setF({ ...f, tipos_cliente: alternar(f.tipos_cliente, k, e.target.checked) })} /> {v}</label>
        ))}</div>
      </fieldset>
      <details>
        <summary className="pequeno" style={{ fontWeight: 600, cursor: 'pointer' }}>Categorias ({f.categorias.length ? `${f.categorias.length} marcada(s)` : 'todas'})</summary>
        <div className="grade grade-3" style={{ marginTop: 8 }}>{(categorias ?? []).map((c) => (
          <label key={c.id} className="linha pequeno"><input type="checkbox" style={{ width: 'auto' }} checked={f.categorias.includes(c.id)} onChange={(e) => setF({ ...f, categorias: alternar(f.categorias, c.id, e.target.checked) })} /> {c.nome}</label>
        ))}</div>
      </details>
      <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativa</label>
      <p className="pequeno muted" style={{ margin: 0 }}>Cada pedido recebe uma promoção: a do cupom digitado ou, sem cupom, a automática de maior desconto. O desconto do Pix é calculado depois, sobre o valor já com a promoção.</p>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
    </form>
  );

  return (
    <Grade
      titulo="Promoções e cupons"
      sub="Descontos no carrinho por tipo de cliente, categoria, valor mínimo e período. Nada é apagado: para encerrar, inative."
      acoes={pode && <button className="botao" onClick={() => abrir()}><Icone nome="mais" tamanho={16} /> Criar promoção</button>}
      topo={<><Aviso tipo="ok">{acao.ok}</Aviso>{formulario}</>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(p) => p.id}
      aoClicar={pode ? (p) => abrir(p) : undefined}
      nomeArquivo="promocoes"
      vazio="Nenhuma promoção."
      acoesLote={pode ? [
        { rotulo: 'Ativar', executar: async (l) => { for (const p of l) await api(`/equipe/marketing/promocoes/${p.id}`, { metodo: 'PATCH', corpo: { ativo: true } }); await recarregar(); } },
        { rotulo: 'Inativar', confirmar: 'Inativar {n} promoção(ões)?', executar: async (l) => { for (const p of l) await api(`/equipe/marketing/promocoes/${p.id}`, { metodo: 'PATCH', corpo: { ativo: false } }); await recarregar(); } },
      ] : undefined}
    />
  );
}
