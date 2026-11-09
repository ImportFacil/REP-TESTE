# Demonstração: Bagisto 2.5 + B2B Suite com o catálogo da ImportFácil

Loja de demonstração para comparar com o protótipo. Usa o [Bagisto](https://github.com/bagisto/bagisto) (MIT)
com a [B2B Suite](https://github.com/bagisto/b2b-suite) (MIT), em português do Brasil e em reais.

## O que vem carregado

- **Catálogo do protótipo:** as categorias, as subcategorias e os 446 produtos, com preço de tabela, estoque,
  destaques, especificações e foto (ou a ilustração do protótipo). O arquivo é `catalogo-importfacil.json`,
  exportado do `index.html`.
- **Uma empresa de demonstração por tipo de cliente.** Cada uma tem um catálogo próprio, que mostra só as
  categorias daquele tipo com o desconto do tipo, e uma linha de crédito de 2× o pedido mínimo.
- **Página inicial da ImportFácil:** banners, faixa de avisos, categorias, destaques, linha de importação,
  tipos de cliente e rodapé.
- **Frete grátis**, com a taxa fixa desligada.

## Acessos (só para a demonstração)

| Quem | Endereço | E-mail | Senha |
|---|---|---|---|
| Painel administrativo | `/admin` | admin@example.com | admin123 |
| Cooperativa Vale Verde | `/customer/login` | cooperativa@demo.importfacil.com.br | demo1234 |
| Distribuidora Norte Sul | `/customer/login` | distribuidora@demo.importfacil.com.br | demo1234 |
| Revenda Bom Campo | `/customer/login` | revendedor@demo.importfacil.com.br | demo1234 |
| Construtora Alicerce | `/customer/login` | construtora@demo.importfacil.com.br | demo1234 |
| Hospital Bom Pastor | `/customer/login` | hospital@demo.importfacil.com.br | demo1234 |

As empresas e os dados são fictícios. Não use estas senhas fora da demonstração.

## Como abrir

**No GitHub Codespaces (sem instalar nada):**
1. No repositório, abra **Code → Codespaces → ⋯ → New with options**.
2. Escolha a configuração **"Demo Bagisto + B2B Suite (ImportFácil)"** e uma máquina de 4 núcleos.
3. A primeira abertura leva de 10 a 20 minutos: o Bagisto é instalado e o catálogo é carregado.
4. A loja abre sozinha na porta 8000. O andamento fica em `/tmp/demo-bagisto.log`.

**No computador, com Docker Desktop:**

```bash
cd demo-bagisto
docker compose up --build
```

Depois, abra http://localhost:8000. O painel fica em http://localhost:8000/admin.

**Na homologação (AWS):** a mesma imagem roda numa máquina com Docker, com o MySQL ao lado.
Isso fica pendente até a conta AWS ser criada.

## Teste automático

O workflow `.github/workflows/bagisto-demo.yml` faz quatro coisas:
1. monta tudo do zero;
2. navega pela loja como visitante, como empresa e como administrador;
3. guarda as capturas de tela como artefato **capturas-demo-bagisto**;
4. publica a imagem em `ghcr.io/importfacil/importfacil-bagisto-demo`.

## Diferenças em relação ao protótipo

O Bagisto não tem estas regras do protótipo; elas exigiriam programação:
- **Múltiplo de venda:** aparece só na descrição do produto.
- **Pedido mínimo por tipo de cliente:** o Bagisto tem um único mínimo para a loja toda.
- **Pagamentos brasileiros:** não há Pix nem boleto do Asaas.
- **Nota fiscal eletrônica.**
- **Regras de importação:** sob encomenda, conta e ordem, calculadora e NCM.
