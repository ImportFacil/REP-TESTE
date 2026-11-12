'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CorpoOrdem, type Ordem } from '@/components/Importacao';
import { CampoPorto, type Porto } from '@/components/RotaMaritima';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { carregarConfig } from '@/lib/config';
import { ETAPA_NUMERARIO, MODALIDADE, paraCentavos } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

export default function OrdemPainel() {
  const id = useParametro('id');
  const { eu } = useEu();
  const papel = eu.usuario.papel;
  const com = ['comercial', 'administrador'].includes(papel);
  const fin = ['financeiro', 'administrador'].includes(papel);
  const { dados: o, erro, setDados, recarregar } = useDados<Ordem>(id ? `/equipe/ordens/${id}` : null);
  const acao = useAcao();
  const [obs, setObs] = useState('');
  const [num, setNum] = useState({ etapa: 'cambio', valor: '' });
  const [gasto, setGasto] = useState({ etapa: 'cambio', valor: '', descricao: '' });
  const [motivo, setMotivo] = useState('');
  const [simulador, setSimulador] = useState(false);
  const portos = useDados<Porto[]>(com ? '/equipe/importacao/portos' : null);
  const [rota, setRota] = useState<{ origem: Porto | null; destino: Porto | null; embarque: string }>({ origem: null, destino: null, embarque: '' });
  const idOrdem = o?.id;
  useEffect(() => { // o formulário começa com a rota já salva na ordem
    if (o) setRota({ origem: o.rota?.origem ?? null, destino: o.rota?.destino ?? null, embarque: o.rota?.embarque_em ?? (o.embarque_em ? String(o.embarque_em).slice(0, 10) : '') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idOrdem, o?.porto_embarque, o?.porto_chegada, o?.embarque_em]);
  useEffect(() => { carregarConfig().then((c) => setSimulador(c.ambiente !== 'prod')).catch(() => undefined); }, []);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!o) return <Carregando />;
  const aberta = !o.concluida && !o.cancelada;
  const post = (caminho: string, corpo?: unknown, ok?: string) => acao.executar(async () => setDados(await api<Ordem>(caminho, { metodo: 'POST', corpo })), ok);
  const proxima = o.etapas[o.etapas.findIndex((e) => e.situacao === 'atual') + 1];

  return (
    <>
      <p className="pequeno"><Link href="/painel/ordens/">‹ Ordens</Link></p>
      <Cabecalho titulo={`Ordem ${o.id}`} sub={`${o.razao_social} · ${MODALIDADE[o.modalidade]}`} />
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      <CorpoOrdem
        o={o}
        acoesNumerario={(n) => (
          <div className="linha">
            {simulador && n.situacao === 'aguardando' && n.cobranca?.situacao === 'pendente' && (
              <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void acao.executar(async () => { await api(`/equipe/simulador/parcelas/${n.cobranca!.parcela_id}/confirmar`, { metodo: 'POST' }); await recarregar(); })}>Simular confirmação do banco</button>
            )}
            {fin && n.situacao === 'aguardando' && n.cobranca?.situacao !== 'pendente' && (
              <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void post(`/equipe/numerarios/${n.id}/novo-pix`)}>Gerar novo Pix</button>
            )}
          </div>
        )}
        extra={aberta ? (
          <div className="pilha">
            {com && (
              <form className="cartao formulario" id="formRota" onSubmit={(e) => {
                e.preventDefault();
                if (!rota.origem || !rota.destino) return;
                void acao.executar(async () => setDados(await api<Ordem>(`/equipe/ordens/${o.id}/rota`, { metodo: 'PUT', corpo: { porto_embarque: rota.origem!.codigo, porto_chegada: rota.destino!.codigo, embarque_em: rota.embarque || null } })), 'Rota da ordem salva.');
              }}>
                <h2>Rota marítima</h2>
                <CampoPorto id="ordemOrigem" rotulo="Porto de embarque" porto={rota.origem} principais={portos.dados ?? []} escolher={(p) => setRota((r) => ({ ...r, origem: p }))} />
                <CampoPorto id="ordemDestino" rotulo="Porto de chegada" porto={rota.destino} principais={portos.dados ?? []} escolher={(p) => setRota((r) => ({ ...r, destino: p }))} />
                <Campo rotulo="Data de embarque (prevista ou realizada)"><input type="date" value={rota.embarque} onChange={(e) => setRota((r) => ({ ...r, embarque: e.target.value }))} /></Campo>
                <div><button className="botao" disabled={acao.enviando || !rota.origem || !rota.destino}>{o.rota ? 'Atualizar rota' : 'Salvar rota'}</button></div>
              </form>
            )}
            {com && proxima && (
              <div className="cartao formulario">
                <h2>Avançar para “{proxima.nome}”</h2>
                <input placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
                <div><button className="botao" disabled={acao.enviando} onClick={() => void post(`/equipe/ordens/${o.id}/avancar`, { observacao: obs || undefined }).then(() => setObs(''))}>Avançar etapa</button></div>
              </div>
            )}
            {fin && o.modalidade === 'conta_e_ordem' && (
              <>
                <form className="cartao formulario" onSubmit={(e) => { e.preventDefault(); void post(`/equipe/ordens/${o.id}/numerarios`, { etapa: num.etapa, valor_centavos: paraCentavos(num.valor) }, 'Numerário cobrado por Pix.'); }}>
                  <h2>Cobrar numerário</h2>
                  <div className="grade grade-2">
                    <Campo rotulo="Etapa"><select value={num.etapa} onChange={(e) => setNum({ ...num, etapa: e.target.value })}>{Object.entries(ETAPA_NUMERARIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                    <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={num.valor} onChange={(e) => setNum({ ...num, valor: e.target.value })} required /></Campo>
                  </div>
                  <div><button className="botao" disabled={acao.enviando}>Cobrar por Pix</button></div>
                </form>
                <form className="cartao formulario" onSubmit={(e) => { e.preventDefault(); void acao.executar(async () => { setDados(await api<Ordem>(`/equipe/ordens/${o.id}/gastos`, { corpo: { etapa: gasto.etapa, descricao: gasto.descricao, valor_centavos: paraCentavos(gasto.valor) } })); setGasto({ ...gasto, valor: '', descricao: '' }); }, 'Gasto registrado.'); }}>
                  <h2>Registrar gasto real</h2>
                  <div className="grade grade-2">
                    <Campo rotulo="Etapa"><select value={gasto.etapa} onChange={(e) => setGasto({ ...gasto, etapa: e.target.value })}>{Object.entries(ETAPA_NUMERARIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                    <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={gasto.valor} onChange={(e) => setGasto({ ...gasto, valor: e.target.value })} required /></Campo>
                  </div>
                  <Campo rotulo="Descrição"><input value={gasto.descricao} onChange={(e) => setGasto({ ...gasto, descricao: e.target.value })} required minLength={2} /></Campo>
                  <div><button className="botao secundario" disabled={acao.enviando}>Registrar</button></div>
                </form>
              </>
            )}
            {com && (
              <div className="cartao formulario">
                <h2>Cancelar ordem</h2>
                <input placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <div><button className="botao perigo" disabled={acao.enviando || motivo.trim().length < 3} onClick={() => void post(`/equipe/ordens/${o.id}/cancelar`, { motivo })}>Cancelar ordem</button></div>
              </div>
            )}
          </div>
        ) : undefined}
      />
    </>
  );
}
