import 'reflect-metadata';
import { criarAplicacao } from './aplicacao';
import { lerConfig } from './config';
import { iniciarTrabalhos } from './trabalhos';

async function iniciar(): Promise<void> {
  const config = lerConfig();
  const app = await criarAplicacao(config);
  await app.listen(config.porta, '0.0.0.0');
  // Em homologação, a API também faz o trabalho do worker (uma tarefa a menos para pagar).
  if (config.workerNaApi) {
    const parar = await iniciarTrabalhos(app);
    for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.once(sinal, () => void parar());
  }
}

iniciar().catch((e) => {
  console.error('A API não iniciou:', e);
  process.exit(1);
});
