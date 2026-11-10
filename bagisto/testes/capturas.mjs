// Navega pela loja (visitante, conta de empresa e painel), testa as regras da ImportFácil
// (app instalável, múltiplo de venda, pedido mínimo, financeiro) e tira capturas de tela.
// Uso: node capturas.mjs http://localhost:8000 ../catalogo-importfacil.json pasta-saida
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base, arqCatalogo, saida] = process.argv.slice(2);
fs.mkdirSync(saida, { recursive: true });
const cat = JSON.parse(fs.readFileSync(arqCatalogo, 'utf8'));
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const prodFoto = cat.produtos.find(p => p.foto && !p.sobOrcamento && p.estoque > 0) || cat.produtos[0];
const catSeg = cat.categorias.find(c => c.id === 'seguranca') || cat.categorias[0];
const urlProduto = '/' + slug(prodFoto.nome + '-' + prodFoto.codigo);
const urlCategoria = '/' + slug(catSeg.nome);
// produto vendido em múltiplos, com estoque, de categoria aberta a todos e abaixo do pedido mínimo da cooperativa
const coop = cat.perfis.find(p => p.codigo === 'cooperativa');
const catPerfis = Object.fromEntries(cat.categorias.map(c => [c.id, c.perfis]));
const prodMult = cat.produtos.find(p => p.multiplo > 1 && p.estoque >= p.multiplo * 3 && !p.sobOrcamento
  && !catPerfis[p.categoria]
  && p.precoTabela * p.multiplo * (1 - coop.desconto / 100) < coop.pedidoMinimo / 2);
const urlMult = '/' + slug(prodMult.nome + '-' + prodMult.codigo);
// item da linha de importação visível para a cooperativa (encomenda pela página do produto)
const prodImp = cat.produtos.find(p => p.codigo === 'ITM001') || cat.produtos.find(p => p.importado && !p.sobOrcamento);
const urlImp = '/' + slug(prodImp.nome + '-' + prodImp.codigo);
const NCM_ITEM = { [prodMult.codigo]: '8525.89.29', [prodImp.codigo]: '8203.20.10' };

const relatorio = [];
const erros = [];
const browser = await chromium.launch();

async function visitar(page, nome, caminho, { espera = null, cheia = false } = {}) {
  try {
  const r = await page.goto(base + caminho, { waitUntil: 'networkidle', timeout: 120000 }).catch(e => ({ status: () => 0, erro: e }));
  const status = r.status ? r.status() : 0;
  await page.waitForTimeout(800);
  const texto = await page.locator('body').innerText().catch(() => '');
  const ruim = status >= 500 || status === 0 || /Whoops|Server Error|Internal Server Error|ErrorException/i.test(texto);
  const achou = espera ? texto.includes(espera) : true;
  await page.screenshot({ path: `${saida}/${nome}.png`, fullPage: cheia });
  relatorio.push({ nome, caminho, status, ok: !ruim && achou, espera, trecho: texto.replace(/\s+/g, ' ').slice(0, 220) });
  if (ruim || !achou) erros.push(`${nome} (${caminho}): status ${status}${achou ? '' : `, sem o texto "${espera}"`}`);
  return texto;
  } catch (e) { erros.push(`${nome} (${caminho}): ${e.message.split('\n')[0]}`); relatorio.push({ nome, caminho, status: 0, ok: false }); return ''; }
}

// 1) Visitante, computador
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
let page = await ctx.newPage();
await visitar(page, '01-inicio', '/', { espera: 'ImportFácil', cheia: true });
await visitar(page, '02-categoria', urlCategoria, { espera: catSeg.nome });
await visitar(page, '03-produto', urlProduto, { espera: prodFoto.codigo });
await visitar(page, '04-busca', '/search?query=' + encodeURIComponent('furadeira'), { espera: 'Furadeira' });
await visitar(page, '04b-produto-multiplo', urlMult, { espera: `em múltiplos de ${prodMult.multiplo}` });
await ctx.close();

// 1b) App instalável (PWA): manifesto, service worker e página com QR
function checar(nome, ok, detalhe) {
  relatorio.push({ nome, caminho: detalhe, status: ok ? 200 : 0, ok });
  if (!ok) erros.push(`${nome}: ${detalhe}`);
}
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
page = await ctx.newPage();
try {
  const man = await page.request.get(base + '/manifest.webmanifest');
  const mj = await man.json().catch(() => ({}));
  checar('pwa-manifesto', man.ok() && mj.display === 'standalone' && (mj.icons || []).length >= 2, `/manifest.webmanifest → ${man.status()} ${mj.name || ''}`);
  const sw = await page.request.get(base + '/sw.js');
  checar('pwa-service-worker', sw.ok() && /javascript/.test(sw.headers()['content-type'] || '') && (await sw.text()).includes('importfacil'), `/sw.js → ${sw.status()} ${sw.headers()['content-type']}`);
  const ic = await page.request.get(base + '/importfacil/icone-512.png');
  checar('pwa-icone', ic.ok(), `/importfacil/icone-512.png → ${ic.status()}`);
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const temManifesto = await page.locator('link[rel="manifest"]').count();
  await page.waitForTimeout(1500);
  const swAtivo = await page.evaluate(async () => !!(navigator.serviceWorker && await navigator.serviceWorker.getRegistration('/'))).catch(() => false);
  checar('pwa-na-loja', temManifesto > 0 && swAtivo, `link manifest=${temManifesto} service worker=${swAtivo}`);
} catch (e) { checar('pwa', false, e.message.split('\n')[0]); }
await visitar(page, '06b-app-instalar', '/app', { espera: 'Instalar', cheia: true });
const qr = await page.locator('svg').filter({ has: page.locator('path, rect') }).count().catch(() => 0);
checar('pwa-qr', qr > 0, `/app com QR (svg=${qr})`);
await ctx.close();

// 2) Visitante, celular
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
page = await ctx.newPage();
await visitar(page, '05-celular-inicio', '/', { espera: 'Frete grátis' });
await visitar(page, '06-celular-produto', urlProduto, { espera: prodFoto.codigo });
await ctx.close();

// 3) Empresa (cooperativa) logada: preço do catálogo dela, crédito, pedido rápido e cotações
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
page = await ctx.newPage();
await page.goto(base + '/customer/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'cooperativa@demo.importfacil.com.br');
await page.fill('input[name="password"]', 'demo1234');
await page.press('input[name="password"]', 'Enter');
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${saida}/07-empresa-depois-do-login.png` });
await visitar(page, '08-empresa-produto', urlProduto, { espera: prodFoto.codigo });
await visitar(page, '09-empresa-categoria', '/' + slug((cat.categorias.find(c => c.id === 'maquinario') || catSeg).nome));
await visitar(page, '10-empresa-credito', '/customer/account/company-credit');
await visitar(page, '11-empresa-pedido-rapido', '/customer/account/quick-orders');
await visitar(page, '12-empresa-cotacoes', '/customer/account/quotes');
await visitar(page, '13-empresa-perfil', '/customer/account/company-profile');
await visitar(page, '13b-empresa-financeiro', '/customer/account/financeiro', { espera: 'Financeiro' });

// múltiplo de venda e pedido mínimo: pede 1 unidade de um produto vendido em múltiplos
await visitar(page, '13c-empresa-produto-multiplo', urlMult, { espera: `pedido mínimo` });
try {
  const idProd = await page.locator('input[name="product_id"]').first().inputValue();
  const xsrf = decodeURIComponent((await ctx.cookies()).find(c => c.name === 'XSRF-TOKEN')?.value || '');
  const cab = { 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
  const add = await page.request.post(base + '/api/checkout/cart', { headers: cab, data: { product_id: Number(idProd), quantity: 1 } });
  const carrinho = await (await page.request.get(base + '/api/checkout/cart', { headers: cab })).json();
  const item = (carrinho.data?.items || []).find(i => String(i.product_id) === String(idProd)) || carrinho.data?.items?.[0];
  checar('regra-multiplo', add.ok() && item && Number(item.quantity) === prodMult.multiplo,
    `pediu 1 de ${prodMult.codigo} (múltiplo ${prodMult.multiplo}) → ${add.status()}, carrinho com ${item?.quantity}`);
} catch (e) { checar('regra-multiplo', false, e.message.split('\n')[0]); }
const sessaoCoop = { ctx, page };
await visitar(page, '13d-empresa-carrinho', '/checkout/cart', { espera: 'Pedido mínimo para Cooperativa' });
checar('importacao-no-carrinho', (await page.locator('body').innerText()).includes('Encomendar pela importação'), 'aviso da linha de importação no carrinho');

// 3b) Importação: a cooperativa (faixa A, conta e ordem liberada) pede duas ordens
async function enviarOrdem(nome, { modalidade, forma }) {
  await page.check(`input[name="modalidade"][value="${modalidade}"]`);
  await page.check(`input[name="forma_pagamento"][value="${forma}"]`);
  await page.fill('#if-cargo', 'Gerente de compras');
  await page.fill('#if-obs', 'Teste automático: ' + nome);
  await page.check('input[name="aceite"]');
  await Promise.all([page.waitForURL(/\/customer\/account\/importacao\/\d+/, { timeout: 60000 }), page.click('button:has-text("Confirmar e enviar")')]);
  await page.waitForLoadState('networkidle').catch(() => {});
  const id = Number(page.url().match(/importacao\/(\d+)/)[1]);
  const texto = await page.locator('body').innerText();
  await page.screenshot({ path: `${saida}/${nome}.png`, fullPage: true });
  return { id, texto, numero: (texto.match(/OI-\d+/) || [''])[0] };
}
let ordemCO = null, ordemEnc = null, idProdImp = null;
try {
  await visitar(page, '21-cliente-importacao-nova', '/customer/account/importacao/nova', { espera: 'Por conta e ordem', cheia: true });
  ordemCO = await enviarOrdem('22-cliente-ordem-conta-e-ordem', { modalidade: 'contaordem', forma: 'Pix' });
  checar('importacao-conta-e-ordem', /Enviada à importação/.test(ordemCO.texto) && /Numerário da mercadoria/.test(ordemCO.texto) && ordemCO.numero,
    `${ordemCO.numero} criada com o numerário da mercadoria (Pix)`);
  const carrinho = await (await page.request.get(base + '/api/checkout/cart', { headers: { Accept: 'application/json' } })).json();
  checar('importacao-esvazia-carrinho', !carrinho.data || !(carrinho.data.items || []).length, 'carrinho vazio depois da ordem');

  await visitar(page, '23-cliente-produto-importacao', urlImp, { espera: 'Encomendar pela importação' });
  idProdImp = await page.locator('input[name="product_id"]').first().inputValue();
  await Promise.all([page.waitForURL(/importacao\/nova/), page.click('a:has-text("Encomendar pela importação")')]);
  await page.waitForLoadState('networkidle').catch(() => {});
  ordemEnc = await enviarOrdem('24-cliente-ordem-encomenda', { modalidade: 'encomenda', forma: 'Boleto' });
  checar('importacao-encomenda', /Sob encomenda/.test(ordemEnc.texto) && ordemEnc.texto.includes(prodImp.nome) && ordemEnc.numero,
    `${ordemEnc.numero} sob encomenda, boleto, ${prodImp.codigo} em múltiplos de ${prodImp.multiplo}`);
  await visitar(page, '25-cliente-importacao-lista', '/customer/account/importacao', { espera: ordemCO.numero });
} catch (e) { checar('importacao-cliente', false, e.message.split('\n')[0]); }

// 4) Painel administrativo
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
page = await ctx.newPage();
await page.goto(base + '/admin/login', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${saida}/14a-admin-login.png` });
await page.fill('input[name="email"]', 'admin@example.com');
await page.fill('input[name="password"]', 'admin123');
await page.press('input[name="password"]', 'Enter');
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(2000);
await visitar(page, '14-admin-painel', '/admin/dashboard');
await visitar(page, '15-admin-produtos', '/admin/catalog/products');
await visitar(page, '16-admin-empresas', '/admin/b2b/companies');
await visitar(page, '17-admin-catalogos', '/admin/b2b/company-catalogs');
await visitar(page, '18-admin-credito', '/admin/b2b/company-credits');
await visitar(page, '19-admin-cotacoes', '/admin/b2b/quotes');
await visitar(page, '20-admin-regra-pix', '/admin/marketing/promotions/cart-rules', { espera: 'Pix' });

// 4b) Setor de Importação: andamento, numerário, NCM, faturamento, calculadora e tabela NCM
async function botao(texto) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }), page.click(`button:has-text("${texto}")`)]);
  await page.waitForTimeout(300);
  return page.locator('body').innerText();
}
async function avancarAte(id, etapa, { pix = {} } = {}) {
  for (let i = 0; i < 6; i++) {
    await page.goto(`${base}/admin/importacao/ordens/${id}`, { waitUntil: 'networkidle' });
    const t = await page.locator('body').innerText();
    if (new RegExp(`Ordem OI-\\d+ ${etapa}`).test(t.replace(/\s+/g, ' '))) return t;
    if (/Aguardando o numerário/.test(t)) {
      const etapaPix = /mercadoria para fechar/.test(t) ? 'cambio' : 'tributos';
      pix[etapaPix] = true;
      await botao('Confirmar Pix recebido');
      continue;
    }
    await botao('Avançar para');
  }
  return page.locator('body').innerText();
}
await visitar(page, '26-admin-importacao-ordens', '/admin/importacao/ordens', { espera: 'Ordens de importação' });
try {
  if (ordemCO) {
    await page.goto(`${base}/admin/importacao/ordens/${ordemCO.id}`, { waitUntil: 'networkidle' });
    await botao('Avançar para');                         // Recebida pelo setor
    const bloqueada = await page.locator('body').innerText();
    checar('importacao-trava-numerario', /Aguardando o numerário da mercadoria/.test(bloqueada) && await page.locator('button:has-text("Avançar para")').isDisabled(),
      'conta e ordem não avança sem o Pix do numerário');
    await page.screenshot({ path: `${saida}/27-admin-ordem-aguardando-numerario.png`, fullPage: true });
    await page.fill(`input[name^="ncm"]`, NCM_ITEM[prodMult.codigo]);
    const tNcm = await botao('Salvar NCM');
    checar('importacao-ncm-item', /Classificação fiscal \(NCM\) salva/.test(tNcm), `NCM ${NCM_ITEM[prodMult.codigo]} no item`);
    const pix = {};
    const fim = await avancarAte(ordemCO.id, 'Entregue', { pix });
    await page.screenshot({ path: `${saida}/28-admin-ordem-conta-e-ordem-entregue.png`, fullPage: true });
    checar('importacao-conta-e-ordem-entregue', /Prestação de contas/.test(fim) && /Taxa de serviço/.test(fim) && pix.cambio && pix.tributos,
      'Pix da mercadoria e dos tributos confirmados, entregue com prestação de contas e taxa de serviço');
  }
  if (ordemEnc) {
    const fim = await avancarAte(ordemEnc.id, 'Entregue');
    await page.screenshot({ path: `${saida}/29-admin-ordem-encomenda-entregue.png`, fullPage: true });
    const boletos = (fim.match(/Venda OI-\d+ \d\/4/g) || []).length;
    checar('importacao-encomenda-faturada', /NF-e de venda/.test(fim) && boletos === 4, `entregue, NF-e e ${boletos} boletos (faixa A: 4×)`);
  }
} catch (e) { checar('importacao-painel', false, e.message.split('\n')[0]); }
await visitar(page, '30-admin-calculadora', '/admin/importacao/calculadora', { espera: 'R$ 3.978.913,88', cheia: true });
if (ordemEnc) {
  // a descrição do item fica num campo de texto (não aparece no texto da página): confere o valor do campo
  await visitar(page, '31-admin-calculadora-da-ordem', `/admin/importacao/calculadora?ordem=${ordemEnc.id}`, { espera: ordemEnc.numero });
  const descs = await page.locator('input[name$="[desc]"]').evaluateAll(els => els.map(e => e.value)).catch(() => []);
  checar('calculadora-com-itens-da-ordem', descs.some(d => /Alicate de Cerca/i.test(d)), `itens: ${descs.join('; ') || 'nenhum'}`);
}
await visitar(page, '32-admin-tabela-ncm', '/admin/importacao/ncm?q=' + encodeURIComponent('veículos aéreos'), { espera: '8806' });
try {
  const r = await page.request.get(base + '/admin/importacao/ncm/buscar?q=8806', { headers: { Accept: 'application/json' } });
  const j = await r.json();
  checar('ncm-busca-json', r.ok() && j.length > 0 && j.every(n => n.codigo.startsWith('8806')), `/ncm/buscar?q=8806 → ${j.length} códigos`);
} catch (e) { checar('ncm-busca-json', false, e.message.split('\n')[0]); }
await visitar(page, '33-admin-empresas-conta-e-ordem', '/admin/importacao/empresas', { espera: 'Liberar conta e ordem' });
await ctx.close();

// 5) De volta à cooperativa: andamento e cobranças no Financeiro
ctx = sessaoCoop.ctx; page = sessaoCoop.page;
if (ordemCO) await visitar(page, '34-cliente-ordem-entregue', `/customer/account/importacao/${ordemCO.id}`, { espera: 'Prestação de contas', cheia: true });
await visitar(page, '35-cliente-financeiro-importacao', '/customer/account/financeiro', { espera: 'OI-' });
await ctx.close();

// 6) Hospital (faixa C): não pode usar boleto
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
page = await ctx.newPage();
try {
  await page.goto(base + '/customer/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'hospital@demo.importfacil.com.br');
  await page.fill('input[name="password"]', 'demo1234');
  await page.press('input[name="password"]', 'Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  if (idProdImp) {
    await visitar(page, '36-hospital-importacao-nova', `/customer/account/importacao/nova?produto=${idProdImp}`, { espera: 'não permite boleto' });
    checar('importacao-faixa-c-sem-boleto', await page.locator('input[name="forma_pagamento"][value="Boleto"]').isDisabled()
      && (await page.locator('input[name="modalidade"][value="contaordem"]').count()) === 0, 'faixa C: boleto bloqueado e sem conta e ordem');
  }
} catch (e) { checar('importacao-faixa-c', false, e.message.split('\n')[0]); }
await ctx.close();

// 7) Todas as páginas: índice do app, botão em todas as telas e o protótipo dentro do app
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
page = await ctx.newPage();
try {
  // entra como empresa e como equipe na mesma sessão, para abrir todas as páginas de verdade
  await page.goto(base + '/customer/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'cooperativa@demo.importfacil.com.br');
  await page.fill('input[name="password"]', 'demo1234');
  await page.press('input[name="password"]', 'Enter');
  await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500);
  await page.goto(base + '/admin/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'admin@example.com');
  await page.fill('input[name="password"]', 'admin123');
  await page.press('input[name="password"]', 'Enter');
  await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500);
  checar('botao-no-painel', (await page.locator('#if-todas-paginas').count()) > 0, 'botão "Todas as páginas" no Painel');

  await visitar(page, '40-todas-as-paginas', '/paginas', { espera: 'Todas as páginas', cheia: true });
  const links = await page.locator('.if-pg a.item').evaluateAll(as => as.map(a => ({ nome: a.querySelector('b').textContent.trim(), href: a.getAttribute('href') })));
  checar('paginas-quantidade', links.length >= 60, `${links.length} páginas listadas`);
  const ruins = [];
  for (const l of links) {
    if (l.href.startsWith('/prototipo')) continue;            // o protótipo é testado abaixo
    const r = await page.request.get(base + l.href, { timeout: 120000 }).catch(e => null);
    const final = r ? new URL(r.url()).pathname : '';
    const corpo = r ? await r.text() : '';
    if (!r || r.status() >= 400 || /\/(customer|admin)\/login$/.test(final) || /Whoops|Server Error|ErrorException/.test(corpo))
      ruins.push(`${l.nome} ${l.href} → ${r ? r.status() + ' ' + final : 'sem resposta'}`);
  }
  checar('paginas-todas-abrem', ruins.length === 0, ruins.length ? 'falharam: ' + ruins.join('; ') : `${links.filter(l => !l.href.startsWith('/prototipo')).length} páginas da loja e do Painel abriram (empresa e equipe logadas)`);

  await visitar(page, '41-loja-com-botao', '/', { espera: 'Todas as páginas' });
  const man = await (await page.request.get(base + '/manifest.webmanifest')).json();
  checar('atalho-no-icone', (man.shortcuts || []).some(x => x.url === '/paginas'), 'atalho "Todas as páginas" no ícone do app');

  // protótipo dentro do app
  const pr = await page.request.get(base + '/prototipo');
  const html = await pr.text();
  checar('prototipo-servido', pr.ok() && html.includes('<base href="/prototipo/">') && !html.includes('prototipo-sw.js') && html.includes('if-todas-paginas'),
    `/prototipo → ${pr.status()}, ${Math.round(html.length / 1024)} KB`);
  const ncm = await page.request.get(base + '/prototipo/prototipo-ncm.json');
  checar('prototipo-ncm', ncm.ok(), `/prototipo/prototipo-ncm.json → ${ncm.status()}`);
  const telas = links.filter(l => l.href.startsWith('/prototipo/#'));
  await page.goto(base + telas[0].href, { waitUntil: 'networkidle' });
  await page.evaluate(() => { document.getElementById('lgEmail').value = 'equipe@importfacil.com.br'; document.getElementById('lgSenha').value = 'demo1234'; confirmaLogin(); });
  await page.waitForTimeout(500); await page.evaluate(() => escolherPerfil('cooperativa')); await page.waitForTimeout(1200);
  const erradas = [];
  for (const t of telas) {
    const alvo = t.href.split('#')[1];
    await page.evaluate(h => { location.hash = h; }, alvo); await page.waitForTimeout(350);
    const ativa = await page.evaluate(() => (document.querySelector('.screen.active') || {}).id);
    const aba = alvo.includes('/') ? await page.locator('.eq-seg [aria-selected="true"]').innerText().catch(() => '') : '';
    if (ativa !== 'scr-' + alvo.split('/')[0] || (alvo.includes('/') && !t.nome.endsWith(aba))) erradas.push(`${t.nome} (${alvo} → ${ativa} ${aba})`);
  }
  checar('prototipo-telas', erradas.length === 0, erradas.length ? 'erradas: ' + erradas.join('; ') : `${telas.length} telas do protótipo abriram pelo link`);
  await page.evaluate(() => { location.hash = 'equipe/geral'; }); await page.waitForTimeout(800);
  await page.screenshot({ path: `${saida}/42-prototipo-painel-no-app.png` });
  await page.evaluate(() => { location.hash = 'pedidos'; }); await page.waitForTimeout(600);
  await page.screenshot({ path: `${saida}/43-prototipo-pedidos-no-app.png` });
} catch (e) { checar('todas-as-paginas', false, e.message.split('\n')[0]); }
await ctx.close();

await browser.close();
fs.writeFileSync(`${saida}/relatorio.json`, JSON.stringify({ base, urlProduto, urlCategoria, urlMult, paginas: relatorio, erros }, null, 2));
console.log(relatorio.map(r => `${r.ok ? 'OK ' : 'ERRO'} ${r.status} ${r.nome} ${r.caminho}`).join('\n'));
if (erros.length) { console.error('\nFalhas:\n' + erros.join('\n')); process.exit(1); }
