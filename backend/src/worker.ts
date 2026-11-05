import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { lerConfig } from './config';
import { FILA, FilaSqs, type Fila } from './pagamentos/fila';
import { WebhookService } from './pagamentos/webhook.service';
import { RotinasService } from './rotinas/rotinas.service';
import { iniciarSentry, registrarErro } from './observabilidade';

/**
 * Worker: processa a fila de eventos (avisos de pagamento) e roda as rotinas
 * (Pix vencido a cada 15 min; parcelas vencidas, régua de cobrança e orçamentos vencidos uma vez por dia).
 * Na AWS roda como um serviço do ECS separado da API, com a mesma imagem.
 */
async function iniciar(): Promise<void> {
  const config = lerConfig();
  iniciarSentry(config, 'worker');
  const app = await NestFactory.createApplicationContext(AppModule.com(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const log = app.get(Logger);
  const fila = app.get<Fila>(FILA);
  const webhooks = app.get(WebhookService);
  const rotinas = app.get(RotinasService);
  let parar = false;
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.on(sinal, () => (parar = true));

  const ciclo = async () => {
    try {
      await rotinas.executarPendentes();
    } catch (e) {
      log.error(`Falha nas rotinas: ${(e as Error).message}`);
      registrarErro(e, { onde: 'rotinas' });
    }
  };
  await ciclo();
  const timer = setInterval(ciclo, 5 * 60_000);

  if (fila instanceof FilaSqs) {
    log.log('Worker consumindo a fila de eventos.');
    await fila.consumir((m) => webhooks.processar(m).catch((e) => { registrarErro(e, { mensagem: m }); throw e; }), () => parar);
  } else {
    log.log('Fila em memória: os eventos são processados pela própria API; o worker só roda as rotinas.');
    while (!parar) await new Promise((r) => setTimeout(r, 1000));
  }
  clearInterval(timer);
  await app.close();
}

iniciar().catch((e) => {
  console.error('O worker parou:', e);
  process.exit(1);
});
