'use client';
import { GloboRota, n as nRota, type Rota } from '@/components/RotaMaritima';
import type { ReactNode } from 'react';
import { Copiar, Situacao } from './ui';
import { ETAPA_NUMERARIO, MODALIDADE, SITUACAO_ORCAMENTO, data, dataHora, pct, reais } from '@/lib/formato';

export interface Orcamento {
  id: number; razao_social: string; modalidade: string; situacao: string; observacao: string | null; frete_centavos: number | null; taxa_servico_bp: number | null;
  total_centavos: number | null; condicao: string | null; prazo_entrega_dias: number | null; valido_ate: string | null; criado_em: string; mercadoria_centavos: number; ordem_id: number | null;
  itens: Array<{ id: number; produto_id: number | null; descricao: string; unidade: string; quantidade: number; preco_unitario_centavos: number | null }>;
}

export interface Ordem {
  id: number; razao_social: string; modalidade: string; etapa: string; concluida: boolean; cancelada: boolean; criado_em: string;
  etapas: Array<{ id: string; nome: string; situacao: 'feita' | 'atual' | 'pendente'; exige?: string }>;
  eventos: Array<{ id: number; descricao: string; criado_em: string }>;
  numerarios: Array<{ id: number; etapa: string; valor_previsto_centavos: number; valor_pago_centavos: number; situacao: string; pago_em: string | null;
    cobranca: null | { situacao: string; expira_em: string | null; parcela_id: number; pix_copia_cola: string | null; situacao_parcela: string } }>;
  orcamento: Orcamento;
  porto_embarque: string | null; porto_chegada: string | null; embarque_em: string | null;
  rota: Rota | null;
  prestacao_contas: null | { por_etapa: Array<{ etapa: string; recebido_centavos: number; gasto_centavos: number; saldo_centavos: number }>; saldo_centavos: number; resultado: string;
    gastos: Array<{ id: number; etapa: string; descricao: string; valor_centavos: number; criado_em: string }> };
}

export function CorpoOrcamento({ o }: { o: Orcamento }) {
  const enviado = o.situacao !== 'solicitado';
  return (
    <div className="pilha">
      <div className="cartao">
        <div className="linha entre" style={{ marginBottom: 10 }}>
          <span><b>{MODALIDADE[o.modalidade]}</b> · pedido em {data(o.criado_em)}</span>
          <Situacao valor={o.situacao} nomes={SITUACAO_ORCAMENTO} />
        </div>
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Item</th><th className="direita">Qtd.</th>{enviado && <><th className="direita">Unitário</th><th className="direita">Total</th></>}</tr></thead>
            <tbody>{o.itens.map((i) => (
              <tr key={i.id}>
                <td>{i.descricao}</td><td className="direita">{i.quantidade} {i.unidade}</td>
                {enviado && <><td className="direita numero">{reais(i.preco_unitario_centavos)}</td><td className="direita numero">{reais((i.preco_unitario_centavos ?? 0) * i.quantidade)}</td></>}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {o.observacao && <p className="pequeno muted" style={{ marginTop: 10 }}>Obs.: {o.observacao}</p>}
      </div>
      {enviado && (
        <div className="cartao pilha">
          <h2>Proposta</h2>
          <div className="linha entre"><span>Mercadoria</span><span className="numero">{reais(o.mercadoria_centavos)}</span></div>
          {o.modalidade === 'conta_e_ordem' && <div className="linha entre"><span>Taxa de serviço ({pct(o.taxa_servico_bp ?? 0)})</span><span className="numero">{reais(Math.round((o.mercadoria_centavos * (o.taxa_servico_bp ?? 0)) / 10000))}</span></div>}
          <div className="linha entre"><span>Frete</span><span className="numero">{reais(o.frete_centavos)}</span></div>
          <div className="linha entre"><b>{o.modalidade === 'conta_e_ordem' ? 'Serviço + frete' : 'Total'}</b><b className="numero">{reais(o.total_centavos)}</b></div>
          {o.modalidade === 'conta_e_ordem' && <p className="pequeno muted">Na conta e ordem, mercadoria, tributos e despesas são pagos por numerário antes de cada etapa, com prestação de contas no fim.</p>}
          <p className="pequeno">Condição: {o.condicao} · Prazo: {o.prazo_entrega_dias} dias · Válida até {data(o.valido_ate)}</p>
        </div>
      )}
    </div>
  );
}

export function CorpoOrdem({ o, acoesNumerario, extra }: { o: Ordem; acoesNumerario?: (n: Ordem['numerarios'][number]) => ReactNode; extra?: ReactNode }) {
  return (
    <div className="grade grade-lado">
      <div className="pilha">
        <div className="cartao">
          <h2>Etapas</h2>
          <ul className="etapas">
            {o.etapas.map((e) => (
              <li key={e.id} className={e.situacao}><span className="ponto" /><span>{e.nome}{e.exige && e.situacao === 'pendente' && <span className="pequeno muted"> · exige numerário de {ETAPA_NUMERARIO[e.exige].toLowerCase()} pago</span>}</span></li>
            ))}
          </ul>
          {o.cancelada && <div className="aviso erro" style={{ marginTop: 10 }}>Ordem cancelada.</div>}
        </div>
        <div className="cartao">
          <h2>Histórico</h2>
          <ul className="etapas">{o.eventos.map((e) => <li key={e.id} className="feita"><span className="ponto" /><span>{e.descricao}<div className="pequeno muted">{dataHora(e.criado_em)}</div></span></li>)}</ul>
        </div>
        {extra}
      </div>
      <div className="pilha">
        {o.rota && (
          <div className="cartao pilha rota" id="ordemRota">
            <h2>Rota marítima: {o.rota.origem.nome} → {o.rota.destino.nome}</h2>
            <div className="rota-numeros">
              <div><b id="ordemPrazo">{nRota(o.rota.dias, 1)} dias</b><span>prazo estimado de viagem a {nRota(o.rota.velocidade_nos)} nós</span></div>
              <div><b id="ordemChegada">{o.rota.chegada_prevista ? data(`${o.rota.chegada_prevista}T12:00:00`) : 'A definir'}</b><span>{o.rota.chegada_prevista ? `chegada prevista · embarque em ${data(`${o.rota.embarque_em}T12:00:00`)}` : 'chegada prevista: falta a data de embarque'}</span></div>
              <div><b>{nRota(o.rota.distancia_mn)} mn</b><span>milhas náuticas ({nRota(o.rota.distancia_km)} km)</span></div>
              <div><b>{o.rota.passagens.length ? o.rota.passagens.map((p) => p.nome).join(', ') : 'Nenhum'}</b><span>canais e estreitos no caminho</span></div>
            </div>
            <GloboRota rota={o.rota} altura={320} />
            <p className="pequeno muted">Embarque em {o.rota.origem.nome}, {o.rota.origem.pais} ({o.rota.origem.codigo}); chegada em {o.rota.destino.nome}, {o.rota.destino.pais} ({o.rota.destino.codigo}). Estimativa pelo caminho comercial mais curto, com navegação contínua, sem escalas nem espera em porto.</p>
          </div>
        )}
        {o.modalidade === 'conta_e_ordem' && (
          <div className="cartao pilha">
            <h2>Numerário</h2>
            {!o.numerarios.length && <p className="muted pequeno">Nenhum numerário cobrado ainda.</p>}
            {o.numerarios.map((n) => (
              <div key={n.id} className="pilha" style={{ borderBottom: '1px solid var(--borda)', paddingBottom: 12 }}>
                <div className="linha entre"><b>{ETAPA_NUMERARIO[n.etapa]} · {reais(n.valor_previsto_centavos)}</b><Situacao valor={n.situacao} /></div>
                {n.situacao === 'aguardando' && n.cobranca?.situacao === 'pendente' && n.cobranca.pix_copia_cola && (
                  <><p className="pequeno muted">Pix válido até {dataHora(n.cobranca.expira_em)}</p><Copiar texto={n.cobranca.pix_copia_cola} rotulo="Copiar Pix" /></>
                )}
                {n.situacao === 'aguardando' && n.cobranca?.situacao === 'expirada' && <p className="pequeno" style={{ color: 'var(--vermelho)' }}>O Pix venceu.</p>}
                {acoesNumerario?.(n)}
              </div>
            ))}
          </div>
        )}
        {o.prestacao_contas && (
          <div className="cartao pilha">
            <h2>Prestação de contas</h2>
            <table>
              <thead><tr><th>Etapa</th><th className="direita">Recebido</th><th className="direita">Gasto</th><th className="direita">Saldo</th></tr></thead>
              <tbody>{o.prestacao_contas.por_etapa.map((e) => (
                <tr key={e.etapa}><td>{ETAPA_NUMERARIO[e.etapa]}</td><td className="direita numero">{reais(e.recebido_centavos)}</td><td className="direita numero">{reais(e.gasto_centavos)}</td><td className="direita numero">{reais(e.saldo_centavos)}</td></tr>
              ))}</tbody>
            </table>
            <div className="linha entre">
              <b>{o.prestacao_contas.resultado === 'devolver_ao_cliente' ? 'A devolver ao cliente' : o.prestacao_contas.resultado === 'cobrar_do_cliente' ? 'A cobrar do cliente' : 'Saldo'}</b>
              <b className="numero">{reais(Math.abs(o.prestacao_contas.saldo_centavos))}</b>
            </div>
            {o.prestacao_contas.gastos.length > 0 && (
              <details><summary className="pequeno">Gastos registrados ({o.prestacao_contas.gastos.length})</summary>
                <ul className="pequeno">{o.prestacao_contas.gastos.map((g) => <li key={g.id}>{ETAPA_NUMERARIO[g.etapa]}: {g.descricao} — {reais(g.valor_centavos)}</li>)}</ul>
              </details>
            )}
          </div>
        )}
        <div className="cartao">
          <h2>Orçamento {o.orcamento.id}</h2>
          <p className="pequeno">{o.orcamento.itens.map((i) => `${i.quantidade} ${i.unidade} · ${i.descricao}`).join('; ')}</p>
          <p className="pequeno muted">{o.orcamento.itens.length} item(ns) · mercadoria {reais(o.orcamento.mercadoria_centavos)}</p>
        </div>
      </div>
    </div>
  );
}
