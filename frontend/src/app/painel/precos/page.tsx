'use client';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { paraCentavos, paraTexto, pct, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Tabela { tipo_cliente: string; nome: string; desconto_bp: number; pedido_minimo_centavos: number; ativo: boolean }
interface Produto { id: number; codigo: string; nome: string; categoria_nome: string; preco_tabela_centavos: number; estoque: number; ativo: boolean; destaque: boolean; sob_orcamento: boolean }

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

function LinhaProduto({ p, pode }: { p: Produto; pode: boolean }) {
  const [preco, setPreco] = useState(paraTexto(p.preco_tabela_centavos));
  const [estoque, setEstoque] = useState(String(p.estoque));
  const [ativo, setAtivo] = useState(p.ativo);
  const acao = useAcao();
  const salvar = (mudancas: Record<string, unknown>) => acao.executar(() => api(`/equipe/produtos/${p.id}`, { metodo: 'PATCH', corpo: mudancas }), 'Salvo');
  return (
    <tr style={{ opacity: ativo ? 1 : 0.55 }}>
      <td><b>{p.nome}</b><div className="pequeno muted">{p.codigo} · {p.categoria_nome}</div></td>
      <td>{pode ? <input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} style={{ maxWidth: 130 }} aria-label="Preço de tabela" /> : reais(p.preco_tabela_centavos)}</td>
      <td>{pode ? <input inputMode="numeric" value={estoque} onChange={(e) => setEstoque(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 90 }} aria-label="Estoque" /> : p.estoque}</td>
      <td className="direita">
        {pode && (
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void salvar({ preco_tabela_centavos: paraCentavos(preco), estoque: Number(estoque) })}>{acao.ok ?? 'Salvar'}</button>
            <button className="botao leve pequeno" disabled={acao.enviando} onClick={() => void salvar({ ativo: !ativo }).then(() => setAtivo(!ativo))}>{ativo ? 'Tirar do catálogo' : 'Voltar ao catálogo'}</button>
          </div>
        )}
        {acao.erro && <div className="pequeno" style={{ color: 'var(--vermelho)' }}>{acao.erro}</div>}
      </td>
    </tr>
  );
}

export default function Precos() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const tabelas = useDados<Tabela[]>('/equipe/tabelas-preco');
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => { const t = setTimeout(() => setTermo(busca), 350); return () => clearTimeout(t); }, [busca]);
  const produtos = useDados<{ itens: Produto[]; total: number }>(`/catalogo/produtos?incluir_inativos=true&por_pagina=50${termo.trim() ? `&busca=${encodeURIComponent(termo.trim())}` : ''}`);
  return (
    <>
      <Cabecalho titulo="Preços e produtos" sub="O preço do cliente é o preço de tabela menos o desconto do tipo. Pedidos já feitos não mudam." />
      <div className="cartao tabela-rolagem" style={{ marginBottom: 20 }}>
        <h2>Tabelas por tipo de cliente</h2>
        {!tabelas.dados ? <Carregando /> : (
          <table><thead><tr><th>Tipo</th><th>Desconto (%)</th><th>Pedido mínimo (R$)</th><th /></tr></thead>
            <tbody>{tabelas.dados.map((t) => <LinhaTabela key={t.tipo_cliente} t={t} pode={pode} aoSalvar={() => void tabelas.recarregar()} />)}</tbody>
          </table>
        )}
      </div>
      <div className="cartao">
        <div className="linha entre" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Produtos {produtos.dados && <span className="muted pequeno">({produtos.dados.total})</span>}</h2>
          <input type="search" placeholder="Buscar produto ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320 }} />
        </div>
        <Aviso tipo="erro">{produtos.erro}</Aviso>
        {!produtos.dados ? <Carregando /> : (
          <div className="tabela-rolagem">
            <table><thead><tr><th>Produto</th><th>Preço de tabela (R$)</th><th>Estoque</th><th /></tr></thead>
              <tbody>{produtos.dados.itens.map((p) => <LinhaProduto key={`${p.id}-${p.preco_tabela_centavos}-${p.ativo}`} p={p} pode={pode} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
