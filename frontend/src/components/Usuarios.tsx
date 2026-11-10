'use client';
import { useState } from 'react';
import { Aviso, Campo, Situacao } from './ui';
import { api } from '@/lib/api';
import { PAPEL, dataHora } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Usuario { id: string; nome: string; email: string; papel: string; ativo: boolean; ultimo_acesso_em: string | null }

/** Lista de usuários com convite e ativação (empresa cliente ou equipe). */
export function Usuarios({ caminho, papeis, euId, podeEditar }: { caminho: string; papeis: string[]; euId: string; podeEditar: boolean }) {
  const { dados, recarregar } = useDados<Usuario[]>(caminho);
  const [form, setForm] = useState({ nome: '', email: '', papel: papeis[0] });
  const acao = useAcao();
  return (
    <div className="pilha">
      <div className="cartao tabela-rolagem">
        <table>
          <thead><tr><th>Nome</th><th>Papel</th><th>Último acesso</th><th>Situação</th>{podeEditar && <th />}</tr></thead>
          <tbody>{dados?.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nome}</b><div className="pequeno muted">{u.email}</div></td>
              <td>{PAPEL[u.papel]}</td>
              <td>{dataHora(u.ultimo_acesso_em)}</td>
              <td><Situacao valor={u.ativo ? 'ativa' : 'inativa'} nomes={{ ativa: 'Ativo', inativa: 'Inativo' }} /></td>
              {podeEditar && (
                <td className="direita">
                  {u.id !== euId && (
                    <button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void acao.executar(async () => { await api(`${caminho}/${u.id}`, { metodo: 'PATCH', corpo: { ativo: !u.ativo } }); await recarregar(); })}>
                      {u.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {podeEditar && (
        <form className="cartao formulario" onSubmit={(e) => { e.preventDefault(); void acao.executar(async () => { await api(caminho, { corpo: form }); setForm({ nome: '', email: '', papel: papeis[0] }); await recarregar(); }, 'Convite enviado por e-mail.'); }}>
          <h2>Convidar pessoa</h2>
          <div className="grade grade-3">
            <Campo rotulo="Nome"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required minLength={2} /></Campo>
            <Campo rotulo="E-mail"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Campo>
            <Campo rotulo="Papel">
              <select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>{papeis.map((p) => <option key={p} value={p}>{PAPEL[p]}</option>)}</select>
            </Campo>
          </div>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <Aviso tipo="ok">{acao.ok}</Aviso>
          <div><button className="botao" disabled={acao.enviando}>Convidar</button></div>
        </form>
      )}
    </div>
  );
}
