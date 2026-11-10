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
import { CreditoModule } from './credito/credito.module';
import { DevTokenController } from './auth/dev-token.controller';
import { ImportacaoModule } from './importacao/importacao.module';
import { PagamentosModule } from './pagamentos/pagamentos.module';
import { PainelModule } from './painel/painel.module';
import { VendasModule } from './vendas/vendas.module';
import { ClientesModule } from './clientes/clientes.module';
import { ConteudoModule } from './conteudo/conteudo.module';
import { MarketingModule } from './marketing/marketing.module';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { LojaModule } from './loja/loja.module';
import { B2bModule } from './b2b/b2b.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { RotinasModule } from './rotinas/rotinas.module';
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
        PagamentosModule,
        CreditoModule,
        PedidosModule,
        ImportacaoModule,
        RotinasModule,
        PainelModule,
        VendasModule,
        ClientesModule,
        MarketingModule,
        ConteudoModule,
        RelatoriosModule,
        ConfiguracoesModule,
        LojaModule,
        B2bModule,
      ],
      controllers: [SaudeController, ...(config.auth.modo === 'dev' ? [DevTokenController] : [])],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
