// Navega pela demonstração ImportFácil (loja como empresa, Painel como equipe), confere cada página
// e tira capturas de tela. Uso: node capturas.mjs <endereço> <pasta de saída>
import fs from 'node:fs';
import { chromium, devices } from 'playwright';

const [base = 'http://localhost:8000', saida = 'capturas'] = process.argv.slice(2);
fs.mkdirSync(saida, { recursive: true });
const relatorio = [];
const erros = [];
const browser = await chromium.launch();

function checar(nome, ok, detalhe) {
  relatorio.push({ nome, caminho: detalhe, status: ok ? 200 : 0, ok });
  if (!ok) erros.push(`${nome}: ${detalhe}`);
}

async function novaSessao(opcoes = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await browser.newContext({ locale: 'pt-BR', ...opcoes });
  const page = await ctx.newPage();
  page.errosJs = [];
  page.on('pageerror', (e) => page.errosJs.push(e.message));
  return { ctx, page };
}

async function entrar(page, rotulo) {
  await page.goto(base + '/entrar/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(rotulo) }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function visitar(page, nome, caminho, { espera = null, cheia = false } = {}) {
  try {
    const antes = page.errosJs.length;
    const r = await page.goto(base + caminho, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(700);
    const texto = await page.locator('body').innerText().catch(() => '');
    const status = r ? r.status() : 0;
    const titulo = await page.locator('h1').first().innerText().catch(() => '');
    const novosErros = page.errosJs.slice(antes);
    const ruim = status >= 400 || /Algo deu errado|Application error|Unhandled Runtime Error/i.test(texto) || novosErros.length > 0;
    const achou = espera ? texto.includes(espera) : true;
    await page.screenshot({ path: `${saida}/${nome}.png`, fullPage: cheia });
    relatorio.push({ nome, caminho, status, ok: !ruim && achou, titulo, espera, errosJs: novosErros });
    if (ruim || !achou) erros.push(`${nome} (${caminho}): status ${status}${achou ? '' : `, sem o texto "${espera}"`}${novosErros.length ? ', erro JS: ' + novosErros[0] : ''}`);
    return texto;
  } catch (e) {
    erros.push(`${nome} (${caminho}): ${e.message.split('\n')[0]}`);
    relatorio.push({ nome, caminho, status: 0, ok: false });
    return '';
  }
}

// 1) Saúde da API, app instalável e página de instalação
let { ctx, page } = await novaSessao({ ...devices['Pixel 7'] });
const saude = await page.request.get(base + '/api/saude');
checar('api-saude', saude.ok() && (await saude.json()).banco === 'ok', `/api/saude → ${saude.status()}`);
const man = await page.request.get(base + '/manifest.webmanifest');
const mj = await man.json().catch(() => ({}));
checar('app-manifesto', man.ok() && mj.display === 'standalone' && (mj.icons || []).length >= 2, `/manifest.webmanifest → ${man.status()}`);
const sw = await page.request.get(base + '/sw.js');
checar('app-service-worker', sw.ok(), `/sw.js → ${sw.status()}`);
await visitar(page, '01-celular-baixar-app', '/app/', { espera: 'App ImportFácil no celular' });
await visitar(page, '02-celular-entrar', '/entrar/', { espera: 'ImportFácil' });
await ctx.close();

// 2) Loja como empresa (Cooperativa)
({ ctx, page } = await novaSessao());
await entrar(page, 'Cooperativa');
for (const [nome, caminho, espera] of [
  ['10-loja-inicio', '/loja/'],
  ['11-loja-catalogo', '/loja/catalogo/'],
  ['12-loja-carrinho', '/loja/carrinho/'],
  ['13-loja-pedidos', '/loja/pedidos/', 'Pedidos'],
  ['14-loja-orcamentos', '/loja/orcamentos/'],
  ['15-loja-ordens', '/loja/ordens/', 'Ordens'],
  ['16-loja-financeiro', '/loja/financeiro/', 'Financeiro'],
  ['17-loja-credito', '/loja/credito/'],
  ['18-loja-conta', '/loja/conta/'],
]) await visitar(page, nome, caminho, { espera });
await ctx.close();

// 3) Painel da equipe (administrador)
({ ctx, page } = await novaSessao());
await entrar(page, 'Equipe');
for (const [nome, caminho, espera] of [
  ['30-painel-inicio', '/painel/'],
  ['31-painel-pedidos', '/painel/pedidos/', 'Pedidos'],
  ['32-painel-orcamentos', '/painel/orcamentos/'],
  ['33-painel-ordens', '/painel/ordens/'],
  ['34-painel-empresas', '/painel/empresas/', 'Empresas'],
  ['35-painel-credito', '/painel/credito/'],
  ['36-painel-recebiveis', '/painel/recebiveis/'],
  ['37-painel-precos', '/painel/precos/'],
  ['38-painel-condicoes', '/painel/condicoes/'],
  ['39-painel-equipe', '/painel/equipe/'],
  ['40-painel-auditoria', '/painel/auditoria/'],
]) await visitar(page, nome, caminho, { espera });
await ctx.close();

await browser.close();
fs.writeFileSync(`${saida}/relatorio.json`, JSON.stringify({ base, paginas: relatorio, erros }, null, 2));
console.log(relatorio.map((r) => `${r.ok ? 'OK ' : 'ERRO'} ${r.status} ${r.nome} ${r.caminho}${r.titulo ? ' · ' + r.titulo : ''}`).join('\n'));
if (erros.length) { console.error('\nFalhas:\n' + erros.join('\n')); process.exit(1); }
