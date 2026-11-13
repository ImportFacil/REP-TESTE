# Protótipo no Render + Neon (plano grátis)

O link fica fixo e não depende do Codespace. No plano grátis o serviço "dorme" depois de 15 minutos
sem acesso: a primeira pessoa a abrir espera cerca de 1 minuto, e depois fica normal.

## 1. Neon (banco de dados)

1. Em console.neon.tech, crie um projeto (**New project**):
   - Nome: `importfacil`
   - Região: **AWS US East 1 (N. Virginia)**, a mesma do Render
   - Versão do Postgres: a padrão
2. Na tela do projeto, clique em **Connect**.
3. Desligue **Connection pooling** e copie o endereço inteiro. Ele começa com `postgresql://` e termina com `?sslmode=require`.
   Esse endereço tem a senha do banco: cole só no Render (passo 2) e não mande por chat nem e-mail.

## 2. Render (sistema)

1. Em dashboard.render.com, clique em **New → Blueprint**.
2. Conecte o GitHub e libere o repositório **ImportFacil/REP-TESTE**. Se pedir, autorize o app do Render na organização ImportFacil.
3. O Render lê o arquivo `render.yaml` e mostra o serviço **importfacil-prototipo** (plano Free).
4. No campo **DATABASE_URL**, cole o endereço do Neon. O `AUTH_SEGREDO_DEV` é gerado sozinho.
5. Clique em **Apply** (ou **Deploy Blueprint**). A primeira publicação leva de 10 a 15 minutos.
6. Quando aparecer **Live**, copie o endereço do serviço (algo como `https://importfacil-prototipo.onrender.com`).

Depois disso, cada mudança no `main` é publicada sozinha.

## O que fica de fora no plano grátis

- Arquivos anexados (documentos) somem quando o serviço reinicia: ficam numa pasta temporária.
- 5 GB de tráfego por mês, o que dá para testes.
- O banco grátis do Neon tem 1 GB; o protótipo usa bem menos.

Arquivos: `render.yaml` (raiz), `demo/render/montar.sh` (build), `demo/render/iniciar.sh` (início).
