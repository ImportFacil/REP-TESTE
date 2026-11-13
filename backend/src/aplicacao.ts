import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Config } from './config';
import { FiltroErros, iniciarSentry } from './observabilidade';

/** Monta a aplicação (usado pelo main.ts e pelos testes de ponta a ponta). */
export async function criarAplicacao(config: Config): Promise<INestApplication> {
  iniciarSentry(config, 'api');
  const app = await NestFactory.create<NestExpressApplication>(AppModule.com(config), { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  // Atrás do CloudFront e do balanceador, o IP real de quem acessa vem em X-Forwarded-For.
  app.set('trust proxy', config.saltosProxy);
  app.disable('x-powered-by');
  // credentials: o site manda o cookie httpOnly da sessão (só para /sessao) quando está em outro endereço
  app.enableCors({ origin: config.corsOrigens, credentials: true });
  if (config.prefixoApi) app.setGlobalPrefix(config.prefixoApi);
  // Demonstração: o mesmo endereço serve o site (páginas estáticas do Next) e a API (em /api).
  if (config.pastaSite) app.useStaticAssets(config.pastaSite, { extensions: ['html'], index: 'index.html' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  app.useGlobalFilters(new FiltroErros(app.get(HttpAdapterHost).httpAdapter));

  if (config.documentacaoApi) {
    const doc = new DocumentBuilder()
      .setTitle('API ImportFácil')
      .setDescription('Fase 1: contas e acesso, catálogo e preços por tipo de cliente.')
      .setVersion(process.env.VERSAO_APP ?? 'local')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(config.prefixoApi ? `${config.prefixoApi}/docs` : 'docs', app, SwaggerModule.createDocument(app, doc));
  }
  return app;
}
