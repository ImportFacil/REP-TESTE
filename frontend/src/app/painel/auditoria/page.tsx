'use client';
import { useState } from 'react';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Registro { id: number; acao: string; entidade: string; entidade_id: string; antes: unknown; depois: unknown; ip: string | null; criado_em: string; usuario_nome: string | null; usuario_email: string | null }

const ENTIDADES = ['', 'empresa', 'usuario', 'cadastro_credito', 'pedido', 'tabela_preco', 'produto', 'politica_pagamento', 'orcamento', 'ordem_importacao'];

export default function Auditoria() {
  const [entidade, setEntidade] = useState('');
  const { dados, erro, carregando } = useDados<Registro[]>(`/equipe/auditoria?limite=200${entidade ? `&entidade=${entidade}` : ''}`);
  return (
    <>
      <Cabecalho titulo="Auditoria" sub="Quem fez o quê e quando, em ações de dinheiro, crédito e cadastro. Os registros não podem ser alterados.">
        <select value={entidade} onChange={(e) => setEntidade(e.target.value)} aria-label="Assunto">{ENTIDADES.map((e) => <option key={e} value={e}>{e ? e.replace(/_/g, ' ') : 'Todos os assuntos'}</option>)}</select>
      </Cabecalho>
      <Aviso tipo="erro">{erro}</Aviso>
      {carregando ? <Carregando /> : !dados?.length ? <Vazio>Nenhum registro.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead>
            <tbody>{dados.map((r) => (
              <tr key={r.id}>
                <td className="pequeno">{dataHora(r.criado_em)}</td>
                <td className="pequeno">{r.usuario_nome ?? 'Sistema'}<div className="muted">{r.ip}</div></td>
                <td><b>{r.acao}</b></td>
                <td className="pequeno">{r.entidade} {r.entidade_id.slice(0, 13)}</td>
                <td>{(r.antes != null || r.depois != null) && (
                  <details><summary className="pequeno">ver</summary><pre className="codigo-copia" style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ antes: r.antes, depois: r.depois }, null, 1)}</pre></details>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
