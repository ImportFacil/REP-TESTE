import { Fragment, type ReactNode } from 'react';

/**
 * Markdown simples das páginas de conteúdo: "## título", "### subtítulo", parágrafos, listas com "-",
 * **negrito** e [texto](endereço). Monta elementos React (nada de HTML cru), então o texto não injeta código.
 */
export function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  let paragrafo: string[] = [];
  const fechar = () => {
    if (paragrafo.length) blocos.push(<p key={blocos.length}>{inline(paragrafo.join(' '))}</p>);
    if (lista.length) blocos.push(<ul key={blocos.length}>{lista.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    paragrafo = [];
    lista = [];
  };
  for (const linha of texto.replace(/\r/g, '').split('\n')) {
    const t = linha.trim();
    if (!t) { fechar(); continue; }
    const titulo = /^(#{2,3})\s+(.*)$/.exec(t);
    if (titulo) {
      fechar();
      blocos.push(titulo[1] === '##' ? <h2 key={blocos.length}>{inline(titulo[2])}</h2> : <h3 key={blocos.length}>{inline(titulo[2])}</h3>);
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(t);
    if (item) {
      if (paragrafo.length) { const p = paragrafo; paragrafo = []; blocos.push(<p key={blocos.length}>{inline(p.join(' '))}</p>); }
      lista.push(item[1]);
      continue;
    }
    if (lista.length) fechar();
    paragrafo.push(t);
  }
  fechar();
  return <div className="markdown">{blocos}</div>;
}

/** Endereço seguro: só http(s), e-mail ou caminho dentro do site. */
function enderecoSeguro(href: string): string | null {
  return /^(https?:\/\/|mailto:|\/)/i.test(href) ? href : null;
}

function inline(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(<Fragment key={partes.length}>{texto.slice(ultimo, m.index)}</Fragment>);
    if (m[1]) partes.push(<strong key={partes.length}>{m[1]}</strong>);
    else {
      const href = enderecoSeguro(m[3]);
      partes.push(href ? <a key={partes.length} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{m[2]}</a> : <Fragment key={partes.length}>{m[2]}</Fragment>);
    }
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push(<Fragment key={partes.length}>{texto.slice(ultimo)}</Fragment>);
  return partes;
}
