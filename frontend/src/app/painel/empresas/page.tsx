'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { NOMES_TIPO, cnpj } from '@/lib/formato';
import { useAcao, useDados, useListaServidor } from '@/lib/hooks';

interface Empresa { id: string; cnpj: string; razao_social: string; nome_fantasia: string | null; tipo_cliente: string; situacao: string; conta_e_ordem_liberada: boolean }

export default function Empresas() {
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const lista = useListaServidor<Empresa>('/equipe/empresas');
  const tipos = useDados<Array<{ tipo_cliente: string; nome: string }>>('/equipe/tabelas-preco');
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ cnpj: '', razao_social: '', nome_fantasia: '', tipo_cliente: 'cooperativa' });
  const acao = useAcao();

  const colunas: Coluna<Empresa>[] = [
    { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, render: (e) => <><b>{e.razao_social}</b>{e.nome_fantasia && <div className="pequeno muted">{e.nome_fantasia}</div>}</> },
    { chave: 'cnpj', titulo: 'CNPJ', render: (e) => <span className="numero">{cnpj(e.cnpj)}</span>, valorCsv: (e) => cnpj(e.cnpj) },
    { chave: 'tipo_cliente', titulo: 'Tipo de cliente', ordenavel: true, filtro: 'opcoes', opcoes: NOMES_TIPO, render: (e) => NOMES_TIPO[e.tipo_cliente] ?? e.tipo_cliente, valorCsv: (e) => NOMES_TIPO[e.tipo_cliente] ?? e.tipo_cliente },
    { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: { ativa: 'Ativa', bloqueada: 'Bloqueada', inativa: 'Inativa' }, render: (e) => <Situacao valor={e.situacao} /> },
    { chave: 'conta_e_ordem_liberada', titulo: 'Conta e ordem', filtro: 'opcoes', opcoes: { true: 'Liberada', false: 'Não liberada' }, valor: (e) => String(e.conta_e_ordem_liberada),
      render: (e) => (e.conta_e_ordem_liberada ? <Situacao valor="aprovado" nomes={{ aprovado: 'Liberada' }} /> : <span className="muted">—</span>), valorCsv: (e) => (e.conta_e_ordem_liberada ? 'Liberada' : 'Não') },
  ];

  return (
    <>
      <Grade
        titulo="Empresas"
        sub={lista.dados ? `${lista.dados.total} empresa(s)` : ' '}
        acoes={pode && <button className="botao" onClick={() => setNovo(!novo)}>{novo ? 'Fechar' : 'Cadastrar empresa'}</button>}
        topo={<>
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
        </>}
        linhas={lista.dados?.itens}
        carregando={lista.carregando}
        servidor={lista.servidor}
        colunas={colunas}
        chave={(e) => e.id}
        aoClicar={(e) => router.push(`/painel/empresa/?id=${e.id}`)}
        ordemInicial={{ chave: 'razao_social', dir: 'asc' }}
        nomeArquivo="empresas"
        vazio="Nenhuma empresa."
      />
    </>
  );
}
