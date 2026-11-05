'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando, Situacao, Vazio } from '@/components/ui';
import { api } from '@/lib/api';
import { NOMES_TIPO, cnpj } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Empresa { id: string; cnpj: string; razao_social: string; nome_fantasia: string | null; tipo_cliente: string; situacao: string; conta_e_ordem_liberada: boolean }

export default function Empresas() {
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => { const t = setTimeout(() => setTermo(busca), 300); return () => clearTimeout(t); }, [busca]);
  const lista = useDados<{ itens: Empresa[]; total: number }>(`/equipe/empresas?por_pagina=100${termo.trim() ? `&busca=${encodeURIComponent(termo.trim())}` : ''}`);
  const tipos = useDados<Array<{ tipo_cliente: string; nome: string }>>('/equipe/tabelas-preco');
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ cnpj: '', razao_social: '', nome_fantasia: '', tipo_cliente: 'cooperativa' });
  const acao = useAcao();

  return (
    <>
      <Cabecalho titulo="Empresas" sub={lista.dados ? `${lista.dados.total} empresa(s)` : ' '}>
        {pode && <button className="botao" onClick={() => setNovo(!novo)}>{novo ? 'Fechar' : 'Cadastrar empresa'}</button>}
      </Cabecalho>
      {novo && (
        <form className="cartao formulario" style={{ marginBottom: 20 }} onSubmit={(e) => { e.preventDefault(); void acao.executar(async () => {
          const r = await api<Empresa>('/equipe/empresas', { corpo: { ...form, nome_fantasia: form.nome_fantasia || undefined } });
          router.push(`/painel/empresa/?id=${r.id}`);
        }); }}>
          <h2>Nova empresa</h2>
          <div className="grade grade-2">
            <Campo rotulo="CNPJ" dica="Numérico ou alfanumérico"><input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required /></Campo>
            <Campo rotulo="Tipo de cliente">
              <select value={form.tipo_cliente} onChange={(e) => setForm({ ...form, tipo_cliente: e.target.value })}>{tipos.dados?.map((t) => <option key={t.tipo_cliente} value={t.tipo_cliente}>{t.nome}</option>)}</select>
            </Campo>
            <Campo rotulo="Razão social"><input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required minLength={2} /></Campo>
            <Campo rotulo="Nome fantasia"><input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></Campo>
          </div>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <div><button className="botao" disabled={acao.enviando}>Cadastrar</button></div>
        </form>
      )}
      <input type="search" placeholder="Buscar por razão social, nome fantasia ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ marginBottom: 14 }} />
      {lista.carregando && !lista.dados ? <Carregando /> : !lista.dados?.itens.length ? <Vazio>Nenhuma empresa.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Empresa</th><th>CNPJ</th><th>Tipo</th><th>Situação</th></tr></thead>
            <tbody>{lista.dados.itens.map((e) => (
              <tr key={e.id} className="clicavel" onClick={() => router.push(`/painel/empresa/?id=${e.id}`)}>
                <td><b>{e.razao_social}</b>{e.nome_fantasia && <div className="pequeno muted">{e.nome_fantasia}</div>}</td>
                <td className="numero">{cnpj(e.cnpj)}</td><td>{NOMES_TIPO[e.tipo_cliente] ?? e.tipo_cliente}</td>
                <td><Situacao valor={e.situacao} />{e.conta_e_ordem_liberada && <> <Situacao valor="aprovado" nomes={{ aprovado: 'Conta e ordem' }} /></>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
