/** Ícones de traço do Painel (24×24, no estilo dos ícones do Bagisto). */
const P: Record<string, string> = {
  painel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  vendas: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  catalogo: 'M3 5h18v14H3zM3 9h18M8 13h3',
  clientes: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  empresas: 'M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 8h2M14 8h2M8 12h2M14 12h2',
  importacao: 'M2 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0M4 15l-1-5h18l-2 5M8 10V5h8v5M12 2v3',
  financeiro: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4 2 4M16 13h2',
  marketing: 'M3 10v4l11 5V5zM14 8a4 4 0 0 1 0 8M6 14v5h3',
  conteudo: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5',
  relatorios: 'M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z',
  configuracoes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  auditoria: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M8 11l2 2 4-4',
  equipe: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  lua: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sol: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  sino: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  celular: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  fechar: 'M18 6 6 18M6 6l12 12',
  recolher: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expandir: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  filtro: 'M3 4h18l-7 9v6l-4 2v-8z',
  exportar: 'M12 3v12M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  mais: 'M12 5v14M5 12h14',
  anterior: 'M15 18l-6-6 6-6',
  proximo: 'M9 18l6-6-6-6',
  abaixo: 'M6 9l6 6 6-6',
  acima: 'M18 15l-6-6-6 6',
  calendario: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  dinheiro: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  pedidos: 'M9 3h6v3H9zM6 5h3M15 5h3v16H6V5M9 12l2 2 4-4M9 17h6',
  usuario: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  media: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  alerta: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  caixa: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  olho: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  check: 'M20 6 9 17l-5-5',
  tag: 'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01',
  balanca: 'M12 3v18M5 21h14M3 7h18M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z',
  credito: 'M2 6h20v12H2zM2 10h20M6 15h4',
  documento: 'M6 2h9l5 5v15H6zM14 2v6h6',
  loja: 'M3 9l2-6h14l2 6M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8',
  atualizar: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
};

export function Icone({ nome, tamanho = 20, className }: { nome: string; tamanho?: number; className?: string }) {
  const d = P[nome] ?? P.documento;
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={d} />
    </svg>
  );
}
