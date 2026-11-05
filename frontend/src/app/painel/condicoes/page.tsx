'use client';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora, paraCentavos, paraTexto } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Politica {
  pix_desconto_bp: number; pix_validade_horas: number; boleto_max_parcelas: number; cartao_max_parcelas: number; cartao_sem_juros_ate: number;
  cartao_juros_am_bp: number; multa_atraso_bp: number; juros_atraso_am_bp: number; atraso_bloqueio_dias: number; cliente_grande_mensal_centavos: number;
  criado_em: string; gateway: string | null;
}

const PCT: Array<[keyof Politica, string, string?]> = [
  ['pix_desconto_bp', 'Desconto do Pix (%)'], ['cartao_juros_am_bp', 'Juros do cartão acima do sem-juros (% ao mês)', 'Pagos pelo cliente'],
  ['multa_atraso_bp', 'Multa por atraso (%)'], ['juros_atraso_am_bp', 'Juros por atraso (% ao mês)'],
];
const INT: Array<[keyof Politica, string, string?]> = [
  ['pix_validade_horas', 'Validade do Pix (horas)'], ['boleto_max_parcelas', 'Máximo de parcelas no boleto', '30/60/90/120 dias; a faixa B vai até 2×'],
  ['cartao_max_parcelas', 'Máximo de parcelas no cartão'], ['cartao_sem_juros_ate', 'Cartão sem juros até (parcelas)'],
  ['atraso_bloqueio_dias', 'Bloquear novos boletos após (dias de atraso)'],
];

export default function Condicoes() {
  const { eu } = useEu();
  const admin = eu.usuario.papel === 'administrador';
  const { dados: p, erro, setDados } = useDados<Politica>('/pagamentos/condicoes');
  const [form, setForm] = useState<Record<string, string>>({});
  const acao = useAcao();
  useEffect(() => {
    if (!p) return;
    setForm({
      ...Object.fromEntries(PCT.map(([k]) => [k, String((p[k] as number) / 100)])),
      ...Object.fromEntries(INT.map(([k]) => [k, String(p[k])])),
      cliente_grande_mensal_centavos: paraTexto(p.cliente_grande_mensal_centavos),
    });
  }, [p]);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!p) return <Carregando />;

  const salvar = () =>
    acao.executar(async () => {
      const corpo = {
        ...Object.fromEntries(PCT.map(([k]) => [k, Math.round(Number(form[k].replace(',', '.')) * 100)])),
        ...Object.fromEntries(INT.map(([k]) => [k, Number(form[k])])),
        cliente_grande_mensal_centavos: paraCentavos(form.cliente_grande_mensal_centavos),
      };
      await api('/equipe/politica-pagamento', { metodo: 'PUT', corpo });
      setDados(await api<Politica>('/pagamentos/condicoes'));
    }, 'Novas condições valendo a partir de agora.');

  return (
    <>
      <Cabecalho titulo="Condições de pagamento" sub={`Versão de ${dataHora(p.criado_em)}. Cada alteração vira uma nova versão; pedidos guardam a versão usada.`} />
      {!p.gateway && <Aviso tipo="atencao">O gateway de pagamento não está ligado neste ambiente: Pix e cartão ficam indisponíveis até as chaves do Asaas serem configuradas.</Aviso>}
      {p.gateway === 'simulador' && <Aviso tipo="info">Ambiente de testes: pagamentos simulados.</Aviso>}
      <form className="cartao formulario" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div className="grade grade-2">
          {PCT.map(([k, rotulo, dica]) => <Campo key={k} rotulo={rotulo} dica={dica}><input inputMode="decimal" disabled={!admin} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Campo>)}
          {INT.map(([k, rotulo, dica]) => <Campo key={k} rotulo={rotulo} dica={dica}><input inputMode="numeric" disabled={!admin} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/\D/g, '') })} /></Campo>)}
          <Campo rotulo="Cliente grande: pedidos mensais a partir de (R$)" dica="Libera a importação por conta e ordem (com crédito na faixa A)">
            <input inputMode="decimal" disabled={!admin} value={form.cliente_grande_mensal_centavos ?? ''} onChange={(e) => setForm({ ...form, cliente_grande_mensal_centavos: e.target.value })} />
          </Campo>
        </div>
        <Aviso tipo="erro">{acao.erro}</Aviso>
        <Aviso tipo="ok">{acao.ok}</Aviso>
        {admin ? <div><button className="botao" disabled={acao.enviando}>Salvar nova versão</button></div> : <Aviso tipo="info">Só o administrador muda as condições de pagamento.</Aviso>}
      </form>
    </>
  );
}
