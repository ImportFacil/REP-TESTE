#!/usr/bin/env bash
# Pausa ou retoma um ambiente de testes (homologação ou dev) para gastar menos.
#
#   infra/scripts/pausar-retomar.sh pausar   [homolog]
#   infra/scripts/pausar-retomar.sh retomar  [homolog]
#   infra/scripts/pausar-retomar.sh situacao [homolog]
#
# Pausado: API e worker com 0 tarefas, banco parado, alarmes sem enviar e-mail.
# Continuam cobrando: balanceador, IPs públicos do balanceador, disco e backup do banco, segredos e chaves.
# Retomar leva de 5 a 10 minutos (o banco precisa ligar).
#
# Atenção: a AWS liga sozinha um banco parado depois de 7 dias. O agendamento do GitHub
# (workflow "Homologação: ligar e desligar") roda "pausar" toda noite, o que o desliga de novo.
#
# Usa os parâmetros /exportfacil/<ambiente>/* gravados pelo Terraform. Produção não pode ser pausada.
set -euo pipefail

acao="${1:-situacao}"
amb="${2:-homolog}"
if [ "$amb" = "prod" ]; then
  echo "Produção não é pausada por este script." >&2
  exit 1
fi

P="/exportfacil/$amb"
ler() { aws ssm get-parameter --name "$P/$1" --query Parameter.Value --output text; }

cluster=$(ler ecs/cluster)
api=$(ler ecs/servico)
worker=$(ler ecs/servico-worker)
banco=$(ler banco/id)
nome=$(ler nome)

estado_banco() { aws rds describe-db-instances --db-instance-identifier "$banco" --query 'DBInstances[0].DBInstanceStatus' --output text; }
tarefas() { aws ecs describe-services --cluster "$cluster" --services "$1" --query 'services[0].desiredCount' --output text; }
alarmes() { aws cloudwatch describe-alarms --alarm-name-prefix "$nome-" --query 'MetricAlarms[].AlarmName' --output text; }

escala_api() { # mínimo máximo
  aws application-autoscaling register-scalable-target --service-namespace ecs \
    --resource-id "service/$cluster/$api" --scalable-dimension ecs:service:DesiredCount \
    --min-capacity "$1" --max-capacity "$2"
}

alarmes_ligados() { # true | false
  local lista
  lista=$(alarmes)
  [ -z "$lista" ] && return 0
  # shellcheck disable=SC2086
  if [ "$1" = true ]; then aws cloudwatch enable-alarm-actions --alarm-names $lista; else aws cloudwatch disable-alarm-actions --alarm-names $lista; fi
}

situacao() {
  echo "Ambiente:  $amb"
  echo "Banco:     $(estado_banco)"
  echo "API:       $(tarefas "$api") tarefa(s)"
  echo "Worker:    $(tarefas "$worker") tarefa(s)"
}

case "$acao" in
  pausar)
    echo "Pausando $amb..."
    alarmes_ligados false
    escala_api 0 0
    aws ecs update-service --cluster "$cluster" --service "$api" --desired-count 0 >/dev/null
    aws ecs update-service --cluster "$cluster" --service "$worker" --desired-count 0 >/dev/null
    case "$(estado_banco)" in
      available) aws rds stop-db-instance --db-instance-identifier "$banco" >/dev/null && echo "Banco desligando." ;;
      stopped | stopping) echo "Banco já está parado." ;;
      *) echo "::warning::O banco está em '$(estado_banco)'; rode 'pausar' de novo mais tarde para desligá-lo." ;;
    esac
    situacao
    ;;

  retomar)
    if [ "$(estado_banco)" = "available" ] && [ "$(tarefas "$api")" != "0" ]; then
      echo "$amb já está no ar."
      situacao
      exit 0
    fi
    echo "Retomando $amb (de 5 a 10 minutos)..."
    for _ in $(seq 1 60); do
      case "$(estado_banco)" in
        stopping) sleep 15 ;;
        stopped) aws rds start-db-instance --db-instance-identifier "$banco" >/dev/null; echo "Banco ligando."; break ;;
        *) break ;;
      esac
    done
    aws rds wait db-instance-available --db-instance-identifier "$banco"
    echo "Banco no ar."
    minimo=$(ler ecs/api-min)
    escala_api "$minimo" "$(ler ecs/api-max)"
    aws ecs update-service --cluster "$cluster" --service "$api" --desired-count "$minimo" >/dev/null
    aws ecs update-service --cluster "$cluster" --service "$worker" --desired-count "$(ler ecs/worker-quantidade)" >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$api" "$worker" || echo "::warning::A API ainda está subindo; confira em alguns minutos."
    alarmes_ligados true
    situacao
    ;;

  situacao)
    situacao
    ;;

  *)
    echo "Uso: $0 pausar|retomar|situacao [ambiente]" >&2
    exit 2
    ;;
esac
