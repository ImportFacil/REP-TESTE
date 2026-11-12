'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sairCompleto } from '@/lib/auth';
import { PAPEL } from '@/lib/formato';
import { useDados } from '@/lib/hooks';
import { Icone } from './Icone';
import './painel.css';

export interface ItemPainel {
  href: string;
  rotulo: string;
  icone: string;
  papeis?: string[];
  /** oculto: só marca o grupo como ativo (ex.: a página de um produto), sem aparecer no menu */
  filhos?: Array<{ href: string; rotulo: string; papeis?: string[]; oculto?: boolean }>;
}

interface Avisos { geral: { parcelas_vencidas: number }; contagens?: Record<string, number> }

/** Sem botão de tema no Painel: segue o aparelho. Apaga a escolha antiga de claro/escuro de quem já tinha usado o botão. */
function useTemaDoAparelho() {
  useEffect(() => {
    try { localStorage.removeItem('importfacil:tema'); } catch { /* sem armazenamento */ }
    delete document.documentElement.dataset.tema;
  }, []);
}

/** Estrutura do Painel da equipe no formato do Bagisto: barra superior, menu lateral com grupos e o conteúdo. */
export function PainelLayout({ itens, usuario, ambiente, children }: {
  itens: ItemPainel[];
  usuario: { nome: string; papel: string; email: string };
  ambiente: string;
  children: ReactNode;
}) {
  const caminho = usePathname() ?? '';
  const [aberto, setAberto] = useState(false);        // gaveta no celular
  const [recolhido, setRecolhido] = useState(false);  // menu só com ícones
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [notificacoes, setNotificacoes] = useState(false);
  useTemaDoAparelho();
  const { dados: avisos } = useDados<Avisos>('/equipe/painel/avisos');

  useEffect(() => { setAberto(false); setMenuUsuario(false); setNotificacoes(false); }, [caminho]);
  // Esc fecha a gaveta do menu e os menus suspensos
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); setMenuUsuario(false); setNotificacoes(false); } };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => {
    try { setRecolhido(localStorage.getItem('importfacil:menu-recolhido') === '1'); } catch { /* sem armazenamento */ }
  }, []);
  const recolher = () => {
    setRecolhido(!recolhido);
    try { localStorage.setItem('importfacil:menu-recolhido', recolhido ? '0' : '1'); } catch { /* sem armazenamento */ }
  };

  const pode = (papeis?: string[]) => !papeis || papeis.includes(usuario.papel);
  const visiveis = itens.filter((i) => pode(i.papeis)).map((i) => ({ ...i, filhos: i.filhos?.filter((f) => pode(f.papeis)) }))
    .filter((i) => !i.filhos || i.filhos.some((f) => !f.oculto) || i.href.endsWith('/')); // grupo sem nenhuma página permitida some do menu
  const ativo = (href: string) => (href === '/painel/' ? caminho === '/painel/' || caminho === '/painel' : caminho.startsWith(href));
  const grupoAtivo = (i: ItemPainel) => ativo(i.href) || !!i.filhos?.some((f) => ativo(f.href));
  // Grupos abertos no menu: o da página atual começa aberto; clicar no grupo abre ou fecha as subcategorias (sem sair da página).
  const [gruposAbertos, setGruposAbertos] = useState<string[]>([]);
  const grupoDaPagina = visiveis.find((i) => i.filhos?.length && grupoAtivo(i))?.href;
  useEffect(() => {
    if (grupoDaPagina) setGruposAbertos((g) => (g.includes(grupoDaPagina) ? g : [...g, grupoDaPagina]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoDaPagina]);
  const alternarGrupo = (href: string) => {
    // no computador com o menu só de ícones, clicar no grupo mostra os nomes e já abre o grupo
    if (recolhido && window.matchMedia('(min-width: 901px)').matches) { recolher(); setGruposAbertos((g) => (g.includes(href) ? g : [...g, href])); return; }
    setGruposAbertos((g) => (g.includes(href) ? g.filter((x) => x !== href) : [...g, href]));
  };

  const lista = (avisos?.contagens ?? {}) as Record<string, number>;
  const alertas = [
    { n: lista.cadastros_em_analise ?? 0, texto: 'cadastro(s) de crédito em análise', href: '/painel/credito/' },
    { n: lista.boletos_para_faturar ?? 0, texto: 'pedido(s) no boleto para faturar', href: '/painel/pedidos/?situacao_pagamento=aguardando_faturamento' },
    { n: lista.pagos_para_separar ?? 0, texto: 'pedido(s) pago(s) para separar', href: '/painel/pedidos/?situacao=novo&situacao_pagamento=pago' },
    { n: lista.orcamentos_aguardando ?? 0, texto: 'orçamento(s) aguardando proposta', href: '/painel/orcamentos/' },
    { n: avisos?.geral.parcelas_vencidas ?? 0, texto: 'parcela(s) vencida(s)', href: '/painel/recebiveis/' },
  ].filter((a) => a.n > 0);
  const totalAlertas = alertas.reduce((s, a) => s + a.n, 0);

  return (
    <div className={`pn ${recolhido ? 'pn-recolhido' : ''}`}>
      <header className="pn-topo">
        <button className="pn-icone-botao pn-so-celular" onClick={() => setAberto(!aberto)} aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto} aria-controls="pn-menu">
          <Icone nome={aberto ? 'fechar' : 'menu'} />
        </button>
        <Link href="/painel/" className="pn-logo" aria-label="ImportFácil, Painel de controle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/globo-192.png" alt="" width={32} height={32} />
          <span>ImportFácil</span>
        </Link>
        <Busca itens={visiveis} />
        <div className="pn-topo-acoes">
          {ambiente && <span className="pn-ambiente">{ambiente === 'demonstracao' ? 'Demonstração' : ambiente === 'local' ? 'Ambiente local' : ambiente === 'homolog' ? 'Homologação' : ambiente}</span>}
          <div className="pn-suspenso-ancora">
            <button className="pn-icone-botao" onClick={() => { setNotificacoes(!notificacoes); setMenuUsuario(false); }} aria-label={`Avisos: ${totalAlertas}`} aria-expanded={notificacoes} title="Avisos">
              <Icone nome="sino" />{totalAlertas > 0 && <span className="pn-bolinha">{totalAlertas > 99 ? '99+' : totalAlertas}</span>}
            </button>
            {notificacoes && (
              <div className="pn-suspenso" role="menu">
                <b className="pn-suspenso-titulo">Avisos</b>
                {alertas.length === 0 ? <p className="muted pequeno" style={{ margin: 8 }}>Nada pendente.</p> : alertas.map((a) => (
                  <Link key={a.href} href={a.href} className="pn-suspenso-item" role="menuitem"><b>{a.n}</b> {a.texto}</Link>
                ))}
              </div>
            )}
          </div>
          <div className="pn-suspenso-ancora">
            <button className="pn-avatar" onClick={() => { setMenuUsuario(!menuUsuario); setNotificacoes(false); }} aria-label="Conta" aria-expanded={menuUsuario}>
              {usuario.nome.trim().charAt(0).toUpperCase()}
            </button>
            {menuUsuario && (
              <div className="pn-suspenso" role="menu">
                <div style={{ padding: '8px 10px' }}>
                  <b style={{ display: 'block' }}>{usuario.nome}</b>
                  <span className="pequeno muted">{PAPEL[usuario.papel] ?? usuario.papel} · {usuario.email}</span>
                </div>
                <button className="pn-suspenso-item" role="menuitem" onClick={() => void sairCompleto()}><Icone nome="sair" tamanho={16} /> Sair</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {aberto && <div className="pn-veu" onClick={() => setAberto(false)} />}
      <nav id="pn-menu" className={`pn-menu ${aberto ? 'pn-aberto' : ''}`} aria-label="Menu do Painel">
        <div className="pn-menu-cabecalho pn-so-celular">
          <b>Menu</b>
          <button className="pn-icone-botao" onClick={() => setAberto(false)} aria-label="Fechar menu"><Icone nome="fechar" /></button>
        </div>
        <div className="pn-menu-rolagem">
          {visiveis.map((i) => {
            const g = grupoAtivo(i);
            const temFilhos = !!i.filhos?.some((f) => !f.oculto);
            const expandido = temFilhos && gruposAbertos.includes(i.href);
            const idFilhos = `pn-filhos-${i.href.replace(/\W+/g, '-')}`;
            return (
              <div key={i.href} className="pn-grupo">
                {temFilhos ? (
                  <button type="button" className={`pn-item pn-item-grupo ${g ? 'pn-ativo' : ''}`} title={recolhido ? i.rotulo : undefined}
                    aria-expanded={expandido} aria-controls={idFilhos} onClick={() => alternarGrupo(i.href)}>
                    <Icone nome={i.icone} /><span className="pn-rotulo">{i.rotulo}</span>
                    <span className="pn-seta"><Icone nome={expandido ? 'acima' : 'abaixo'} tamanho={16} /></span>
                  </button>
                ) : (
                  <Link href={i.href} className={`pn-item ${g ? 'pn-ativo' : ''}`} title={recolhido ? i.rotulo : undefined} aria-current={g ? 'page' : undefined}>
                    <Icone nome={i.icone} /><span className="pn-rotulo">{i.rotulo}</span>
                  </Link>
                )}
                {expandido && (
                  <div className="pn-filhos" id={idFilhos}>
                    {(i.filhos ?? []).filter((f) => !f.oculto).map((f) => (
                      <Link key={f.href} href={f.href} className={`pn-filho ${ativo(f.href) ? 'pn-filho-ativo' : ''}`} aria-current={ativo(f.href) ? 'page' : undefined}>{f.rotulo}</Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="pn-recolher pn-so-computador" onClick={recolher} aria-label={recolhido ? 'Expandir o menu' : 'Recolher o menu'} title={recolhido ? 'Expandir o menu' : 'Recolher o menu'}>
          <Icone nome={recolhido ? 'expandir' : 'recolher'} />
        </button>
      </nav>

      <main className="pn-conteudo" onClick={() => { if (menuUsuario || notificacoes) { setMenuUsuario(false); setNotificacoes(false); } }}>
        {children}
      </main>
    </div>
  );
}

/** Busca do topo (Ctrl+K): procura nas páginas do Painel. */
function Busca({ itens }: { itens: ItemPainel[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [aberta, setAberta] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const paginas = useMemo(() => itens.flatMap((i) => (i.filhos?.some((f) => !f.oculto) ? i.filhos.filter((f) => !f.oculto).map((f) => ({ href: f.href, rotulo: f.rotulo, grupo: i.rotulo, icone: i.icone })) : [{ href: i.href, rotulo: i.rotulo, grupo: '', icone: i.icone }])), [itens]);
  const tira = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const achados = q.trim() ? paginas.filter((p) => tira(`${p.rotulo} ${p.grupo}`).includes(tira(q.trim()))).slice(0, 8) : paginas.slice(0, 8);
  const numero = /^\d+$/.test(q.trim()) ? Number(q.trim()) : null;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); setAberta(true); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const ir = (href: string) => { setAberta(false); setQ(''); ref.current?.blur(); router.push(href); };
  return (
    <div className="pn-busca pn-suspenso-ancora">
      <Icone nome="busca" tamanho={18} className="pn-busca-icone" />
      <input ref={ref} value={q} placeholder="Buscar ou pressione Ctrl + K" aria-label="Buscar no Painel"
        onFocus={() => setAberta(true)} onBlur={() => setTimeout(() => setAberta(false), 150)}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          const total = achados.length + (numero ? 1 : 0);
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((sel + 1) % Math.max(total, 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((sel - 1 + total) % Math.max(total, 1)); }
          if (e.key === 'Escape') { setAberta(false); ref.current?.blur(); }
          if (e.key === 'Enter') {
            if (numero && sel === 0) ir(`/painel/pedido/?id=${numero}`);
            else { const p = achados[sel - (numero ? 1 : 0)]; if (p) ir(p.href); }
          }
        }} />
      <kbd className="pn-atalho">Ctrl K</kbd>
      {aberta && (achados.length > 0 || numero) && (
        <div className="pn-suspenso pn-busca-resultados" role="listbox">
          {numero && <button className={`pn-suspenso-item ${sel === 0 ? 'pn-sel' : ''}`} onMouseDown={() => ir(`/painel/pedido/?id=${numero}`)}><Icone nome="pedidos" tamanho={16} /> Abrir o pedido nº {numero}</button>}
          {achados.map((p, k) => (
            <button key={p.href} className={`pn-suspenso-item ${sel === k + (numero ? 1 : 0) ? 'pn-sel' : ''}`} onMouseDown={() => ir(p.href)}>
              <Icone nome={p.icone} tamanho={16} /> {p.rotulo}{p.grupo && <span className="muted pequeno"> · {p.grupo}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
