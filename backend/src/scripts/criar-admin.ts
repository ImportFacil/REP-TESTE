import 'reflect-metadata';
import { criarConexao } from '../banco/conexao';
import { lerConfig } from '../config';
import { ProvedorCognito, ProvedorDev } from '../auth/provedor-cognito';

/**
 * Cria o primeiro administrador da equipe (depois disso, novos usuários são convidados pela API).
 * Uso: node dist/scripts/criar-admin.js --email pessoa@importfacil.com.br --nome "Nome Sobrenome"
 */
async function principal(): Promise<void> {
  const args = process.argv.slice(2);
  const valor = (nome: string) => {
    const i = args.indexOf(`--${nome}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = valor('email')?.trim().toLowerCase();
  const nome = valor('nome')?.trim();
  if (!email || !nome) throw new Error('Informe --email e --nome.');

  const config = lerConfig();
  const db = criarConexao(config.banco);
  const provedor = config.auth.modo === 'cognito' ? new ProvedorCognito(config.auth) : new ProvedorDev();
  try {
    const existente = await db.selectFrom('usuarios').select(['id', 'cognito_sub']).where('origem', '=', 'equipe').where('email', '=', email).executeTakeFirst();
    if (existente?.cognito_sub) {
      console.log(`Já existe um usuário da equipe com o e-mail ${email}.`);
      return;
    }
    const { sub } = await provedor.convidar('equipe', email, nome);
    if (existente) {
      await db.updateTable('usuarios').set({ cognito_sub: sub, ativo: true, papel: 'administrador' }).where('id', '=', existente.id).execute();
    } else {
      await db.insertInto('usuarios').values({ origem: 'equipe', empresa_id: null, nome, email, papel: 'administrador', cognito_sub: sub }).execute();
    }
    await db.insertInto('auditoria').values({ usuario_id: null, acao: 'usuario.criar_admin', entidade: 'usuario', entidade_id: email, antes: null, depois: JSON.stringify({ email, nome }), ip: null }).execute();
    console.log(`Administrador criado: ${email}. ${config.auth.modo === 'cognito' ? 'O convite com a senha temporária foi enviado por e-mail.' : ''}`);
  } finally {
    await db.destroy();
  }
}

principal().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
