'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Campo, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Modelo { codigo: string; nome: string; descricao: string; assunto: string; corpo: string; variaveis: string[]; ativo: boolean }
interface Previa { assunto: string; corpo: string; desconhecidas: string[] }

/** Editor de um modelo de e-mail, com as variáveis disponíveis e a prévia com dados de exemplo. */
export default function EditarModelo() {
  const codigo = useParametro('codigo');
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados: modelos, recarregar } = useDados<Modelo[]>('/equipe/marketing/modelos');
  const m = modelos?.find((x) => x.codigo === codigo);
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const acao = useAcao();

  useEffect(() => { if (m) { setAssunto(m.assunto); setCorpo(m.corpo); setAtivo(m.ativo); } }, [m]);
  useEffect(() => {
    if (!m) return;
    const t = setTimeout(() => { api<Previa>(`/equipe/marketing/modelos/${m.codigo}/previa`, { corpo: { assunto, corpo } }).then(setPrevia).catch(() => undefined); }, 300);
    return () => clearTimeout(t);
  }, [m, assunto, corpo]);

  if (modelos && !m) return <Aviso tipo="erro">Modelo não encontrado.</Aviso>;
  if (!m) return <Carregando />;
  const salvar = () => acao.executar(async () => {
    await api(`/equipe/marketing/modelos/${m.codigo}`, { metodo: 'PATCH', corpo: { assunto, corpo, ativo } });
    await recarregar();
  }, 'Modelo salvo');
  const inserir = (v: string) => setCorpo((c) => `${c}{{${v}}}`);

  return (
    <>
      <p className="pequeno"><Link href="/painel/modelos/">‹ Modelos de e-mail</Link></p>
      <div className="pn-cabecalho">
        <div><h1>{m.nome}</h1><p className="sub muted">{m.descricao}</p></div>
        <div className="pn-cabecalho-acoes">{pode && <button className="botao" disabled={acao.enviando} onClick={() => void salvar()}>Salvar modelo</button>}</div>
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      <div className="pn-dupla" style={{ marginTop: 12 }}>
        <fieldset disabled={!pode} className="pn-caixa formulario" style={{ padding: 18, margin: 0 }}>
          <h2 style={{ margin: 0 }}>Texto</h2>
          <Campo rotulo="Assunto"><input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} /></Campo>
          <Campo rotulo="Mensagem"><textarea rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} style={{ fontFamily: 'inherit', fontWeight: 400 }} /></Campo>
          <div className="pequeno">
            <b>Variáveis</b> (clique para inserir no fim da mensagem):
            <div className="linha" style={{ marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
              {m.variaveis.map((v) => <button key={v} type="button" className="botao leve pequeno" onClick={() => inserir(v)}><code>{`{{${v}}}`}</code></button>)}
            </div>
          </div>
          <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo (desligado, este aviso deixa de ser mandado)</label>
        </fieldset>
        <section className="pn-caixa" style={{ padding: 18 }} aria-live="polite">
          <h2 style={{ marginTop: 0 }}>Prévia</h2>
          {!previa ? <Carregando /> : (
            <>
              {previa.desconhecidas.length > 0 && <Aviso tipo="atencao">Variáveis que este modelo não tem: {previa.desconhecidas.map((v) => `{{${v}}}`).join(', ')}.</Aviso>}
              <div className="pequeno muted">Assunto</div>
              <p style={{ fontWeight: 600, marginTop: 2 }}>{previa.assunto}</p>
              <div style={{ whiteSpace: 'pre-wrap', borderTop: '1px solid var(--borda)', paddingTop: 12, lineHeight: 1.6 }}>{previa.corpo}</div>
              <p className="pequeno muted">Com dados de exemplo. O envio de verdade começa quando o Amazon SES for configurado; até lá os avisos ficam na Caixa de saída.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
