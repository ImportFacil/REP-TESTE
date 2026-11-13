'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Carregando } from '@/components/ui';
import { sessaoAtual } from '@/lib/auth';

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    void sessaoAtual().then((s) => router.replace(!s ? '/entrar/' : s.origem === 'equipe' ? '/painel/' : '/loja/'));
  }, [router]);
  return <Carregando />;
}
