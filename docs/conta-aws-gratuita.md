# Homologação na conta gratuita da AWS

Plano: **subir só a homologação** com os créditos da conta gratuita, enquanto não há clientes reais, e **criar a produção perto do lançamento**.

## Quanto dura

| | Ligada o tempo todo | Com horário automático (dias úteis, das 8h às 20h) |
| --- | --- | --- |
| Custo estimado | ~US$ 85 por mês | ~US$ 60 por mês |
| Com US$ 100 de crédito | ~5 semanas | ~7 semanas |
| Com US$ 200 de crédito | ~2 meses e meio | ~3 meses |

Estimativas com os preços de tabela de São Paulo e pouco uso. O maior custo é o balanceador (~US$ 26 por mês), que continua cobrando mesmo com a homologação pausada.

O plano gratuito termina **depois de 6 meses ou quando os créditos acabam**, o que vier primeiro. Aí a conta fica parada e você tem 90 dias para passar ao plano pago sem perder nada. Para a homologação não sair do ar, **passe ao plano pago antes de os créditos acabarem** (o saldo que sobrar continua valendo).

O que já foi ajustado para gastar menos em homologação:
- sem NAT, com banco micro e uma única tarefa pequena da API;
- sem WAF (a produção continua com ele);
- a própria API roda as rotinas e a fila, então não há worker separado;
- o horário automático desliga a API e o banco à noite e nos fins de semana.

## Passo a passo

### 1. Criar a conta (você)

Criar a conta envolve cartão, senha e confirmação por telefone, por isso só você pode fazer.

1. Em https://aws.amazon.com/free, clique em **Criar uma conta gratuita**.
2. Use um e-mail da empresa que não seja pessoal, por exemplo `aws@exportfacil.com.br`. Ele vira o dono da conta.
3. Na escolha de plano, marque **Plano gratuito** (Free plan).
4. **Importante:** se a AWS oferecer o caminho novo com "AWS Builder ID" ou "projetos", escolha a opção avançada (**Sign up for AWS (advanced)**), com e-mail e senha de usuário raiz. O caminho novo coloca tudo em Ohio (EUA), não deixa escolher São Paulo e não permite o WAF da produção.
5. Ative a verificação em 2 etapas (MFA) do usuário raiz: menu do nome da conta › **Security credentials**.

### 2. Ganhar os créditos extras (você, ~20 minutos)

No console, abra **Billing and Cost Management › Free Tier** (ou o painel "Explorar a AWS" da página inicial). Cada atividade vale US$ 20:

| Atividade | Como fazer sem gastar | Depois |
| --- | --- | --- |
| **AWS Budgets** | Crie um orçamento de custo mensal de **US$ 90** com alerta por e-mail. Ele também serve para avisar quando o gasto subir | Mantenha |
| **Amazon EC2** | Lance uma instância `t3.micro` com as opções padrão | Encerre (Terminate) |
| **AWS Lambda** | Crie uma função "Hello world" e clique em Test | Apague |
| **Amazon Bedrock** | Mande uma pergunta no Playground | — |
| **Amazon RDS** | Pode contar com o banco que a homologação cria no passo 3. Se a atividade não marcar, siga o passo guiado e apague o banco de teste em seguida | Apague o de teste |

Faça tudo na região **América do Sul (São Paulo)**.

### 3. Criar a homologação (você cola um comando)

1. No topo do console, escolha a região **América do Sul (São Paulo)**.
2. Clique no ícone **CloudShell** (`>_`), ao lado da busca.
3. Cole e tecle Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/ImportFacil/Export-F-cil-PROTOTIPE/main/infra/cloudshell/criar-homologacao.sh | bash
   ```

4. Responda `s` e informe o e-mail que vai receber os alertas.
5. Espere de 15 a 25 minutos. **Clique dentro do terminal a cada 10 minutos**, porque o CloudShell fecha depois de 20 minutos sem uso. Se ele fechar, abra de novo e cole o mesmo comando: o script continua de onde parou.
6. No fim, o script mostra três valores (`AWS_PAPEL_BUILD`, `ECR_REPOSITORIO`, `AWS_PAPEL_DEPLOY`) e o endereço da homologação. Copie tudo.
7. Confirme a inscrição no e-mail de alertas que a AWS envia.

### 4. Ligar o GitHub à AWS (você, ou eu com a sua permissão)

No repositório **ImportFacil/Export-F-cil-PROTOTIPE**:

1. Abra **Settings › Secrets and variables › Actions › aba Variables › New repository variable** e crie:
   - `AWS_PAPEL_BUILD`
   - `ECR_REPOSITORIO`
2. Abra **Settings › Environments › New environment**, crie `homolog` e, dentro dele, a variável `AWS_PAPEL_DEPLOY`.

Se preferir, me mande os três valores. Com o Chrome logado como ImportFacil e a sua autorização, eu cadastro.

### 5. Primeiro deploy e primeiro administrador

1. Em **Actions › Entrega › Run workflow**, escolha `homolog`. Leva uns 10 minutos: publica a imagem, migra o banco, sobe a API e publica o site.
2. Em **Actions › Criar administrador › Run workflow**, informe o seu e-mail e nome. Chega por e-mail uma senha temporária. No primeiro login, troque a senha e ative a verificação em 2 etapas.
3. Abra o endereço da homologação. O protótipo antigo fica em `/prototipo/`.

A partir daí, cada commit no `main` atualiza a homologação sozinho.

## Ligar e desligar a homologação

O workflow **Homologação: ligar e desligar** já vem ativo:
- liga de segunda a sexta às 8h;
- desliga todo dia às 20h (horário de Brasília).

Ligar leva de 5 a 10 minutos. Pausada, a homologação mantém os dados, mas o site abre sem API.

| Quero | Faça |
| --- | --- |
| Usar fora do horário | **Actions › Homologação: ligar e desligar › Run workflow › retomar**. Um commit no `main` também liga, e ela desliga de novo às 20h |
| Deixar sempre ligada | Variável do repositório `HOMOLOG_HORARIO` = `sempre` |
| Deixar parada por um tempo (férias) | `HOMOLOG_HORARIO` = `pausado`, e rode o workflow com **pausar** |
| Voltar ao horário automático | Apague a variável `HOMOLOG_HORARIO` (ou use `comercial`) |

A AWS religa sozinha um banco parado depois de 7 dias. O desligamento das 20h roda todo dia justamente para pará-lo de novo.

## Acompanhar os créditos

- **Billing and Cost Management › Credits**: saldo e data de validade.
- **Cost Explorer**: gasto por serviço. O normal é ver balanceador, RDS, Fargate e IPs públicos (VPC).
- O orçamento de US$ 90 do passo 2 avisa por e-mail se o mês passar do esperado.

## Quando os créditos estiverem acabando

1. Passe a conta ao **plano pago**: Billing › **Upgrade plan**. A conta, os dados e o saldo de créditos continuam.
2. Peça créditos do **AWS Activate**. Contas no plano gratuito não podem pedir, mas no plano pago a Export Fácil pode se inscrever no Activate Founders (US$ 1.000, sem investidor). Exige site e e-mail com o domínio da empresa. Se houver investidor, aceleradora ou parceiro da AWS, há programas com mais crédito.

## Criar a produção (perto do lançamento)

A produção custa cerca de US$ 245 por mês. Ela tem NAT, banco maior, backup de 35 dias, WAF e worker separado. Já precisa estar no plano pago.

1. **Domínio:** de preferência, tenha o domínio (ex.: `exportfacil.com.br`) no Route 53 e o Amazon SES configurado para os e-mails do login.
2. **No CloudShell (São Paulo):**

   ```bash
   cd ~/Export-F-cil-PROTOTIPE && git pull
   cd infra/ambientes/prod
   cp prod.tfvars.exemplo prod.tfvars   # preencha: imagem_api (igual à homologação), imagem_tag_inicial (o commit em homologação), e-mail e domínio
   ~/bin/terraform init -backend-config=../backend.hcl
   ~/bin/terraform apply -var-file=prod.tfvars
   ```

3. **No GitHub:**
   - crie o environment `producao`, marque **Required reviewers** e adicione a variável `AWS_PAPEL_DEPLOY` com o papel de produção (saída `papeis_deploy` do bootstrap);
   - crie a variável do repositório `PRODUCAO_ATIVA` = `true`.
4. **Primeiro deploy:** faça um commit no `main`. Ele passa por homologação e espera a aprovação para ir à produção.
5. **Primeiro administrador:** rode **Criar administrador** com o ambiente `prod`.

Até `PRODUCAO_ATIVA` ser `true`, o workflow Entrega não tenta publicar em produção.
