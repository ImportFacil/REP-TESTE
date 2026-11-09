# Loja ImportFácil sobre Bagisto 2.5 + B2B Suite

A loja B2B da ImportFácil roda no [Bagisto](https://github.com/bagisto/bagisto) (MIT), com a
[B2B Suite](https://github.com/bagisto/b2b-suite) (MIT), em português do Brasil e em reais. As regras próprias
da ImportFácil foram reescritas em PHP no pacote `pacote/` (namespace `ImportFacil\Loja`). Elas substituem o
servidor Node.js e a loja Next.js, que ficaram guardados no ramo `legado-node`.

## O que cada parte faz

| Pasta | Conteúdo |
|---|---|
| `Dockerfile`, `docker-compose.yml`, `iniciar.sh` | Imagem com Bagisto + B2B Suite + pacote ImportFácil, MySQL 8 ao lado e instalação automática na primeira vez |
| `pacote/` | Regras da ImportFácil em PHP (lista abaixo) e o app instalável |
| `app/ImportfacilDemo.php` | Comando `importfacil:demo`, que carrega catálogo, empresas, crédito, catálogos por tipo, pagamentos e a página inicial |
| `catalogo-importfacil.json` | Categorias e 446 produtos exportados do protótipo (`index.html`) |
| `scripts/`, `marca/` | Geram as fotos e ilustrações dos produtos, os ícones das categorias, o logo e os banners |
| `lang/` | Textos em português que substituem os do Bagisto (rodapé, selo "Importado") |
| `testes/` | Navegação automática com Playwright, que testa as regras e tira as capturas |
| `resultado/` | Página com o que foi executado e as capturas (GitHub Pages) |

## Regras da ImportFácil reescritas em PHP (`pacote/src`)

| Regra do protótipo | Onde está no Bagisto |
|---|---|
| **Tipos de cliente** (Cooperativa, Distribuidora, Revendedor, Construtora, Hospital), cada um com desconto e pedido mínimo | Tabela `importfacil_tipos_cliente`, ligada ao grupo de clientes do catálogo da empresa na B2B Suite (`Support/Regras.php`) |
| **Preço e categorias por tipo** | Catálogos de empresa da B2B Suite, com desconto do tipo e só as categorias daquele tipo |
| **Pedido mínimo por tipo** | `Checkout/Cart.php` substitui o carrinho do Bagisto. O carrinho avisa quanto falta, e o checkout bloqueia o pedido abaixo do mínimo |
| **Múltiplo de venda** (caixa com 12, rolo com 4…) | Atributos `multiplo_venda` e `unidade_venda`. `Listeners/MultiploDeVenda.php` arredonda a quantidade do carrinho para o múltiplo, e a página do produto mostra o múltiplo e o preço do tipo |
| **Faixas de crédito** A, B e C (boleto em até 4, 2 ou nenhuma parcela) | Tabela `importfacil_empresas`, com a linha de crédito da B2B Suite (`b2b_company_credits`) |
| **Pix com 3% de desconto** | Forma de pagamento `importfacil_pix` (`Payment/Pix.php`) e a regra de carrinho "Pix: 3% de desconto" |
| **Boleto 30/60/90/120 dias** | "Pay By Credit" da B2B Suite, que desconta do crédito da empresa. `Listeners/GerarParcelas.php` cria as parcelas conforme a faixa |
| **Cartão até 12×** | Forma de pagamento `importfacil_cartao` (`Payment/Cartao.php`) |
| **Financeiro do cliente** | Página `/customer/account/financeiro` na conta da empresa: parcelas, vencimentos, situação e totais |
| **App para celular** | App instalável (PWA): `/manifest.webmanifest`, `/sw.js` (funciona sem rede) e a página `/app` com QR e o passo a passo |

Pix, boleto e cartão ainda são simulados: a cobrança de verdade entra com o Asaas.

## Acessos (só para teste)

| Quem | Endereço | E-mail | Senha |
|---|---|---|---|
| Painel administrativo | `/admin` | admin@example.com | admin123 |
| Cooperativa Vale Verde (faixa A) | `/customer/login` | cooperativa@demo.importfacil.com.br | demo1234 |
| Distribuidora Norte Sul (faixa A) | `/customer/login` | distribuidora@demo.importfacil.com.br | demo1234 |
| Revenda Bom Campo (faixa B) | `/customer/login` | revendedor@demo.importfacil.com.br | demo1234 |
| Construtora Alicerce (faixa A) | `/customer/login` | construtora@demo.importfacil.com.br | demo1234 |
| Hospital Bom Pastor (faixa C) | `/customer/login` | hospital@demo.importfacil.com.br | demo1234 |

As empresas e os dados são fictícios. Não use estas senhas fora do ambiente de teste.

## Como abrir

**No GitHub Codespaces (sem instalar nada):**
[abrir a loja no Codespaces](https://codespaces.new/ImportFacil/REP-TESTE?devcontainer_path=.devcontainer%2Fbagisto%2Fdevcontainer.json)
(configuração **"Loja ImportFácil (Bagisto + B2B Suite)"**, máquina de 4 núcleos).
1. A primeira abertura leva de 10 a 20 minutos, porque o Bagisto é instalado e o catálogo é carregado. O andamento fica em `/tmp/loja-bagisto.log`.
2. A porta 8000 fica pública, para o celular abrir sem login no GitHub. O endereço é
   `https://<nome-do-codespace>-8000.app.github.dev`. Se ela continuar privada, clique com o botão direito na porta 8000 → **Port Visibility → Public**.
3. **App no celular:** no computador, abra `<endereço>/app` e leia o QR com o celular. No Android, toque em
   **Instalar app**. No iPhone, use o Safari: **Compartilhar → Adicionar à Tela de Início**.

O endereço vale enquanto o Codespace estiver ligado. O endereço fixo vem com a homologação na AWS.

**No computador, com Docker Desktop:**

```bash
cd bagisto
docker compose up --build
```

Depois, abra http://localhost:8000 (o app fica em http://localhost:8000/app e o painel em /admin).

**Na homologação (AWS):** a mesma imagem (`ghcr.io/importfacil/importfacil-bagisto`) roda numa máquina com
Docker, com o MySQL ao lado. Isso fica pendente até a conta AWS ser criada.

## Teste automático

O workflow `.github/workflows/bagisto.yml` faz cinco coisas:
1. monta tudo do zero;
2. navega pela loja como visitante (no computador e no celular), como empresa e como administrador;
3. testa o app instalável (manifesto, service worker, ícones e QR), o múltiplo de venda, o aviso de pedido mínimo e o Financeiro;
4. publica as capturas no ramo `demo-bagisto-capturas` e como artefato **capturas-bagisto**;
5. publica a imagem em `ghcr.io/importfacil/importfacil-bagisto`.

## Ainda falta

- **Importação:** sob encomenda e conta e ordem, ordens de importação, calculadora de importação e NCM. Hoje isso está só no protótipo.
- **Asaas de verdade** para Pix, boleto e cartão, com a baixa automática das parcelas.
- **Painel da equipe:** a tela de decisão de crédito e faixa e a de recebíveis. Hoje o crédito é ajustado em B2B → Crédito da empresa.
- **NF-e** pelo ERP.
- **Homologação na AWS** com endereço fixo.
