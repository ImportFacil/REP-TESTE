'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CorpoPedido, type PedidoDetalhe } from '@/components/Pedido';
import { useEu } from '@/components/Shell';
import { VendasDoPedido } from '@/components/painel/VendasDoPedido';
import { Aviso, Cabecalho, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { SITUACAO_PEDIDO, dataHora } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';
import { carregarConfig } from '@/lib/config';
import { useEffect } from 'react';

const PROXIMA: Record<string, string> = { novo: 'em_separacao', em_separacao: 'enviado', enviado: 'entregue' };

export default function PedidoPainel() {
  const id = useParametro('id');
  const { eu } = useEu();
  const papel = eu.usuario.papel;
  const { dados: p, erro, setDados, recarregar } = useDados<PedidoDetalhe>(id ? `/equipe/pedidos/${id}` : null);
  const acao = useAcao();
  const [motivo, setMotivo] = useState('');
  const [simulador, setSimulador] = useState(false);
  useEffect(() => { carregarConfig().then((c) => setSimulador(c.ambiente !== 'prod')).catch(() => undefined); }, []);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!p) return <Carregando />;
  const executar = (caminho: string, corpo?: unknown) => acao.executar(async () => setDados(await api<PedidoDetalhe>(`/equipe/pedidos/${p.id}/${caminho}`, { metodo: 'POST', corpo })));
  const proxima = PROXIMA[p.situacao];

  return (
    <>
      <p className="pequeno"><Link href="/painel/pedidos/">‹ Pedidos</Link></p>
      <Cabecalho titulo={`Pedido ${p.id}`} sub={`${p.razao_social} · ${p.comprador} · ${dataHora(p.criado_em)}`}>
        {proxima === 'em_separacao' && ['comercial', 'administrador'].includes(papel) && <button className="botao" disabled={acao.enviando} onClick={() => void executar('avancar')}>Marcar como {SITUACAO_PEDIDO[proxima].toLowerCase()}</button>}
        {p.situacao_pagamento === 'aguardando_faturamento' && p.situacao !== 'cancelado' && ['financeiro', 'administrador'].includes(papel) && (
          <button className="botao" disabled={acao.enviando} onClick={() => void executar('faturar')}>Faturar e emitir boletos</button>
        )}
      </Cabecalho>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <CorpoPedido
        p={p}
        acoesParcela={simulador ? (parcelaId) => (
          <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void acao.executar(async () => { await api(`/equipe/simulador/parcelas/${parcelaId}/confirmar`, { metodo: 'POST' }); await recarregar(); })}>
            Simular confirmação do banco
          </button>
        ) : undefined}
      />
      <VendasDoPedido pedido={p} papel={papel} aoMudar={recarregar} />
      {['novo', 'em_separacao'].includes(p.situacao) && (
        <div className="cartao formulario" style={{ marginTop: 20, maxWidth: 520 }}>
          <h2>Cancelar pedido</h2>
          <p className="pequeno muted">Devolve o estoque e cancela as cobranças pendentes. Pedido com pagamento confirmado precisa de estorno no gateway antes.</p>
          <input placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div><button className="botao perigo" disabled={acao.enviando || motivo.trim().length < 3} onClick={() => void executar('cancelar', { motivo })}>Cancelar pedido</button></div>
        </div>
      )}
    </>
  );
}
