'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Cabecalho, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { paraCentavos, paraTexto, pct, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Tabela { tipo_cliente: string; nome: string; desconto_bp: number; pedido_minimo_centavos: number; ativo: boolean }

function LinhaTabela({ t, pode, aoSalvar }: { t: Tabela; pode: boolean; aoSalvar: () => void }) {
  const [desc, setDesc] = useState(String(t.desconto_bp / 100));
  const [min, setMin] = useState(paraTexto(t.pedido_minimo_centavos));
  const acao = useAcao();
  return (
    <tr>
      <td><b>{t.nome}</b></td>
      <td>{pode ? <input inputMode="decimal" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ maxWidth: 90 }} aria-label="Desconto %" /> : pct(t.desconto_bp)}</td>
      <td>{pode ? <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} style={{ maxWidth: 160 }} aria-label="Pedido mínimo" /> : reais(t.pedido_minimo_centavos)}</td>
      <td className="direita">
        {pode && <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void acao.executar(async () => {
          await api(`/equipe/tabelas-preco/${t.tipo_cliente}`, { metodo: 'PUT', corpo: { desconto_bp: Math.round(Number(desc.replace(',', '.')) * 100), pedido_minimo_centavos: paraCentavos(min) } });
          aoSalvar();
        }, 'Salvo')}>{acao.ok ?? 'Salvar'}</button>}
        {acao.erro && <div className="pequeno" style={{ color: 'var(--vermelho)' }}>{acao.erro}</div>}
      </td>
    </tr>
  );
}

/** Grupos de clientes (no Bagisto, "Grupos"): cada tipo de cliente, com desconto e pedido mínimo. */
export default function GruposDeClientes() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const tabelas = useDados<Tabela[]>('/equipe/tabelas-preco');
  return (
    <>
      <Cabecalho titulo="Grupos de clientes" sub="Cada tipo de cliente é um grupo, com desconto sobre o preço de tabela e pedido mínimo. Pedidos já feitos não mudam." />
      <div className="cartao tabela-rolagem" style={{ marginBottom: 16 }}>
        <h2>Desconto e pedido mínimo por tipo</h2>
        {!tabelas.dados ? <Carregando /> : (
          <table><thead><tr><th>Tipo</th><th>Desconto (%)</th><th>Pedido mínimo (R$)</th><th /></tr></thead>
            <tbody>{tabelas.dados.map((t) => <LinhaTabela key={t.tipo_cliente} t={t} pode={pode} aoSalvar={() => void tabelas.recarregar()} />)}</tbody>
          </table>
        )}
      </div>
      <p className="pequeno muted">Os produtos, com preço de tabela e estoque, ficam em <Link href="/painel/produtos/">Catálogo → Produtos</Link>.</p>
    </>
  );
}
