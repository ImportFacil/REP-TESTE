import { Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from '../config';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { FILA, FilaMemoria, FilaSqs } from './fila';
import { GATEWAY } from './gateway';
import { GatewaySimulador } from './gateway-simulador';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { PoliticaService } from './politica.service';
import { WebhookService } from './webhook.service';

/** Módulo "Pagamentos": política, cobranças, parcelas, webhooks e fila. */
@Global()
@Module({
  providers: [
    {
      provide: GATEWAY,
      inject: [CONFIG],
      useFactory: (c: Config) => (c.pagamentos.gateway === 'simulador' ? new GatewaySimulador(c.pagamentos.segredoWebhookSimulador) : null),
    },
    { provide: FILA, inject: [CONFIG], useFactory: (c: Config) => (c.filaEventosUrl ? new FilaSqs(c.filaEventosUrl) : new FilaMemoria()) },
    PoliticaService,
    PagamentosService,
    WebhookService,
    NotificacoesService,
  ],
  controllers: [PagamentosController],
  exports: [GATEWAY, FILA, PoliticaService, PagamentosService, WebhookService, NotificacoesService],
})
export class PagamentosModule {}
