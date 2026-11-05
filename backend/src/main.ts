import 'reflect-metadata';
import { criarAplicacao } from './aplicacao';
import { lerConfig } from './config';

async function iniciar(): Promise<void> {
  const config = lerConfig();
  const app = await criarAplicacao(config);
  await app.listen(config.porta, '0.0.0.0');
}

iniciar().catch((e) => {
  console.error('A API não iniciou:', e);
  process.exit(1);
});
