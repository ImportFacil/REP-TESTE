import { gerarTokenDev } from '../auth/verificador-dev';

/**
 * Gera um token de login de desenvolvimento (só funciona com AUTH_MODO=dev).
 * Uso: node dist/scripts/token-dev.js admin@exportfacil.dev equipe
 *      node dist/scripts/token-dev.js compras@coop-demo.com.br cliente
 */
const [email, origem] = process.argv.slice(2);
if (!email || (origem !== 'cliente' && origem !== 'equipe')) {
  console.error('Uso: token-dev <email> <cliente|equipe>');
  process.exit(1);
}
gerarTokenDev(process.env.AUTH_SEGREDO_DEV ?? 'segredo-apenas-para-desenvolvimento-local', `dev-${email}`, origem, 8 * 3600).then((t) => console.log(t));
