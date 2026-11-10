'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Carregando, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface LinhaPrevia { linha: number; codigo: string; acao: 'criar' | 'alterar' | 'sem_mudanca' | 'erro'; erros: string[]; mudancas: Record<string, { de: unknown; para: unknown }>; valores: Record<string, unknown> }
interface Previa { linhas: LinhaPrevia[]; ignoradas: string[]; resumo: { total: number; criar: number; alterar: number; sem_mudanca: number; erro: number } }
interface Historico { id: number; arquivo: string; linhas: number; criados: number; alterados: number; com_erro: number; erros: Array<{ linha: number; mensagens: string[] }>; criado_em: string; criado_por: string | null }

const ACAO: Record<string, string> = { criar: 'Novo', alterar: 'Altera', sem_mudanca: 'Sem mudança', erro: 'Erro' };
const COR: Record<string, string> = { criar: 'aprovada', alterar: 'em_aberto', sem_mudanca: 'rascunho', erro: 'recusada' };
const CAMPO: Record<string, string> = { nome: 'Nome', categoria_id: 'Categoria', preco_tabela_centavos: 'Preço', estoque: 'Estoque', multiplo_venda: 'Múltiplo', unidade: 'Unidade', marca: 'Marca', ncm: 'NCM', ativo: 'Ativo' };
const MODELO = 'codigo;nome;categoria;preco;estoque;multiplo;unidade;marca;ncm;ativo\nEP-0001;Luva nitrílica caixa com 100;epis;89,90;500;10;cx;ProtegeMax;40151900;sim\n';
const valor = (campo: string, v: unknown) => (v === null || v === undefined ? '—' : campo === 'preco_tabela_centavos' ? reais(v as number) : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v));

/** Configurações → Importar produtos (no Bagisto, "Transferência de dados"): planilha CSV com prévia antes de gravar. */
export default function ImportarProdutos() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const historico = useDados<Historico[]>('/equipe/configuracoes/importacoes');
  const [conteudo, setConteudo] = useState('');
  const [arquivo, setArquivo] = useState('planilha.csv');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const ver = useAcao();
  const gravar = useAcao();

  const ler = async (f: File) => { setArquivo(f.name); setConteudo(await f.text()); setPrevia(null); };
  const conferir = () => ver.executar(async () => setPrevia(await api<Previa>('/equipe/configuracoes/importar/previa', { corpo: { conteudo } })));
  const aplicar = () => gravar.executar(async () => {
    const r = await api<{ criados: number; alterados: number; erro: number }>('/equipe/configuracoes/importar', { corpo: { conteudo, arquivo } });
    setPrevia(null);
    setConteudo('');
    await historico.recarregar();
    return r;
  }, 'Planilha importada');
  const baixarModelo = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + MODELO], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'modelo-produtos.csv' });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Cabecalho titulo="Importar produtos" sub="Crie ou altere produtos em lote com uma planilha CSV (separador ; ou ,). Campo vazio não muda nada. Nada é gravado antes da prévia." />
      {!pode && <Aviso tipo="info">Só o comercial e o administrador importam planilhas.</Aviso>}
      <section className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }}>
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          <label className="botao secundario" style={{ cursor: 'pointer' }}>
            Escolher arquivo CSV
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); }} />
          </label>
          <button type="button" className="botao leve" onClick={baixarModelo}>Baixar planilha modelo</button>
          <span className="pequeno muted">Colunas: codigo (obrigatória), nome, categoria, preco, estoque, multiplo, unidade, marca, ncm, ativo. Exporte em Catálogo → Produtos para editar os atuais.</span>
        </div>
        <textarea rows={6} value={conteudo} onChange={(e) => { setConteudo(e.target.value); setPrevia(null); }} placeholder={MODELO} aria-label="Conteúdo da planilha" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', fontWeight: 400 }} />
        <div className="linha">
          <button className="botao" disabled={!conteudo.trim() || ver.enviando || !pode} onClick={() => void conferir()}>Ver prévia</button>
          {previa && <button className="botao" disabled={gravar.enviando || previa.resumo.criar + previa.resumo.alterar === 0} onClick={() => void aplicar()}>
            Gravar {previa.resumo.criar + previa.resumo.alterar} linha(s) válida(s)</button>}
        </div>
        <Aviso tipo="erro">{ver.erro ?? gravar.erro}</Aviso>
        <Aviso tipo="ok">{gravar.ok}</Aviso>
      </section>

      {previa && (
        <section className="pn-caixa tabela-rolagem" style={{ padding: 18, marginBottom: 16 }} aria-label="Prévia da importação">
          <div className="linha" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <b>Prévia de {arquivo}</b>
            <span className="pequeno">{previa.resumo.total} linha(s): {previa.resumo.criar} nova(s), {previa.resumo.alterar} alteração(ões), {previa.resumo.sem_mudanca} sem mudança, {previa.resumo.erro} com erro (ficam de fora).</span>
            {previa.ignoradas.length > 0 && <span className="pequeno muted">Colunas ignoradas: {previa.ignoradas.join(', ')}.</span>}
          </div>
          <table>
            <thead><tr><th>Linha</th><th>Código</th><th>O que acontece</th><th>Detalhes</th></tr></thead>
            <tbody>{previa.linhas.map((l) => (
              <tr key={l.linha}>
                <td>{l.linha}</td>
                <td><code>{l.codigo || '—'}</code></td>
                <td><Situacao valor={COR[l.acao]} nomes={{ [COR[l.acao]]: ACAO[l.acao] }} /></td>
                <td className="pequeno">
                  {l.acao === 'erro' && <span style={{ color: 'var(--vermelho)' }}>{l.erros.join(' ')}</span>}
                  {l.acao === 'alterar' && Object.entries(l.mudancas).map(([k, m]) => <div key={k}>{CAMPO[k] ?? k}: {valor(k, m.de)} → <b>{valor(k, m.para)}</b></div>)}
                  {l.acao === 'criar' && Object.entries(l.valores).map(([k, v]) => `${CAMPO[k] ?? k}: ${valor(k, v)}`).join(' · ')}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section className="pn-caixa tabela-rolagem" style={{ padding: 18 }}>
        <b>Importações anteriores</b>
        {!historico.dados ? <Carregando /> : !historico.dados.length ? <p className="muted pequeno">Nenhuma ainda.</p> : (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Quando</th><th>Arquivo</th><th className="direita">Linhas</th><th className="direita">Novos</th><th className="direita">Alterados</th><th>Erros</th></tr></thead>
            <tbody>{historico.dados.map((h) => (
              <tr key={h.id}>
                <td className="pequeno">{dataHora(h.criado_em)}<div className="muted">{h.criado_por}</div></td>
                <td>{h.arquivo}</td><td className="direita">{h.linhas}</td><td className="direita">{h.criados}</td><td className="direita">{h.alterados}</td>
                <td className="pequeno">{h.com_erro ? <details><summary>{h.com_erro} linha(s)</summary>{h.erros.map((e) => <div key={e.linha}>Linha {e.linha}: {e.mensagens.join(' ')}</div>)}</details> : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
