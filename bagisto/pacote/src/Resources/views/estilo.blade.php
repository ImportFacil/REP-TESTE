{{-- Estilos das telas da ImportFácil (loja e Painel). Classes próprias "if-", porque o CSS do tema só traz as classes que ele usa. --}}
@pushOnce('styles', 'importfacil-estilo')
<style>
  .if{--if-borda:#E4E4E7;--if-fundo:#fff;--if-suave:#F4F4F5;--if-tinta:#18181B;--if-tinta2:#52525B;--if-azul:#1D4ED8;--if-azul-claro:#E8EEFC;--if-ok:#15803D;--if-ok-fundo:#DCFCE7;--if-alerta:#92400E;--if-alerta-fundo:#FEF3C7;--if-erro:#B91C1C;--if-erro-fundo:#FEE2E2;color:var(--if-tinta);font-size:14px;line-height:1.5}
  .dark .if{--if-borda:#3F3F46;--if-fundo:#18181B;--if-suave:#27272A;--if-tinta:#F4F4F5;--if-tinta2:#A1A1AA;--if-azul:#93B4FB;--if-azul-claro:#1E2A44;--if-ok:#86EFAC;--if-ok-fundo:#14301F;--if-alerta:#FCD34D;--if-alerta-fundo:#3A2E10;--if-erro:#FCA5A5;--if-erro-fundo:#3B1515}
  .if h1{font-size:22px;font-weight:600;margin:0}
  .if h2{font-size:16px;font-weight:600;margin:0 0 10px}
  .if .if-sub{color:var(--if-tinta2);margin:4px 0 0}
  .if .if-card{background:var(--if-fundo);border:1px solid var(--if-borda);border-radius:12px;padding:16px;margin-top:16px}
  .if .if-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
  .if .if-kpi span{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--if-tinta2)}
  .if .if-kpi b{display:block;font-size:20px;font-weight:600;margin-top:2px}
  .if .if-tabela{width:100%;border-collapse:collapse}
  .if .if-tabela th{background:var(--if-suave);font-size:12px;text-transform:uppercase;letter-spacing:.3px;color:var(--if-tinta2);font-weight:600}
  .if .if-tabela th,.if .if-tabela td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--if-borda);vertical-align:top}
  .if .if-tabela td.n,.if .if-tabela th.n{text-align:right;white-space:nowrap}
  .if .if-rolar{overflow-x:auto;border:1px solid var(--if-borda);border-radius:12px;background:var(--if-fundo)}
  .if .if-rolar .if-tabela tr:last-child td{border-bottom:0}
  .if .if-linha{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed var(--if-borda)}
  .if .if-linha:last-child{border-bottom:0}
  .if .if-selo{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--if-azul-claro);color:var(--if-azul)}
  .if .if-selo.ok{background:var(--if-ok-fundo);color:var(--if-ok)} .if .if-selo.alerta{background:var(--if-alerta-fundo);color:var(--if-alerta)} .if .if-selo.erro{background:var(--if-erro-fundo);color:var(--if-erro)}
  .if .if-aviso{border-radius:10px;padding:10px 14px;margin-top:12px;background:var(--if-alerta-fundo);color:var(--if-alerta)}
  .if .if-aviso.ok{background:var(--if-ok-fundo);color:var(--if-ok)} .if .if-aviso.erro{background:var(--if-erro-fundo);color:var(--if-erro)} .if .if-aviso.info{background:var(--if-azul-claro);color:var(--if-azul)}
  .if label{display:block;font-weight:500;margin:12px 0 4px}
  .if input[type=text],.if input[type=number],.if input[type=search],.if select,.if textarea{width:100%;border:1px solid var(--if-borda);border-radius:8px;padding:8px 10px;background:var(--if-fundo);color:var(--if-tinta);font:inherit}
  .if input:focus,.if select:focus,.if textarea:focus{outline:2px solid var(--if-azul);outline-offset:0}
  .if .if-btn{display:inline-flex;align-items:center;gap:6px;border-radius:8px;padding:8px 14px;font-weight:600;border:1px solid var(--if-azul);background:var(--if-azul);color:#fff;cursor:pointer;text-decoration:none;font-size:14px}
  .if .if-btn.sec{background:transparent;color:var(--if-azul)}
  .if .if-btn:disabled{opacity:.5;cursor:not-allowed}
  .if .if-acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
  .if .if-tl{list-style:none;margin:0;padding:0}
  .if .if-tl li{position:relative;padding:0 0 14px 26px}
  .if .if-tl li:before{content:"";position:absolute;left:6px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--if-borda)}
  .if .if-tl li:after{content:"";position:absolute;left:10px;top:16px;bottom:0;width:2px;background:var(--if-borda)}
  .if .if-tl li:last-child:after{display:none}
  .if .if-tl li.feito:before{background:var(--if-ok)} .if .if-tl li.agora:before{background:var(--if-azul);box-shadow:0 0 0 4px var(--if-azul-claro)}
  .if .if-tl small{display:block;color:var(--if-tinta2)}
  .if .if-opcao{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--if-borda);border-radius:10px;padding:10px 12px;margin-top:8px;cursor:pointer;font-weight:400}
  .if .if-opcao input{margin-top:4px}
  .if .if-opcao small{display:block;color:var(--if-tinta2)}
  .if .if-muted{color:var(--if-tinta2)}
  .if .if-dois{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:0 16px}
  .if a.if-link{color:var(--if-azul);text-decoration:underline}
</style>
@endPushOnce
