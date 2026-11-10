import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { CONFIG, type Config } from '../config';
import { criarConexao } from './conexao';
import type { Database } from './tipos';

export const BANCO = Symbol('BANCO');
export type Banco = Kysely<Database>;

@Global()
@Module({
  providers: [
    {
      provide: BANCO,
      inject: [CONFIG],
      useFactory: (config: Config) => criarConexao(config.banco),
    },
  ],
  exports: [BANCO],
})
export class BancoModule implements OnApplicationShutdown {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
