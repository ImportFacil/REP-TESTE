'use client';
import { useEffect, useState } from 'react';
import { ResumoLimite, type DetalheCredito } from '@/components/Credito';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando, Situacao } from '@/components/ui';
import { api, baixar } from '@/lib/api';
import { SITUACAO_CADASTRO, data, paraCentavos, paraTexto } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

export default function Credito() {
  const { eu } = useEu();
  const aprovador = eu.usuario.papel === 'aprovador';
  const { dados: d, erro, recarregar, setDados } = useDados<DetalheCredito>('/credito/cadastro');
  const salvar = useAcao();
  const envio = useAcao();
  const [form, setForm] = useState({ faturamento: '', compras: '', limite: '', anos: '' });

  useEffect(() => {
    if (!d) return;
    setForm({
      faturamento: paraTexto(d.cadastro.faturamento_mensal_centavos),
      compras: paraTexto(d.cadastro.compras_mensais_previstas_centavos),
      limite: paraTexto(d.cadastro.limite_solicitado_centavos),
      anos: d.cadastro.anos_cnpj?.toString() ?? '',
    });
  }, [d]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!d) return <Carregando />;
  const editavel = aprovador && d.cadastro.situacao !== 'em_analise';

  const gravar = () =>
    salvar.executar(async () => {
      const corpo = {
        faturamento_mensal_centavos: paraCentavos(form.faturamento) ?? undefined,
        compras_mensais_previstas_centavos: paraCentavos(form.compras) ?? undefined,
        limite_solicitado_centavos: paraCentavos(form.limite) ?? undefined,
        anos_cnpj: form.anos ? Number(form.anos) : undefined,
      };
      setDados(await api<DetalheCredito>('/credito/cadastro', { metodo: 'PUT', corpo }));
    }, 'Dados salvos.');

  const enviarArquivo = (tipo: string, arquivo: File | undefined) => {
    if (!arquivo) return;
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    return envio.executar(async () => {
      await api(`/credito/documentos?tipo=${tipo}`, { arquivo: fd });
      await recarregar();
    }, 'Documento enviado.');
  };

  return (
    <>
      <Cabecalho titulo="Cadastro e crédito" sub="O limite vale para o boleto parcelado. Pix e cartão não usam limite.">
        <Situacao valor={d.cadastro.situacao} nomes={SITUACAO_CADASTRO} />
      </Cabecalho>
      <ResumoLimite d={d} />
      {d.cadastro.parecer && <div style={{ marginTop: 16 }}><Aviso tipo={d.cadastro.situacao === 'aprovado' ? 'ok' : d.cadastro.situacao === 'reprovado' ? 'erro' : 'atencao'}>Parecer da Export Fácil: {d.cadastro.parecer}</Aviso></div>}
      {d.cadastro.situacao === 'em_analise' && <div style={{ marginTop: 16 }}><Aviso tipo="info">Cadastro em análise desde {data(d.cadastro.enviado_em)}. O financeiro responde por aqui.</Aviso></div>}
      {!aprovador && <div style={{ marginTop: 16 }}><Aviso tipo="info">Só o aprovador da empresa preenche e envia o cadastro.</Aviso></div>}

      <div className="grade grade-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <form className="cartao formulario" onSubmit={(e) => { e.preventDefault(); void gravar(); }}>
          <h2>Dados financeiros</h2>
          <Campo rotulo="Faturamento mensal médio (R$)"><input inputMode="decimal" value={form.faturamento} disabled={!editavel} onChange={(e) => setForm({ ...form, faturamento: e.target.value })} required /></Campo>
          <Campo rotulo="Compras mensais previstas na Export Fácil (R$)" dica="A partir de R$ 400.000,00 por mês a empresa pode importar por conta e ordem.">
            <input inputMode="decimal" value={form.compras} disabled={!editavel} onChange={(e) => setForm({ ...form, compras: e.target.value })} />
          </Campo>
          <Campo rotulo="Limite de crédito desejado (R$)" dica="Acima de R$ 100.000,00 pedimos balanço e DRE."><input inputMode="decimal" value={form.limite} disabled={!editavel} onChange={(e) => setForm({ ...form, limite: e.target.value })} required /></Campo>
          <Campo rotulo="Anos de CNPJ"><input inputMode="numeric" value={form.anos} disabled={!editavel} onChange={(e) => setForm({ ...form, anos: e.target.value.replace(/\D/g, '') })} /></Campo>
          <Aviso tipo="erro">{salvar.erro}</Aviso>
          <Aviso tipo="ok">{salvar.ok}</Aviso>
          {editavel && <button className="botao" disabled={salvar.enviando}>Salvar</button>}
        </form>

        <div className="cartao pilha">
          <h2>Documentos</h2>
          <p className="pequeno muted">PDF, JPG ou PNG, até 10 MB cada.</p>
          {d.exigidos.map((x) => {
            const doc = d.documentos.find((y) => y.tipo === x.tipo);
            return (
              <div key={x.tipo} className="linha entre" style={{ borderBottom: '1px solid var(--borda)', paddingBottom: 10 }}>
                <span style={{ flex: '1 1 220px' }}>
                  {x.enviado ? '✅' : '⬜'} {x.descricao}
                  {doc && <div className="pequeno"><button className="botao leve pequeno" onClick={() => void baixar(`/credito/documentos/${doc.id}`, doc.nome_arquivo)}>{doc.nome_arquivo}</button></div>}
                </span>
                {editavel && (
                  <label className="botao secundario pequeno">
                    {x.enviado ? 'Trocar' : 'Enviar'}
                    <input type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => void enviarArquivo(x.tipo, e.target.files?.[0])} />
                  </label>
                )}
              </div>
            );
          })}
          <Aviso tipo="erro">{envio.erro}</Aviso>
          <Aviso tipo="ok">{envio.ok}</Aviso>
          {editavel && (
            <button className="botao" disabled={envio.enviando || d.faltando.length > 0} onClick={() => void envio.executar(async () => { setDados(await api<DetalheCredito>('/credito/cadastro/enviar', { metodo: 'POST' })); }, 'Cadastro enviado para análise.')}>
              {d.faltando.length ? `Faltam ${d.faltando.length} documento(s)` : 'Enviar para análise'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
