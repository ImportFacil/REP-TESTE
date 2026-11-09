// Navega pela demo (loja, conta de empresa e painel) e tira capturas de tela.
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

const relatorio = [];
const erros = [];
const browser = await chromium.launch();

async function visitar(page, nome, caminho, { espera = null, cheia = false } = {}) {
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
}

// 1) Visitante, computador
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
let page = await ctx.newPage();
await visitar(page, '01-inicio', '/', { espera: 'ImportFácil', cheia: true });
await visitar(page, '02-categoria', urlCategoria, { espera: catSeg.nome });
await visitar(page, '03-produto', urlProduto, { espera: prodFoto.codigo });
await visitar(page, '04-busca', '/search?query=' + encodeURIComponent('furadeira'), { espera: 'Furadeira' });
await ctx.close();

// 2) Visitante, celular
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
page = await ctx.newPage();
await visitar(page, '05-celular-inicio', '/', { espera: 'ImportFácil' });
await visitar(page, '06-celular-produto', urlProduto, { espera: prodFoto.codigo });
await ctx.close();

// 3) Empresa (cooperativa) logada: preço do catálogo dela, crédito, pedido rápido e cotações
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
page = await ctx.newPage();
await page.goto(base + '/customer/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'cooperativa@demo.importfacil.com.br');
await page.fill('input[name="password"]', 'demo1234');
await Promise.all([page.waitForLoadState('networkidle'), page.locator('form button[type="submit"]').first().click()]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${saida}/07-empresa-depois-do-login.png` });
await visitar(page, '08-empresa-produto', urlProduto, { espera: prodFoto.codigo });
await visitar(page, '09-empresa-categoria', '/' + slug((cat.categorias.find(c => c.id === 'maquinario') || catSeg).nome));
await visitar(page, '10-empresa-credito', '/customer/account/company-credit');
await visitar(page, '11-empresa-pedido-rapido', '/customer/account/quick-orders');
await visitar(page, '12-empresa-cotacoes', '/customer/account/quotes');
await visitar(page, '13-empresa-perfil', '/customer/account/company-profile');
await ctx.close();

// 4) Painel administrativo
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
page = await ctx.newPage();
await page.goto(base + '/admin/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'admin@example.com');
await page.fill('input[name="password"]', 'admin123');
await Promise.all([page.waitForLoadState('networkidle'), page.locator('button[type="submit"], .primary-button').first().click()]);
await page.waitForTimeout(1500);
await visitar(page, '14-admin-painel', '/admin/dashboard');
await visitar(page, '15-admin-produtos', '/admin/catalog/products');
await visitar(page, '16-admin-empresas', '/admin/b2b/companies');
await visitar(page, '17-admin-catalogos', '/admin/b2b/company-catalogs');
await visitar(page, '18-admin-credito', '/admin/b2b/company-credits');
await visitar(page, '19-admin-cotacoes', '/admin/b2b/quotes');
await ctx.close();

await browser.close();
fs.writeFileSync(`${saida}/relatorio.json`, JSON.stringify({ base, urlProduto, urlCategoria, paginas: relatorio, erros }, null, 2));
console.log(relatorio.map(r => `${r.ok ? 'OK ' : 'ERRO'} ${r.status} ${r.nome} ${r.caminho}`).join('\n'));
if (erros.length) { console.error('\nFalhas:\n' + erros.join('\n')); process.exit(1); }
