'use client';
import { LimitesDeCompra } from '@/components/LimitesDeCompra';
import { useEu } from '@/components/Shell';
import { Usuarios } from '@/components/Usuarios';
import { Cabecalho, Situacao } from '@/components/ui';
import { NOMES_TIPO, PAPEL, cnpj } from '@/lib/formato';

export default function Conta() {
  const { eu } = useEu();
  const e = eu.empresa!;
  const aprovador = eu.usuario.papel === 'aprovador';
  return (
    <>
      <Cabecalho titulo="Conta e usuários" />
      <div className="grade grade-2" style={{ marginBottom: 20 }}>
        <div className="cartao pilha">
          <h2>Empresa</h2>
          <div><b>{e.razao_social}</b></div>
          <div className="muted">CNPJ {cnpj(e.cnpj)} · {NOMES_TIPO[e.tipo_cliente] ?? e.tipo_cliente}</div>
          <div className="linha"><Situacao valor={e.situacao} /> {e.conta_e_ordem_liberada && <Situacao valor="aprovado" nomes={{ aprovado: 'Conta e ordem liberada' }} />}</div>
        </div>
        <div className="cartao pilha">
          <h2>Você</h2>
          <div><b>{eu.usuario.nome}</b></div>
          <div className="muted">{eu.usuario.email} · {PAPEL[eu.usuario.papel]}</div>
          <p className="pequeno muted">Compradores fecham pedidos até o limite da empresa; o aprovador também cuida do cadastro de crédito, aceita orçamentos e convida pessoas.</p>
        </div>
      </div>
      {aprovador && <div style={{ marginBottom: 20 }}><LimitesDeCompra /></div>}
      <h2>Usuários da empresa</h2>
      {aprovador ? <Usuarios caminho="/empresa/usuarios" papeis={['comprador', 'aprovador']} euId={eu.usuario.id} podeEditar /> : <p className="muted">Só o aprovador vê e convida os usuários da empresa.</p>}
    </>
  );
}
