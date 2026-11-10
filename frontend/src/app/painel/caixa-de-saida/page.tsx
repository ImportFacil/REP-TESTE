'use client';
import { useState } from 'react';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Aviso {
  id: number; destinatario: string; canal: string; modelo: string; modelo_nome: string; situacao: string; criado_em: string; enviado_em: string | null;
  razao_social: string | null; assunto: string; corpo: string;
}

const SITUACOES = { pendente: 'Na fila', enviada: 'Enviada', falhou: 'Falhou' };

/** Marketing → Caixa de saída: todos os avisos gerados, com o texto montado a partir do modelo. */
export default function CaixaDeSaida() {
  const { dados, carregando } = useDados<Aviso[]>('/equipe/marketing/caixa-de-saida');
  const [aberto, setAberto] = useState<Aviso | null>(null);
  const modelos = Object.fromEntries((dados ?? []).map((a) => [a.modelo, a.modelo_nome]));
  const colunas: Coluna<Aviso>[] = [
    { chave: 'assunto', titulo: 'Assunto', render: (a) => <><b>{a.assunto}</b><div className="pequeno muted">{a.modelo_nome}</div></> },
    { chave: 'modelo', titulo: 'Modelo', filtro: 'opcoes', opcoes: modelos, oculta: true, valorCsv: (a) => a.modelo_nome },
    { chave: 'destinatario', titulo: 'Para', filtro: 'texto', render: (a) => <>{a.destinatario}{a.razao_social && <div className="pequeno muted">{a.razao_social}</div>}</> },
    { chave: 'razao_social', titulo: 'Empresa', filtro: 'opcoes', oculta: true },
    { chave: 'criado_em', titulo: 'Gerado em', ordenavel: true, filtro: 'data', render: (a) => dataHora(a.criado_em) },
    { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACOES, render: (a) => <Situacao valor={a.situacao} nomes={SITUACOES} />, valorCsv: (a) => SITUACOES[a.situacao as keyof typeof SITUACOES] },
  ];
  return (
    <Grade
      titulo="Caixa de saída"
      sub="Avisos da régua de cobrança, do envio dos pedidos e da newsletter. Ficam na fila até o Amazon SES ser configurado. Clique para ler."
      topo={aberto && (
        <section className="pn-caixa" style={{ padding: 18, marginBottom: 16 }} aria-label="Aviso aberto">
          <div className="linha entre"><h2 style={{ margin: 0 }}>{aberto.assunto}</h2><button className="botao leve" onClick={() => setAberto(null)}>Fechar</button></div>
          <p className="pequeno muted">Para {aberto.destinatario} · {aberto.modelo_nome} · {dataHora(aberto.criado_em)}</p>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{aberto.corpo}</div>
        </section>
      )}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={colunas}
      chave={(a) => a.id}
      aoClicar={setAberto}
      ordemInicial={{ chave: 'criado_em', dir: 'desc' }}
      nomeArquivo="caixa-de-saida"
      vazio="Nenhum aviso gerado ainda."
    />
  );
}
