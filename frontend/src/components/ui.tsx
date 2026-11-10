'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status">{texto}</div>;
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'erro' | 'ok' | 'info' | 'atencao'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`aviso ${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>{children}</div>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>;
}

export function Etiqueta({ cor, children }: { cor?: 'verde' | 'ambar' | 'vermelho' | 'azul'; children: ReactNode }) {
  return <span className={`etiqueta ${cor ?? ''}`}>{children}</span>;
}

export function Cabecalho({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="cabecalho">
      <div>
        <h1>{titulo}</h1>
        {sub && <p className="sub" style={{ marginBottom: 0 }}>{sub}</p>}
      </div>
      {children && <div className="linha">{children}</div>}
    </div>
  );
}

export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="cartao indicador">
      <small>{rotulo}</small>
      <strong>{valor}</strong>
      {detalhe && <div className="pequeno muted">{detalhe}</div>}
    </div>
  );
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="campo">
      {rotulo}
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

/** Código para copiar (Pix copia e cola, linha digitável). */
export function Copiar({ texto, rotulo = 'Copiar código' }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="pilha">
      <div className="codigo-copia">{texto}</div>
      <button
        type="button"
        className="botao secundario pequeno"
        onClick={async () => {
          await navigator.clipboard?.writeText(texto).catch(() => undefined);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
      >
        {copiado ? 'Copiado!' : rotulo}
      </button>
    </div>
  );
}

const CORES: Record<string, 'verde' | 'ambar' | 'vermelho' | 'azul' | undefined> = {
  pago: 'verde', paga: 'verde', aprovado: 'verde', entregue: 'verde', aceito: 'verde', ativa: 'verde', concluida: 'verde',
  aguardando_pagamento: 'ambar', aguardando_faturamento: 'ambar', em_analise: 'ambar', solicitado: 'ambar', aberta: 'azul', aguardando: 'ambar',
  enviado: 'azul', em_separacao: 'azul', novo: 'azul', em_aberto: 'azul', pendente: 'ambar', pendente_documentos: 'ambar', rascunho: undefined,
  vencida: 'vermelho', pix_expirado: 'vermelho', reprovado: 'vermelho', cancelado: 'vermelho', cancelada: 'vermelho', bloqueada: 'vermelho',
  inativa: 'vermelho', recusado: 'vermelho', expirado: 'vermelho', expirada: 'vermelho',
};

const NOMES_PADRAO: Record<string, string> = {
  aberta: 'Em aberto', vencida: 'Vencida', paga: 'Paga', cancelada: 'Cancelada', aguardando: 'Aguardando pagamento', pago: 'Pago',
  ativa: 'Ativa', bloqueada: 'Bloqueada', inativa: 'Inativa', pendente: 'Pendente', expirada: 'Expirada',
};

export function Situacao({ valor, nomes }: { valor: string; nomes?: Record<string, string> }) {
  const texto = nomes?.[valor] ?? NOMES_PADRAO[valor] ?? valor.replace(/_/g, ' ');
  return <Etiqueta cor={CORES[valor]}>{texto.charAt(0).toUpperCase() + texto.slice(1)}</Etiqueta>;
}
