import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { lerConfig } from './config';
import { iniciarSentry } from './observabilidade';
import { iniciarTrabalhos } from './trabalhos';

/**
 * Worker: processa a fila de eventos (avisos de pagamento) e roda as rotinas
 * (Pix vencido a cada 15 min; parcelas vencidas, régua de cobrança e orçamentos vencidos uma vez por dia).
 * Na AWS roda como um serviço do ECS separado da API, com a mesma imagem
 * (em homologação, pode rodar dentro da API: ver WORKER_NA_API).
 */
async function iniciar(): Promise<void> {
  const config = lerConfig();
  iniciarSentry(config, 'worker');
  const app = await NestFactory.createApplicationContext(AppModule.com(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const parar = await iniciarTrabalhos(app);
  let encerrando = false;
  const encerrar = async () => {
    if (encerrando) return;
    encerrando = true;
    await parar();
    await app.close();
    process.exit(0);
  };
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.on(sinal, () => void encerrar());
}

iniciar().catch((e) => {
  console.error('O worker parou:', e);
  process.exit(1);
});
