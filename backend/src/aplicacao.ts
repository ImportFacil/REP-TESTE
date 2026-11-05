import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Config } from './config';

/** Monta a aplicação (usado pelo main.ts e pelos testes de ponta a ponta). */
export async function criarAplicacao(config: Config): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.com(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Atrás do CloudFront e do balanceador, o IP real de quem acessa vem em X-Forwarded-For.
  app.set('trust proxy', config.saltosProxy);
  app.disable('x-powered-by');
  app.enableCors({ origin: config.corsOrigens, credentials: false });
  if (config.prefixoApi) app.setGlobalPrefix(config.prefixoApi);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

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
