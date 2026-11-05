import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { Config } from './config';

let ligado = false;

/** Liga o Sentry quando SENTRY_DSN está configurado (erros no site e na API vão para lá). */
export function iniciarSentry(config: Config, servico: 'api' | 'worker'): void {
  if (!config.sentryDsn || ligado) return;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.ambiente,
    release: process.env.VERSAO_APP,
    serverName: servico,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  ligado = true;
}

export function registrarErro(erro: unknown, contexto?: Record<string, unknown>): void {
  if (ligado) Sentry.captureException(erro, { extra: contexto });
}

/** Envia ao Sentry só os erros inesperados (5xx); erros de validação e de permissão não. */
@Catch()
export class FiltroErros extends BaseExceptionFilter {
  override catch(erro: unknown, host: ArgumentsHost): void {
    const status = erro instanceof HttpException ? erro.getStatus() : 500;
    if (status >= 500) {
      const req = host.switchToHttp().getRequest();
      registrarErro(erro, { rota: `${req?.method} ${req?.url}`, requisicao: req?.id });
    }
    super.catch(erro, host);
  }
}
