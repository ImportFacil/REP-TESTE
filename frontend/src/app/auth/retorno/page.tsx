'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Carregando } from '@/components/ui';
import { concluirCognito } from '@/lib/auth';

/** Volta da tela de login do Cognito. */
export default function Retorno() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const codigo = q.get('code');
    const estado = q.get('state');
    if (!codigo || !estado) {
      setErro(q.get('error_description') ?? 'Login cancelado.');
      return;
    }
    concluirCognito(codigo, estado)
      .then((origem) => router.replace(origem === 'equipe' ? '/painel/' : '/loja/'))
      .catch((e) => setErro(e.message));
  }, [router]);
  return erro ? (
    <div className="entrar"><div className="cartao pilha"><Aviso tipo="erro">{erro}</Aviso><a className="botao" href="/entrar/">Voltar ao login</a></div></div>
  ) : (
    <Carregando texto="Entrando…" />
  );
}
