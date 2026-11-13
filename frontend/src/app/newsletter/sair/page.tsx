'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Carregando } from '@/components/ui';
import { apiPublica } from '@/lib/api';
import { useParametro } from '@/lib/hooks';

/** Link "sair da lista" do e-mail da newsletter. */
export default function SairDaNewsletter() {
  const token = useParametro('t');
  const [estado, setEstado] = useState<'esperando' | 'ok' | 'erro'>('esperando');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (token === null) return;
    apiPublica('/newsletter/sair', { token }).then(() => setEstado('ok')).catch((e: Error) => { setEstado('erro'); setMsg(e.message); });
  }, [token]);
  return (
    <div className="entrar">
      <div className="cartao pilha" style={{ maxWidth: 440 }}>
        <h1 style={{ margin: 0 }}>Newsletter</h1>
        {estado === 'esperando' && <Carregando texto="Cancelando a inscrição…" />}
        {estado === 'ok' && <p>Pronto: você saiu da lista e não recebe mais as novidades por e-mail. Os avisos dos seus pedidos continuam chegando normalmente.</p>}
        {estado === 'erro' && <div className="aviso erro">{msg || 'Link inválido.'}</div>}
        <Link href="/pagina/">Informações da Export Fácil</Link>
      </div>
    </div>
  );
}
