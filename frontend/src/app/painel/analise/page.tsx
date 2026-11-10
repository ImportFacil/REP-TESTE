'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ResumoLimite, type DetalheCredito } from '@/components/Credito';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando, Situacao } from '@/components/ui';
import { api, baixar } from '@/lib/api';
import { NOMES_TIPO, SITUACAO_CADASTRO, cnpj, data, dataHora, paraCentavos, reais } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

type Detalhe = DetalheCredito & { sugestao: { referencia_centavos: number; teto_faturamento_centavos: number; sugerido_centavos: number } };

export default function AnaliseCredito() {
  const empresa = useParametro('empresa');
  const { eu } = useEu();
  const pode = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const { dados: d, erro, setDados, recarregar } = useDados<Detalhe>(empresa ? `/equipe/credito/${empresa}` : null);
  const [form, setForm] = useState({ acao: 'aprovar', faixa: 'A', limite: '', parecer: '' });
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!d) return <Carregando />;
  const c = d.cadastro;

  const decidir = () =>
    acao.executar(async () => {
      const r = await api<DetalheCredito>(`/equipe/credito/${d.empresa.id}/decisao`, {
        corpo: { acao: form.acao, parecer: form.parecer, ...(form.acao === 'aprovar' && { faixa: form.faixa, limite_centavos: paraCentavos(form.limite) ?? 0 }) },
      });
      setDados({ ...d, ...r });
      await recarregar();
    }, 'Decisão registrada.');

  return (
    <>
      <p className="pequeno"><Link href="/painel/credito/">‹ Crédito</Link></p>
      <Cabecalho titulo={d.empresa.razao_social} sub={`CNPJ ${cnpj(d.empresa.cnpj)} · ${NOMES_TIPO[d.empresa.tipo_cliente] ?? d.empresa.tipo_cliente}`}>
        <Situacao valor={c.situacao} nomes={SITUACAO_CADASTRO} />
        <Link className="botao secundario" href={`/painel/empresa/?id=${d.empresa.id}`}>Empresa</Link>
      </Cabecalho>
      <ResumoLimite d={d} />
      <div className="grade grade-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="pilha">
          <div className="cartao pilha">
            <h2>Dados declarados</h2>
            <div className="linha entre"><span>Faturamento mensal</span><b>{reais(c.faturamento_mensal_centavos)}</b></div>
            <div className="linha entre"><span>Compras mensais previstas</span><b>{reais(c.compras_mensais_previstas_centavos)}</b></div>
            <div className="linha entre"><span>Limite solicitado</span><b>{reais(c.limite_solicitado_centavos)}</b></div>
            <div className="linha entre"><span>Anos de CNPJ</span><b>{c.anos_cnpj ?? '—'}</b></div>
            <div className="linha entre"><span>Enviado em</span><span>{dataHora(c.enviado_em)}</span></div>
          </div>
          <div className="cartao pilha">
            <h2>Documentos</h2>
            {d.exigidos.map((x) => {
              const doc = d.documentos.find((y) => y.tipo === x.tipo);
              return (
                <div key={x.tipo} className="linha entre">
                  <span>{x.enviado ? '✅' : '⬜'} {x.descricao}</span>
                  {doc && <button className="botao leve pequeno" onClick={() => void baixar(`/equipe/credito/${d.empresa.id}/documentos/${doc.id}`, doc.nome_arquivo)}>Baixar</button>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="pilha">
          <div className="cartao pilha">
            <h2>Decisão</h2>
            <p className="pequeno muted">
              Referência do tipo: {reais(d.sugestao.referencia_centavos)} (2× o pedido mínimo). Teto: {reais(d.sugestao.teto_faturamento_centavos)} (10% do faturamento).
              Sugerido para a faixa {c.faixa ?? 'A'}: {reais(d.sugestao.sugerido_centavos)}.
            </p>
            {c.parecer && <Aviso tipo="info">Último parecer: {c.parecer}</Aviso>}
            {pode ? (
              <form className="formulario" onSubmit={(e) => { e.preventDefault(); void decidir(); }}>
                <Campo rotulo="Ação">
                  <select value={form.acao} onChange={(e) => setForm({ ...form, acao: e.target.value })}>
                    <option value="aprovar">Aprovar (ou revisar) limite</option><option value="pedir_documentos">Pedir documentos</option><option value="reprovar">Reprovar</option>
                  </select>
                </Campo>
                {form.acao === 'aprovar' && (
                  <div className="grade grade-2">
                    <Campo rotulo="Faixa" dica="A: até 4×; B: metade do limite e até 2×; C: sem boleto">
                      <select value={form.faixa} onChange={(e) => setForm({ ...form, faixa: e.target.value })}><option>A</option><option>B</option><option>C</option></select>
                    </Campo>
                    <Campo rotulo="Limite (R$)"><input inputMode="decimal" value={form.limite} disabled={form.faixa === 'C'} onChange={(e) => setForm({ ...form, limite: e.target.value })} required={form.faixa !== 'C'} /></Campo>
                  </div>
                )}
                <Campo rotulo="Parecer" dica="O cliente vê este texto."><textarea value={form.parecer} onChange={(e) => setForm({ ...form, parecer: e.target.value })} required minLength={3} /></Campo>
                <Aviso tipo="erro">{acao.erro}</Aviso>
                <Aviso tipo="ok">{acao.ok}</Aviso>
                <div><button className="botao" disabled={acao.enviando}>Registrar decisão</button></div>
              </form>
            ) : <Aviso tipo="info">Só o financeiro e o administrador decidem o crédito.</Aviso>}
          </div>
          {d.historico_limites.length > 0 && (
            <div className="cartao">
              <h2>Histórico de limites</h2>
              <table><tbody>{d.historico_limites.map((h, k) => (
                <tr key={k}><td>{data(h.criado_em)}</td><td>Faixa {h.faixa} · {reais(h.valor_centavos)}</td><td className="pequeno muted">{h.aprovado_por}</td></tr>
              ))}</tbody></table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
