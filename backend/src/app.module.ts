import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { BancoModule } from './banco/banco.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { CONFIG, type Config } from './config';
import { ContasModule } from './contas/contas.module';
import { SaudeController } from './saude/saude.controller';

@Module({})
export class AppModule {
  static com(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [
        { module: class ConfigModule {}, global: true, providers: [{ provide: CONFIG, useValue: config }], exports: [CONFIG] },
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.ambiente === 'teste' ? 'silent' : config.ambiente === 'prod' ? 'info' : 'debug',
            // Cada linha de log leva o id da requisição; o balanceador repassa X-Request-Id se houver.
            genReqId: (req, res) => {
              const id = (req.headers['x-request-id'] as string) || randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            transport: config.ambiente === 'local' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
            autoLogging: { ignore: (req) => req.url?.endsWith('/saude') ?? false },
          },
        }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.limiteRequisicoesPorMinuto }]),
        BancoModule,
        AuthModule,
        AuditoriaModule,
        ContasModule,
        CatalogoModule,
      ],
      controllers: [SaudeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
