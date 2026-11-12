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

// Entrega 3 na loja: avaliações no produto, cupom no carrinho e rodapé com páginas e newsletter
try {
  const textoCatalogo = await visitar(page, '19-loja-catalogo-produtos', '/loja/catalogo/');
  checar('loja-rodape', /Novidades por e-mail/.test(textoCatalogo) && /Sobre a ImportFácil/.test(textoCatalogo), 'rodapé com páginas e newsletter');
  await page.locator('a[href*="/loja/produto/?id="]').first().click();
  await page.getByRole('heading', { name: 'Avaliações' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/20-loja-produto-avaliacoes.png`, fullPage: true });
  checar('loja-produto-avaliacoes', await page.getByText(/Avaliar este produto|Sua avaliação/).first().isVisible(), 'formulário ou avaliação própria no produto');
  const adicionar = page.getByRole('button', { name: 'Adicionar ao carrinho' });
  if (await adicionar.isVisible()) await adicionar.click();
  await page.goto(base + '/loja/carrinho/', { waitUntil: 'networkidle' });
  await page.getByLabel('Cupom de desconto').first().fill('parceiro5');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByText(/Cupom PARCEIRO5|A promoção vale a partir|não vale|já usou/).first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/21-loja-carrinho-cupom.png`, fullPage: true });
  checar('loja-carrinho-cupom', true, (await page.getByText(/Cupom PARCEIRO5|A promoção vale a partir|não vale|já usou/).first().innerText()).slice(0, 80));
} catch (e) { checar('loja-entrega3', false, e.message.split('\n')[0]); }

// Fase 2 da loja: filtros por atributo, favoritos, comparar, pedido rápido, listas e endereços
for (const [nome, caminho, espera] of [
  ['22-loja-favoritos', '/loja/favoritos/', 'Favoritos'],
  ['23-loja-listas', '/loja/listas/', 'Reposição mensal'],
  ['24-loja-enderecos', '/loja/enderecos/', 'Armazém de grãos'],
  ['24b-loja-pedidos-semana', '/loja/pedidos/?periodo=7d', 'Últimos 7 dias'],
]) await visitar(page, nome, caminho, { espera });
try {
  await visitar(page, '28-loja-catalogo-filtros', '/loja/catalogo/?categoria=seguranca', { espera: 'Catálogo' });
  const antes = await page.locator('.cartao.produto').count();
  const caixa = page.locator('.filtros-loja input[type="checkbox"]').first();
  await caixa.check();
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(600);
  const depois = await page.locator('.cartao.produto').count();
  checar('loja-filtro-atributo', depois > 0 && depois <= antes, `${antes} → ${depois} produto(s) com o filtro`);
  await caixa.uncheck();
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(600);
  await page.locator('.cartao.produto button[aria-label="Comparar"]').nth(0).click();
  await page.locator('.cartao.produto button[aria-label="Comparar"]').nth(0).click(); // o 1º virou "Tirar da comparação": este é o 2º
  await page.screenshot({ path: `${saida}/29-loja-catalogo-comparar.png`, fullPage: true });
  await page.getByRole('link', { name: 'Comparar', exact: true }).last().click();
  await page.getByText('Seu preço').waitFor({ timeout: 15000 });
  const colunas = await page.locator('table.comparar thead th').count();
  await page.screenshot({ path: `${saida}/30-loja-comparar.png`, fullPage: true });
  checar('loja-comparar', colunas === 3, `${colunas - 1} produto(s) lado a lado`);
  await visitar(page, '31-loja-pedido-rapido', '/loja/pedido-rapido/', { espera: 'Pedido rápido' });
  await page.locator('textarea').fill('EP-CP01;100\nMQ-EN01\nNAO-EXISTE;5\nEP-CP01;7');
  await page.getByRole('button', { name: 'Conferir' }).click();
  await page.getByText(/de 4 linha\(s\) prontas/).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/32-loja-pedido-rapido.png`, fullPage: true });
  checar('loja-pedido-rapido', /2 de 4 linha/.test(await page.getByText(/de 4 linha\(s\) prontas/).innerText()), 'código inexistente e múltiplo errado apontados');
  await visitar(page, '33-loja-lista', '/loja/listas/', { espera: 'Reposição mensal' });
  await page.getByText('Reposição mensal').first().click();
  await page.getByRole('button', { name: /Tudo para o carrinho/ }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/34-loja-lista.png`, fullPage: true });
  checar('loja-lista', (await page.locator('table tbody tr').count()) === 5, 'lista com 5 produtos');
} catch (e) { checar('loja-fase2', false, e.message.split('\n')[0]); }

// Fase 3, B2B: aprovação de compras, cotações de preço negociado e limite dos compradores
try {
  await visitar(page, '35-loja-aprovacoes', '/loja/aprovacoes/', { espera: 'Esperando aprovação' });
  await page.getByRole('link', { name: 'Decidir ›' }).first().click();
  await page.getByRole('button', { name: 'Aprovar e fechar o pedido' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/36-loja-aprovacao.png`, fullPage: true });
  checar('loja-aprovacao', (await page.getByLabel('Nº da ordem de compra').inputValue()) === 'OC-2026-0457', 'requisição com a ordem de compra, pronta para aprovar');
  await visitar(page, '37-loja-cotacoes', '/loja/cotacoes/', { espera: 'Respondida' });
  await page.locator('table tbody tr', { hasText: 'Respondida' }).first().getByRole('link').first().click();
  await page.getByRole('button', { name: 'Aceitar e fechar o pedido' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/38-loja-cotacao.png`, fullPage: true });
  checar('loja-cotacao-respondida', /Economia/.test(await page.locator('body').innerText()), 'cotação respondida com economia sobre a tabela');
  const conta = await visitar(page, '39-loja-conta-limites', '/loja/conta/', { espera: 'Limite de compra dos compradores' });
  checar('loja-limite-comprador', conta.includes('Marina Souza'), 'limite da compradora na conta');
} catch (e) { checar('loja-fase3', false, e.message.split('\n')[0]); }
await ctx.close();

// Páginas de conteúdo abertas, sem login
({ ctx, page } = await novaSessao());
await visitar(page, '25-pagina-indice', '/pagina/', { espera: 'Perguntas frequentes' });
await visitar(page, '26-pagina-sobre', '/pagina/?p=sobre', { espera: 'O que fazemos' });
await visitar(page, '27-pagina-privacidade', '/pagina/?p=politica-de-privacidade', { espera: 'Seus direitos' });
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

// Painel no formato do Bagisto: números, gráfico, filtros pelo endereço, exportação e seleção em lote
try {
  await visitar(page, '41-painel-controle-completo', '/painel/', { espera: 'Total de vendas', cheia: true });
  const barras = await page.locator('svg.pn-grafico rect').count();
  const vendas = await page.locator('.pn-numero strong').first().innerText();
  checar('painel-grafico-e-numeros', barras >= 28 && /R\$\s?[1-9]/.test(vendas), `gráfico com ${barras} dias, vendas ${vendas}`);
  await visitar(page, '42-pedidos-entregues', '/painel/pedidos/?situacao=entregue', { espera: 'Situação do pedido: Entregue' });
  const situacoes = await page.locator('.pn-tabela tbody td[data-rotulo="Situação do pedido"]').allInnerTexts();
  checar('grade-filtro-pelo-endereco', situacoes.length > 0 && situacoes.every((t) => t.includes('Entregue')), `${situacoes.length} linha(s), todas entregues`);
  const [baixa] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Exportar' }).click()]);
  const csv = fs.readFileSync(await baixa.path(), 'utf8');
  checar('grade-exportar-csv', csv.split('\n').length === situacoes.length + 1 || csv.split('\n').length > 2, `${baixa.suggestedFilename()} com ${csv.split('\n').length - 1} linha(s)`);
  await page.locator('.pn-tabela tbody input[type="checkbox"]').first().check();
  checar('grade-selecao-em-lote', await page.locator('.pn-lote').isVisible(), 'barra de ações em lote ao marcar um pedido');
  await page.screenshot({ path: `${saida}/43-pedidos-selecao.png` });
} catch (e) { checar('painel-bagisto', false, e.message.split('\n')[0]); }

// Entrega 2: vendas (notas, envios, reembolsos, transações) e catálogo (produtos, categorias, atributos, famílias)
for (const [nome, caminho, espera] of [
  ['50-vendas-notas', '/painel/notas/', 'Notas fiscais'],
  ['51-vendas-envios', '/painel/envios/', 'Envios'],
  ['52-vendas-reembolsos', '/painel/reembolsos/', 'Reembolsos'],
  ['53-vendas-transacoes', '/painel/transacoes/', 'Transações'],
  ['54-catalogo-produtos', '/painel/produtos/', 'Produtos'],
  ['55-catalogo-categorias', '/painel/categorias/', 'Categorias'],
  ['56-catalogo-atributos', '/painel/atributos/', 'Atributos'],
  ['57-catalogo-familias', '/painel/familias/', 'Famílias de atributos'],
  ['58-clientes-grupos', '/painel/precos/', 'Grupos de clientes'],
  ['59-catalogo-novo-produto', '/painel/produto/?novo=1', 'Criar produto'],
  // entrega 3: clientes, marketing e conteúdo
  ['70-clientes-usuarios', '/painel/usuarios/', 'Usuários dos clientes'],
  ['71-clientes-avaliacoes', '/painel/avaliacoes/', 'aguardando moderação'],
  ['72-marketing-promocoes', '/painel/promocoes/', 'PARCEIRO5'],
  ['73-marketing-newsletter', '/painel/newsletter/', 'inscrito(s) ativo(s)'],
  ['74-marketing-modelos', '/painel/modelos/', 'Pedido enviado'],
  ['75-marketing-modelo', '/painel/modelo/?codigo=parcela_em_atraso', 'Cooperativa Agro Sorriso'],
  ['76-marketing-caixa-de-saida', '/painel/caixa-de-saida/', 'Na fila'],
  ['77-conteudo-paginas', '/painel/paginas/', 'Trocas e devoluções'],
  ['78-conteudo-pagina', '/painel/pagina/?novo=1', 'Prévia'],
  // entrega 4: relatórios e configurações
  ['80-relatorios-vendas', '/painel/relatorios/', 'Ticket médio'],
  ['81-relatorios-produtos', '/painel/relatorios/?aba=produtos', 'Vendas por categoria'],
  ['82-relatorios-clientes', '/painel/relatorios/?aba=clientes', 'Empresas que compraram'],
  ['83-config-permissoes', '/painel/permissoes/', 'Papéis e permissões'],
  ['84-config-impostos', '/painel/impostos/', 'Padrão: mercadoria nacional'],
  ['85-config-locais', '/painel/locais/', 'Depósito avançado'],
  ['86-config-cambio', '/painel/cambio/', 'Dólar (USD)'],
  ['87-config-importar', '/painel/importar/', 'Importar produtos'],
  ['88-config-auditoria', '/painel/auditoria/', 'Auditoria'],
  ['93-vendas-cotacoes', '/painel/cotacoes/', 'esperando resposta'],
  ['96-relatorio-pedidos-24h', '/painel/relatorios/?aba=pedidos', 'Consolidado de pedidos'],
  ['97-relatorio-pedidos-semana-hospital', '/painel/relatorios/?aba=pedidos&periodo=7d&perfil=hospital', 'Pedidos · Últimos 7 dias · Hospital'],
  ['98-relatorio-financeiro-24h', '/painel/relatorios/?aba=financeiro', 'Recebido no período'],
  ['99-relatorio-financeiro-semana', '/painel/relatorios/?aba=financeiro&periodo=7d', 'Financeiro · Últimos 7 dias'],
]) await visitar(page, nome, caminho, { espera });
try {
  await visitar(page, '89-produto-estoque-locais', '/painel/produtos/?busca=MQ-EN01', { espera: 'Produtos' });
  await page.locator('.pn-tabela tbody tr').first().click();
  await page.getByText('Salvar estoque por local').waitFor({ timeout: 15000 });
  const locais = await page.locator('input[aria-label^="Estoque em"]').count();
  await page.screenshot({ path: `${saida}/90-produto-estoque-locais.png`, fullPage: true });
  checar('produto-estoque-por-local', locais >= 2, `${locais} local(is) de estoque no produto`);
  await visitar(page, '91-importar-previa', '/painel/importar/', { espera: 'Importar produtos' });
  await page.getByLabel('Conteúdo da planilha').fill('codigo;nome;categoria;preco\nMQ-EN01;;;\nNV-9;Produto novo;epis;10,00\nNV-10;Sem categoria;nao-existe;1');
  await page.getByRole('button', { name: 'Ver prévia' }).click();
  await page.getByText(/linha\(s\): 1 nova/).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/92-importar-previa.png`, fullPage: true });
  checar('importar-previa', true, (await page.getByText(/linha\(s\): 1 nova/).innerText()).slice(0, 100));
} catch (e) { checar('configuracoes-entrega4', false, e.message.split('\n')[0]); }
try {
  await visitar(page, '94-cotacoes-lista', '/painel/cotacoes/?situacao=solicitada', { espera: 'Cotações de preço' });
  await page.locator('.pn-tabela tbody tr').first().click();
  await page.getByRole('button', { name: 'Enviar resposta' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${saida}/95-cotacao-responder.png`, fullPage: true });
  checar('painel-cotacao-responder', (await page.locator('input[aria-label^="Preço proposto"]').count()) === 3, 'preço proposto para cada item');
} catch (e) { checar('painel-cotacao', false, e.message.split('\n')[0]); }
try {
  const contar = async () => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(500); return Number((await page.locator('.pn-cabecalho .sub').first().innerText()).match(/^(\d+)/)?.[1] ?? -1); };
  await visitar(page, '100-pedidos-todos', '/painel/pedidos/', { espera: 'dos mais recentes' });
  const todos = await contar();
  const contagens = [];
  for (const [rotulo, nome] of [['24 horas', '101-pedidos-24h'], ['48 horas', '102-pedidos-48h'], ['72 horas', '103-pedidos-72h'], ['Semana', '104-pedidos-semana']]) {
    await page.getByRole('button', { name: rotulo, exact: true }).click();
    contagens.push(await contar());
    await page.screenshot({ path: `${saida}/${nome}.png`, fullPage: true });
  }
  const cresce = contagens.every((n, k) => n >= 0 && (k === 0 || n >= contagens[k - 1])) && contagens[3] <= todos;
  checar('pedidos-por-janela', cresce, `todos ${todos}; 24h ${contagens[0]}, 48h ${contagens[1]}, 72h ${contagens[2]}, semana ${contagens[3]}`);
  await page.getByRole('tab', { name: 'Hospitais' }).click();
  const hosp = await contar();
  const linhas = await page.locator('.pn-tabela tbody tr').allInnerTexts();
  await page.screenshot({ path: `${saida}/105-pedidos-semana-hospitais.png`, fullPage: true });
  checar('pedidos-por-perfil', hosp >= 0 && linhas.every((l) => /Hospital/.test(l) || /Nenhum/.test(l)), `${hosp} pedido(s) de hospitais na semana`);
} catch (e) { checar('pedidos-janela', false, e.message.split('\n')[0]); }
try {
  await visitar(page, '60-notas-lista', '/painel/notas/', { espera: 'Notas fiscais' });
  const notas = await page.locator('.pn-tabela tbody tr').count();
  checar('vendas-notas-emitidas', notas > 0, `${notas} nota(s) na primeira página`);
  await page.locator('.pn-tabela tbody tr').first().click();
  await page.getByRole('heading', { name: 'Nota fiscal' }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Envio' }).waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${saida}/61-pedido-vendas.png`, fullPage: true });
  checar('pedido-bloco-de-vendas', /\d{4} \d{4}|\d{44}/.test(await page.locator('.codigo-copia').first().innerText()), 'pedido mostra nota com chave, envio e reembolsos');
  await visitar(page, '62-produtos-lista', '/painel/produtos/', { espera: 'Produtos' });
  {
    const antes = page.url(); const grupo = page.locator('.pn-menu').getByRole('button', { name: 'Marketing' });
    await grupo.click(); await page.waitForTimeout(200);
    const abriu = await page.locator('.pn-menu').getByRole('link', { name: 'Newsletter' }).isVisible();
    await page.screenshot({ path: `${saida}/62b-menu-grupos.png` });
    await grupo.click(); await page.waitForTimeout(200);
    const fechou = !(await page.locator('.pn-menu').getByRole('link', { name: 'Newsletter' }).count());
    checar('menu-grupos', abriu && fechou && page.url() === antes && await page.locator('.pn-menu').getByRole('link', { name: 'Atributos', exact: true }).isVisible(),
      'grupo do menu abre e fecha as subcategorias sem sair da página; o grupo da página atual fica aberto');
  }
  await page.locator('.pn-tabela tbody tr').first().click();
  await page.getByRole('heading', { name: 'Atributos' }).waitFor({ timeout: 15000 });
  const campos = await page.locator('section:has(h2:text-is("Atributos")) label.campo').count();
  await page.screenshot({ path: `${saida}/63-produto-atributos.png`, fullPage: true });
  checar('produto-atributos-da-familia', campos >= 2, `${campos} campo(s) de atributo no produto`);
} catch (e) { checar('vendas-catalogo', false, e.message.split('\n')[0]); }

// Importação → Calculadora de importação: mesmos números do protótipo, recalcula ao digitar, busca de NCM
try {
  await visitar(page, '64-calculadora', '/painel/calculadora/', { espera: 'Resumo do embarque' });
  await page.evaluate(() => localStorage.removeItem('importfacil:calculadora'));
  await page.reload(); await page.getByText('Resumo do embarque').waitFor();
  const linha = (t) => page.locator('.calc-linha', { hasText: t }).first().locator('span').last().innerText();
  // ao abrir, os três câmbios vêm com o dólar do dia; com o câmbio da planilha (5,45) os números são os do protótipo
  await page.locator('#calcDolar').waitFor({ timeout: 15000 });
  const dolar = (await page.locator('#calcDolar b').innerText()).replace('R$', '').trim();
  await page.waitForFunction((d) => ['cDI', 'cFr', 'cPg'].every((c) => document.getElementById(c)?.value === d), dolar, { timeout: 5000 }).catch(() => undefined);
  const cambios = await Promise.all(['#cDI', '#cFr', '#cPg'].map((c) => page.locator(c).inputValue()));
  for (const c of ['#cDI', '#cFr', '#cPg']) await page.locator(c).fill('5,45');
  await page.waitForTimeout(200);
  const desembolso = await linha('Desembolso total');
  const menu = await page.locator('.pn-menu').getByRole('link', { name: 'Calculadora de importação' }).isVisible();
  await page.screenshot({ path: `${saida}/64-calculadora.png`, fullPage: true });
  await page.locator('#ci0_qtd').fill('4'); await page.waitForTimeout(200);
  const depois = await linha('Desembolso total');
  await page.getByRole('button', { name: 'Buscar NCM do item 1' }).click();
  await page.locator('.calc-ncm-op').first().waitFor({ timeout: 15000 });
  const codigo = await page.locator('.calc-ncm-op .calc-ncm-cod').first().innerText();
  await page.screenshot({ path: `${saida}/65-calculadora-ncm.png` });
  checar('calculadora', menu && cambios.every((c) => c === dolar) && /3\.978\.913,88/.test(desembolso) && depois !== desembolso && /^8806\./.test(codigo),
    `no menu Importação; abre com o dólar do dia (R$ ${dolar}); contêiner 20' a 5,45: desembolso ${desembolso}; com 4 unidades ${depois}; NCM sugerido ${codigo}`);
} catch (e) { checar('calculadora', false, e.message.split('\n')[0]); }
await ctx.close();

// Painel no celular: menu em gaveta e tabela em cartões
({ ctx, page } = await novaSessao({ ...devices['Pixel 7'] }));
await entrar(page, 'Equipe');
await visitar(page, '44-celular-painel', '/painel/', { espera: 'Total de vendas' });
try {
  await page.getByRole('button', { name: 'Abrir menu' }).click(); await page.waitForTimeout(400);
  await page.screenshot({ path: `${saida}/45-celular-menu.png` });
  checar('celular-menu', await page.locator('.pn-menu.pn-aberto').isVisible(), 'menu do Painel abre em gaveta');
  // o mesmo botão vira ✕ e fecha; clicar no grupo mostra as subcategorias sem sair da página
  await page.locator('.pn-topo').getByRole('button', { name: 'Fechar menu' }).click(); await page.waitForTimeout(400);
  const fechou = !(await page.locator('.pn-menu.pn-aberto').count());
  await page.getByRole('button', { name: 'Abrir menu' }).click(); await page.waitForTimeout(400);
  const antes = page.url();
  await page.locator('.pn-menu').getByRole('button', { name: 'Vendas' }).click(); await page.waitForTimeout(300);
  const sub = await page.locator('.pn-menu .pn-filhos').getByRole('link', { name: 'Notas fiscais' }).isVisible();
  await page.screenshot({ path: `${saida}/45b-celular-menu-vendas.png` });
  checar('celular-menu-grupos', fechou && sub && page.url() === antes, 'botão ✕ fecha o menu; Vendas abre as subcategorias sem sair da página');
  await page.locator('.pn-menu .pn-filhos').getByRole('link', { name: 'Notas fiscais' }).click();
  await page.waitForURL(/\/painel\/notas\//, { timeout: 15000 }); await page.waitForTimeout(400);
  checar('celular-menu-navega', page.url().includes('/painel/notas/') && !(await page.locator('.pn-menu.pn-aberto').count()), 'subcategoria abre a página e a gaveta fecha');
} catch (e) { checar('celular-menu', false, e.message.split('\n')[0]); }
await visitar(page, '46-celular-pedidos', '/painel/pedidos/', { espera: 'Pedidos' });
await ctx.close();

await browser.close();
fs.writeFileSync(`${saida}/relatorio.json`, JSON.stringify({ base, paginas: relatorio, erros }, null, 2));
console.log(relatorio.map((r) => `${r.ok ? 'OK ' : 'ERRO'} ${r.status} ${r.nome} ${r.caminho}${r.titulo ? ' · ' + r.titulo : ''}`).join('\n'));
if (erros.length) { console.error('\nFalhas:\n' + erros.join('\n')); process.exit(1); }
