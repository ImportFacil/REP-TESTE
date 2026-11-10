'use client';
import { useEffect, useState } from 'react';
import { Aviso, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { paraCentavos, paraTexto } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Usuario { id: string; nome: string; email: string; papel: string; ativo: boolean; limite_pedido_centavos: number | null }

/** Limite de compra de cada comprador: acima dele, o pedido vai para o aprovador. */
export function LimitesDeCompra() {
  const { dados, recarregar } = useDados<Usuario[]>('/empresa/usuarios');
  const [valores, setValores] = useState<Record<string, string>>({});
  const acao = useAcao();
  useEffect(() => { if (dados) setValores(Object.fromEntries(dados.map((u) => [u.id, u.limite_pedido_centavos ? paraTexto(u.limite_pedido_centavos) : '']))); }, [dados]);
  if (!dados) return <Carregando />;
  const compradores = dados.filter((u) => u.papel === 'comprador' && u.ativo);
  const salvar = (u: Usuario) => acao.executar(async () => {
    const v = valores[u.id]?.trim();
    await api(`/empresa/usuarios/${u.id}`, { metodo: 'PATCH', corpo: { limite_pedido_centavos: v ? paraCentavos(v) : null } });
    await recarregar();
  }, 'Limite salvo');
  return (
    <div className="cartao pilha">
      <h2 style={{ margin: 0 }}>Limite de compra dos compradores</h2>
      <p className="pequeno muted" style={{ margin: 0 }}>Valor máximo por pedido (em produtos, já com promoções) que cada comprador fecha sozinho. Acima dele, a compra vira uma requisição para você aprovar. Vazio = sem limite.</p>
      {!compradores.length ? <p className="muted">Nenhum comprador ativo.</p> : (
        <table>
          <tbody>{compradores.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nome}</b><div className="pequeno muted">{u.email}</div></td>
              <td style={{ width: 180 }}><input inputMode="decimal" placeholder="Sem limite" value={valores[u.id] ?? ''} onChange={(e) => setValores({ ...valores, [u.id]: e.target.value })} aria-label={`Limite de ${u.nome} (R$)`} /></td>
              <td style={{ width: 90 }}><button className="botao secundario pequeno" disabled={acao.enviando} onClick={() => void salvar(u)}>Salvar</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
    </div>
  );
}
