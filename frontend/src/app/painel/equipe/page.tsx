'use client';
import { useEu } from '@/components/Shell';
import { Usuarios } from '@/components/Usuarios';
import { Cabecalho } from '@/components/ui';

export default function EquipePainel() {
  const { eu } = useEu();
  return (
    <>
      <Cabecalho titulo="Equipe" sub="Quem acessa o Painel. Todos entram com verificação em 2 etapas." />
      <Usuarios caminho="/equipe/usuarios" papeis={['comercial', 'financeiro', 'administrador']} euId={eu.usuario.id} podeEditar={eu.usuario.papel === 'administrador'} />
    </>
  );
}
