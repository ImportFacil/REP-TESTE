'use client';
import { useState } from 'react';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { dataHora } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Registro { id: number; acao: string; entidade: string; entidade_id: string; antes: unknown; depois: unknown; ip: string | null; criado_em: string; usuario_nome: string | null; usuario_email: string | null }

const COLUNAS: Coluna<Registro>[] = [
  { chave: 'criado_em', titulo: 'Quando', ordenavel: true, filtro: 'data', render: (r) => dataHora(r.criado_em) },
  { chave: 'usuario_nome', titulo: 'Quem', filtro: 'opcoes', valor: (r) => r.usuario_nome ?? 'Sistema', render: (r) => <>{r.usuario_nome ?? 'Sistema'}<div className="pequeno muted">{r.ip}</div></> },
  { chave: 'acao', titulo: 'Ação', filtro: 'opcoes', render: (r) => <b>{r.acao}</b> },
  { chave: 'entidade', titulo: 'Assunto', filtro: 'opcoes', valor: (r) => r.entidade.replace(/_/g, ' '), render: (r) => <>{r.entidade.replace(/_/g, ' ')}<div className="pequeno muted">{r.entidade_id.slice(0, 13)}</div></> },
  { chave: 'entidade_id', titulo: 'Registro', oculta: true },
  { chave: 'detalhes', titulo: 'Detalhes', exportar: false, valor: () => '', render: () => <span className="pequeno muted">clique para ver</span> },
];

/** Configurações → Auditoria: quem fez o quê e quando. Os registros não podem ser alterados nem apagados. */
export default function Auditoria() {
  const { dados, carregando } = useDados<Registro[]>('/equipe/auditoria?limite=2000');
  const [aberto, setAberto] = useState<Registro | null>(null);
  return (
    <Grade
      titulo="Auditoria"
      sub="As 2.000 ações mais recentes de dinheiro, crédito, cadastro, catálogo e configuração. Os registros não podem ser alterados."
      topo={aberto && (
        <section className="pn-caixa" style={{ padding: 18, marginBottom: 16 }} aria-label="Registro aberto">
          <div className="linha entre"><b>{aberto.acao} · {aberto.entidade.replace(/_/g, ' ')} {aberto.entidade_id}</b><button className="botao leve" onClick={() => setAberto(null)}>Fechar</button></div>
          <p className="pequeno muted">{dataHora(aberto.criado_em)} · {aberto.usuario_nome ?? 'Sistema'} {aberto.usuario_email ? `(${aberto.usuario_email})` : ''} · {aberto.ip ?? 'sem IP'}</p>
          <div className="pn-dupla">
            <div><div className="pequeno muted">Antes</div><pre className="codigo-copia" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{JSON.stringify(aberto.antes, null, 2) ?? '—'}</pre></div>
            <div><div className="pequeno muted">Depois</div><pre className="codigo-copia" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{JSON.stringify(aberto.depois, null, 2) ?? '—'}</pre></div>
          </div>
        </section>
      )}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(r) => r.id}
      aoClicar={setAberto}
      ordemInicial={{ chave: 'criado_em', dir: 'desc' }}
      porPaginaInicial={20}
      nomeArquivo="auditoria"
      vazio="Nenhum registro."
    />
  );
}
