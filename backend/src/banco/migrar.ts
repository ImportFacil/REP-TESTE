import { Migrator, type MigrationProvider } from 'kysely';
import { lerConfig } from '../config';
import { criarConexao } from './conexao';
import { MIGRACOES } from './migracoes';

/**
 * Aplica as migrações pendentes.
 * Uso: `node dist/banco/migrar.js` (no deploy roda como tarefa avulsa do ECS,
 * antes de a nova versão da API entrar no ar).
 */
const provedor: MigrationProvider = { getMigrations: async () => MIGRACOES };

export async function migrar(): Promise<void> {
  const config = lerConfig();
  const db = criarConexao(config.banco);
  try {
    const migrator = new Migrator({ db, provider: provedor, migrationTableName: 'migracoes', migrationLockTableName: 'migracoes_trava' });
    const { error, results } = await migrator.migrateToLatest();
    for (const r of results ?? []) {
      console.log(`${r.status === 'Success' ? 'ok ' : 'ERRO'} ${r.migrationName}`);
    }
    if (error) throw error;
    if (!results?.length) console.log('Banco já está na versão mais recente.');
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  migrar().catch((e) => {
    console.error('Falha ao migrar o banco:', e);
    process.exit(1);
  });
}
