'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AcoesProduto } from '@/components/AcoesProduto';
import { adicionar } from '@/lib/carrinho';
import { reais } from '@/lib/formato';

export interface ProdutoApi {
  id: number;
  codigo: string;
  nome: string;
  marca: string | null;
  categoria_id: string;
  categoria_nome: string;
  subcategoria: string | null;
  descricao: string | null;
  unidade: string;
  multiplo_venda: number;
  estoque: number;
  preco_tabela_centavos: number;
  preco_cliente_centavos: number | null;
  sob_orcamento: boolean;
  destaque: boolean;
  importado: boolean;
  ativo: boolean;
  especificacoes: Array<{ nome: string; valor: string }>;
  atributos?: Record<string, string>;
  familia_id?: number | null;
}

export const ICONES: Record<string, string> = {
  maquinario: '🚜', pecas: '⚙️', irrigacao: '💧', epi: '🦺', roupas: '👕', acessorios: '🎒', ferramentas: '🔧', solar: '☀️',
  seguranca: '📹', tratores: '🚜', fertilizantes: '🌱', eletrico: '🔌', hidraulica: '🚰', fixacao: '🔩', limpeza: '🧽', home: '🏡',
  tinta: '🎨', luz: '💡', auto: '🚗', tijolo: '🧱', seringa: '💉', medico: '🩺', cama: '🛏️', lab: '🧪',
};

export function iconeCategoria(icone: string | null | undefined) {
  return ICONES[icone ?? ''] ?? '📦';
}

/** Seletor de quantidade que anda de acordo com o múltiplo de venda. */
export function Passo({ valor, multiplo, onChange }: { valor: number; multiplo: number; onChange: (v: number) => void }) {
  return (
    <div className="passo">
      <button type="button" aria-label="Diminuir" onClick={() => onChange(Math.max(0, valor - multiplo))}>−</button>
      <input
        inputMode="numeric"
        value={valor}
        aria-label="Quantidade"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
        onBlur={() => onChange(Math.max(multiplo, Math.round(valor / multiplo) * multiplo))}
      />
      <button type="button" aria-label="Aumentar" onClick={() => onChange(valor + multiplo)}>+</button>
    </div>
  );
}

export function CartaoProduto({ p, icone }: { p: ProdutoApi; icone?: string | null }) {
  const [qtd, setQtd] = useState(p.multiplo_venda);
  const [adicionado, setAdicionado] = useState(false);
  const desconto = p.preco_cliente_centavos ? Math.round((1 - p.preco_cliente_centavos / p.preco_tabela_centavos) * 100) : 0;
  return (
    <div className="cartao produto">
      <Link href={`/loja/produto/?id=${p.id}`} className="foto" aria-label={p.nome}>
        {desconto > 0 && <span className="desconto">-{desconto}%</span>}
        {iconeCategoria(icone)}
      </Link>
      <div className="linha entre" style={{ gap: 6 }}><span className="codigo">{p.marca} · {p.codigo}</span><AcoesProduto produtoId={p.id} /></div>
      <Link href={`/loja/produto/?id=${p.id}`} className="nome">{p.nome}</Link>
      {p.sob_orcamento ? (
        <>
          <span className="pequeno muted">Sob orçamento</span>
          <Link className="botao secundario pequeno" href={`/loja/orcamentos/?produto=${p.id}`}>Pedir orçamento</Link>
        </>
      ) : (
        <>
          <div>
            {desconto > 0 && <div className="de">{reais(p.preco_tabela_centavos)}</div>}
            <span className="por">{reais(p.preco_cliente_centavos ?? p.preco_tabela_centavos)}</span>
            <span className="pequeno muted"> / {p.unidade}</span>
          </div>
          <span className="pequeno muted">Vende de {p.multiplo_venda} em {p.multiplo_venda} · {p.estoque} em estoque</span>
          <div className="linha">
            <Passo valor={qtd} multiplo={p.multiplo_venda} onChange={setQtd} />
            <button
              className="botao pequeno"
              disabled={qtd <= 0 || p.estoque <= 0}
              onClick={() => {
                adicionar({ produto_id: p.id, quantidade: qtd, nome: p.nome, codigo: p.codigo, unidade: p.unidade, multiplo_venda: p.multiplo_venda, preco_cliente_centavos: p.preco_cliente_centavos ?? p.preco_tabela_centavos });
                setAdicionado(true);
                setTimeout(() => setAdicionado(false), 1500);
              }}
            >
              {adicionado ? 'Adicionado ✓' : 'Adicionar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
