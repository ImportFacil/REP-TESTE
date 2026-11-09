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
await visitar(page, '13d-empresa-carrinho', '/checkout/cart', { espera: 'Pedido mínimo para Cooperativa' });
await ctx.close();

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
await ctx.close();

await browser.close();
fs.writeFileSync(`${saida}/relatorio.json`, JSON.stringify({ base, urlProduto, urlCategoria, urlMult, paginas: relatorio, erros }, null, 2));
console.log(relatorio.map(r => `${r.ok ? 'OK ' : 'ERRO'} ${r.status} ${r.nome} ${r.caminho}`).join('\n'));
if (erros.length) { console.error('\nFalhas:\n' + erros.join('\n')); process.exit(1); }
