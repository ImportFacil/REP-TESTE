'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CorpoOrcamento, type Orcamento } from '@/components/Importacao';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { paraCentavos, paraTexto } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

export default function OrcamentoPainel() {
  const id = useParametro('id');
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados: o, erro, setDados } = useDados<Orcamento>(id ? `/equipe/orcamentos/${id}` : null);
  const [precos, setPrecos] = useState<Record<number, string>>({});
  const [form, setForm] = useState({ frete: '0,00', taxa: '3', condicao: '', prazo: '90', validade: '15' });
  const acao = useAcao();
  useEffect(() => {
    if (!o) return;
    setPrecos(Object.fromEntries(o.itens.map((i) => [i.id, paraTexto(i.preco_unitario_centavos)])));
    if (o.condicao) setForm({ frete: paraTexto(o.frete_centavos), taxa: String((o.taxa_servico_bp ?? 300) / 100), condicao: o.condicao, prazo: String(o.prazo_entrega_dias ?? 90), validade: '15' });
    else setForm((f) => ({ ...f, condicao: o.modalidade === 'conta_e_ordem' ? 'Numerário por etapa (Pix ou TED); serviço por boleto ou cartão' : 'Pix, boleto 30/60/90/120 ou cartão até 12×' }));
  }, [o]);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!o) return <Carregando />;
  const editavel = pode && ['solicitado', 'enviado'].includes(o.situacao);

  const enviar = () =>
    acao.executar(async () => {
      setDados(await api<Orcamento>(`/equipe/orcamentos/${o.id}/proposta`, {
        metodo: 'PUT',
        corpo: {
          itens: o.itens.map((i) => ({ id: i.id, preco_unitario_centavos: paraCentavos(precos[i.id] ?? '') ?? 0 })),
          frete_centavos: paraCentavos(form.frete) ?? 0,
          ...(o.modalidade === 'conta_e_ordem' && { taxa_servico_bp: Math.round(Number(form.taxa.replace(',', '.')) * 100) }),
          condicao: form.condicao, prazo_entrega_dias: Number(form.prazo), validade_dias: Number(form.validade),
        },
      }));
    }, 'Proposta enviada ao cliente.');

  return (
    <>
      <p className="pequeno"><Link href="/painel/orcamentos/">‹ Orçamentos</Link></p>
      <Cabecalho titulo={`Orçamento ${o.id}`} sub={o.razao_social}>
        {o.ordem_id && <Link className="botao secundario" href={`/painel/ordem/?id=${o.ordem_id}`}>Ver ordem</Link>}
      </Cabecalho>
      <div className="grade grade-lado">
        <CorpoOrcamento o={o} />
        {editavel && (
          <form className="cartao formulario" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
            <h2>{o.situacao === 'enviado' ? 'Revisar proposta' : 'Montar proposta'}</h2>
            {o.itens.map((i) => (
              <Campo key={i.id} rotulo={`${i.descricao} (${i.quantidade} ${i.unidade})`} dica="Preço unitário em R$">
                <input inputMode="decimal" value={precos[i.id] ?? ''} onChange={(e) => setPrecos({ ...precos, [i.id]: e.target.value })} required />
              </Campo>
            ))}
            <div className="grade grade-2">
              <Campo rotulo="Frete (R$)"><input inputMode="decimal" value={form.frete} onChange={(e) => setForm({ ...form, frete: e.target.value })} /></Campo>
              {o.modalidade === 'conta_e_ordem' && <Campo rotulo="Taxa de serviço (%)"><input inputMode="decimal" value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} /></Campo>}
              <Campo rotulo="Prazo de entrega (dias)"><input inputMode="numeric" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} /></Campo>
              <Campo rotulo="Validade da proposta (dias)"><input inputMode="numeric" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} /></Campo>
            </div>
            <Campo rotulo="Condição de pagamento"><input value={form.condicao} onChange={(e) => setForm({ ...form, condicao: e.target.value })} required /></Campo>
            <Aviso tipo="erro">{acao.erro}</Aviso>
            <Aviso tipo="ok">{acao.ok}</Aviso>
            <div><button className="botao" disabled={acao.enviando}>Enviar proposta</button></div>
          </form>
        )}
      </div>
    </>
  );
}
