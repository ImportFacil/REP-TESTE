'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { sairCompleto, sessaoAtual, type Origem } from '@/lib/auth';
import { carregarConfig } from '@/lib/config';
import { useCarrinho } from '@/lib/carrinho';
import { useDados } from '@/lib/hooks';
import { NOMES_TIPO, PAPEL } from '@/lib/formato';
import { Carregando } from './ui';
import { PainelLayout, type ItemPainel } from './painel/PainelLayout';

export interface Eu {
  usuario: { id: string; origem: Origem; papel: string; nome: string; email: string };
  empresa: null | { id: string; razao_social: string; tipo_cliente: string; situacao: string; conta_e_ordem_liberada: boolean; cnpj: string };
}

const EuContexto = createContext<{ eu: Eu; recarregar: () => Promise<void> } | null>(null);

/** Quem está logado (e a empresa, se for cliente). Só dentro das áreas logadas. */
export function useEu() {
  const c = useContext(EuContexto);
  if (!c) throw new Error('useEu fora do Shell');
  return c;
}

export interface ItemMenu {
  href: string;
  rotulo: string;
  icone: string;
  papeis?: string[];
}

/** Estrutura das áreas logadas: menu lateral (gaveta no celular) e conteúdo. */
export function Shell({ origem, secoes = [], painel, children }: { origem: Origem; secoes?: Array<{ titulo: string; itens: ItemMenu[] }>; painel?: ItemPainel[]; children: ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [pronto, setPronto] = useState(false);
  const [aberta, setAberta] = useState(false);
  const [ambiente, setAmbiente] = useState('');
  const carrinho = useCarrinho();

  useEffect(() => {
    const s = sessaoAtual();
    if (!s) router.replace('/entrar/');
    else if (s.origem !== origem) router.replace(s.origem === 'equipe' ? '/painel/' : '/loja/');
    else setPronto(true);
    carregarConfig().then((c) => setAmbiente(c.ambiente === 'prod' ? '' : c.ambiente)).catch(() => undefined);
  }, [origem, router]);

  useEffect(() => setAberta(false), [caminho]);
  const { dados: eu, erro, recarregar } = useDados<Eu>(pronto ? '/eu' : null);

  if (!pronto || (!eu && !erro)) return <Carregando />;
  if (!eu) return <div className="conteudo"><div className="aviso erro">{erro}</div></div>;

  // Painel da equipe: formato do Bagisto (barra superior + menu lateral com grupos)
  if (painel) {
    return (
      <PainelLayout itens={painel} usuario={eu.usuario} ambiente={ambiente}>
        <EuContexto.Provider value={{ eu, recarregar }}>{children}</EuContexto.Provider>
      </PainelLayout>
    );
  }

  const ativo = (href: string) => (href === '/loja/' || href === '/painel/' ? caminho === href : caminho?.startsWith(href));

  return (
    <div className="app">
      <div className="topo-movel">
        <button className="botao secundario pequeno" onClick={() => setAberta(true)} aria-label="Abrir menu">☰</button>
        <b>ImportFácil</b>
      </div>
      {aberta && <div className="veu" onClick={() => setAberta(false)} />}
      <nav className={`lateral ${aberta ? 'aberta' : ''}`} aria-label="Menu principal">
        <div className="marca">
          <div className="marca-icone">IF</div>
          <div>
            <b>ImportFácil</b>
            <span>{eu.empresa ? eu.empresa.razao_social : 'Painel da equipe'}</span>
          </div>
        </div>
        {ambiente && <div className="ambiente">{ambiente === 'local' ? 'Ambiente local' : `Ambiente de ${ambiente === 'homolog' ? 'homologação' : 'desenvolvimento'}`}</div>}
        {secoes.map((s) => {
          const itens = s.itens.filter((i) => !i.papeis || i.papeis.includes(eu.usuario.papel));
          if (!itens.length) return null;
          return (
            <div key={s.titulo}>
              <div className="secao-menu">{s.titulo}</div>
              {itens.map((i) => (
                <Link key={i.href} href={i.href} className={`item-menu ${ativo(i.href) ? 'ativo' : ''}`}>
                  <span aria-hidden>{i.icone}</span>
                  {i.rotulo}
                  {i.href === '/loja/carrinho/' && carrinho.length > 0 && <span className="contador">{carrinho.length}</span>}
                </Link>
              ))}
            </div>
          );
        })}
        <div className="rodape-menu">
          <div className="item-menu" style={{ cursor: 'default' }}>
            <span aria-hidden>👤</span>
            <span>
              <b style={{ display: 'block', fontSize: '0.88rem' }}>{eu.usuario.nome}</b>
              <span className="pequeno muted">
                {PAPEL[eu.usuario.papel]}
                {eu.empresa ? ` · ${NOMES_TIPO[eu.empresa.tipo_cliente] ?? eu.empresa.tipo_cliente}` : ''}
              </span>
            </span>
          </div>
          <button className="botao leve" onClick={() => void sairCompleto()}>Sair</button>
        </div>
      </nav>
      <main className="conteudo">
        <EuContexto.Provider value={{ eu, recarregar }}>{children}</EuContexto.Provider>
      </main>
    </div>
  );
}
