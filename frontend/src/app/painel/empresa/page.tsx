'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Usuarios } from '@/components/Usuarios';
import { Aviso, Cabecalho, Campo, Carregando, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { SITUACAO_CADASTRO, cnpj, reais } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Empresa { id: string; cnpj: string; razao_social: string; nome_fantasia: string | null; tipo_cliente: string; situacao: string; conta_e_ordem_liberada: boolean }
interface Credito {
  cadastro: { situacao: string; faixa: string | null; limite_aprovado_centavos: number };
  cliente_grande: { elegivel: boolean; minimo_mensal_centavos: number; previsto_mensal_centavos: number; media_3_meses_centavos: number; motivos: string[] };
}

export default function EmpresaPainel() {
  const id = useParametro('id');
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const admin = eu.usuario.papel === 'administrador';
  const { dados: e, erro, setDados } = useDados<Empresa>(id ? `/equipe/empresas/${id}` : null);
  const cred = useDados<Credito>(id ? `/equipe/credito/${id}` : null);
  const tipos = useDados<Array<{ tipo_cliente: string; nome: string }>>('/equipe/tabelas-preco');
  const [form, setForm] = useState({ razao_social: '', nome_fantasia: '', tipo_cliente: '', situacao: '' });
  const [motivo, setMotivo] = useState('');
  const salvar = useAcao();
  const co = useAcao();
  useEffect(() => { if (e) setForm({ razao_social: e.razao_social, nome_fantasia: e.nome_fantasia ?? '', tipo_cliente: e.tipo_cliente, situacao: e.situacao }); }, [e]);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!e) return <Carregando />;
  const cg = cred.dados?.cliente_grande;

  const contaEOrdem = (liberar: boolean, forcar = false) =>
    co.executar(async () => {
      await api(`/equipe/empresas/${e.id}/conta-e-ordem`, { metodo: 'PUT', corpo: { liberar, ...(forcar && { forcar, motivo }) } });
      setDados({ ...e, conta_e_ordem_liberada: liberar });
      await cred.recarregar();
    }, liberar ? 'Conta e ordem liberada.' : 'Conta e ordem bloqueada.');

  return (
    <>
      <p className="pequeno"><Link href="/painel/empresas/">‹ Empresas</Link></p>
      <Cabecalho titulo={e.razao_social} sub={`CNPJ ${cnpj(e.cnpj)}`}>
        <Situacao valor={e.situacao} />
        <Link className="botao secundario" href={`/painel/analise/?empresa=${e.id}`}>Crédito</Link>
        <Link className="botao secundario" href={`/painel/pedidos/?empresa_id=${e.id}`}>Pedidos</Link>
      </Cabecalho>
      <div className="grade grade-2" style={{ alignItems: 'start', marginBottom: 20 }}>
        <form className="cartao formulario" onSubmit={(ev) => { ev.preventDefault(); void salvar.executar(async () => setDados(await api<Empresa>(`/equipe/empresas/${e.id}`, { metodo: 'PATCH', corpo: { ...form, nome_fantasia: form.nome_fantasia || undefined } })), 'Empresa atualizada.'); }}>
          <h2>Dados</h2>
          <Campo rotulo="Razão social"><input value={form.razao_social} disabled={!pode} onChange={(x) => setForm({ ...form, razao_social: x.target.value })} /></Campo>
          <Campo rotulo="Nome fantasia"><input value={form.nome_fantasia} disabled={!pode} onChange={(x) => setForm({ ...form, nome_fantasia: x.target.value })} /></Campo>
          <div className="grade grade-2">
            <Campo rotulo="Tipo de cliente" dica="Define a tabela de preço e o pedido mínimo">
              <select value={form.tipo_cliente} disabled={!pode} onChange={(x) => setForm({ ...form, tipo_cliente: x.target.value })}>{tipos.dados?.map((t) => <option key={t.tipo_cliente} value={t.tipo_cliente}>{t.nome}</option>)}</select>
            </Campo>
            <Campo rotulo="Situação">
              <select value={form.situacao} disabled={!pode} onChange={(x) => setForm({ ...form, situacao: x.target.value })}>
                <option value="ativa">Ativa</option><option value="bloqueada">Bloqueada (sem novos pedidos)</option><option value="inativa">Inativa (sem acesso)</option>
              </select>
            </Campo>
          </div>
          <Aviso tipo="erro">{salvar.erro}</Aviso>
          <Aviso tipo="ok">{salvar.ok}</Aviso>
          {pode && <div><button className="botao" disabled={salvar.enviando}>Salvar</button></div>}
        </form>
        <div className="cartao pilha">
          <h2>Crédito e conta e ordem</h2>
          {cred.dados && (
            <div className="linha entre">
              <span>Cadastro <Situacao valor={cred.dados.cadastro.situacao} nomes={SITUACAO_CADASTRO} /></span>
              <b>{cred.dados.cadastro.faixa ? `Faixa ${cred.dados.cadastro.faixa} · ${reais(cred.dados.cadastro.limite_aprovado_centavos)}` : 'Sem limite'}</b>
            </div>
          )}
          {cg && (
            <>
              <p className="pequeno muted">
                Cliente grande: pedidos mensais a partir de {reais(cg.minimo_mensal_centavos)}. Previsto no cadastro: {reais(cg.previsto_mensal_centavos)}; média dos últimos 3 meses: {reais(cg.media_3_meses_centavos)}.
              </p>
              {e.conta_e_ordem_liberada ? <Aviso tipo="ok">Conta e ordem liberada.</Aviso> : cg.elegivel ? <Aviso tipo="info">Atende à regra de cliente grande.</Aviso> : <Aviso tipo="atencao">{cg.motivos.join(' ')}</Aviso>}
              {pode && (e.conta_e_ordem_liberada ? (
                <button className="botao secundario" disabled={co.enviando} onClick={() => void contaEOrdem(false)}>Bloquear conta e ordem</button>
              ) : cg.elegivel ? (
                <button className="botao" disabled={co.enviando} onClick={() => void contaEOrdem(true)}>Liberar conta e ordem</button>
              ) : admin ? (
                <div className="pilha">
                  <Campo rotulo="Liberar fora da regra (motivo obrigatório)"><input value={motivo} onChange={(x) => setMotivo(x.target.value)} /></Campo>
                  <button className="botao secundario" disabled={co.enviando || !motivo.trim()} onClick={() => void contaEOrdem(true, true)}>Liberar mesmo assim</button>
                </div>
              ) : null)}
              <Aviso tipo="erro">{co.erro}</Aviso>
              <Aviso tipo="ok">{co.ok}</Aviso>
            </>
          )}
        </div>
      </div>
      <h2>Usuários da empresa</h2>
      <Usuarios caminho={`/equipe/empresas/${e.id}/usuarios`} papeis={['aprovador', 'comprador']} euId={eu.usuario.id} podeEditar={pode} />
    </>
  );
}
