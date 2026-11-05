import { carregarConfig, type GrupoCognito } from './config';

/**
 * Login. Na AWS: Cognito (tela de login da AWS, código + PKCE), com grupos separados
 * para clientes e equipe. No ambiente local: login de desenvolvimento, sem senha.
 */
export type Origem = 'cliente' | 'equipe';

interface Sessao {
  origem: Origem;
  token: string;
  expiraEm: number;
  refresh?: string;
}

const CHAVE = 'importfacil:sessao';
const CHAVE_PKCE = 'importfacil:pkce';

export function sessaoAtual(): Sessao | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Sessao | null;
    return s && s.token ? s : null;
  } catch {
    return null;
  }
}

function guardar(s: Sessao) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* navegação privada sem armazenamento: a sessão dura só esta página */
  }
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a limpar */
  }
}

function urlRetorno() {
  return `${location.origin}/auth/retorno/`;
}

function base64url(bytes: ArrayBuffer | Uint8Array) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function grupo(origem: Origem): Promise<GrupoCognito> {
  const c = await carregarConfig();
  const g = origem === 'equipe' ? c.equipe : c.clientes;
  if (!g) throw new Error('Login do Cognito não configurado neste ambiente.');
  return g;
}

/** Vai para a tela de login do Cognito (com PKCE). */
export async function entrarCognito(origem: Origem) {
  const g = await grupo(origem);
  const verificador = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const desafio = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
  const estado = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(CHAVE_PKCE, JSON.stringify({ verificador, estado, origem }));
  const q = new URLSearchParams({
    response_type: 'code', client_id: g.client, redirect_uri: urlRetorno(), scope: 'openid email profile',
    code_challenge: desafio, code_challenge_method: 'S256', state: estado,
  });
  location.assign(`https://${g.dominio}/oauth2/authorize?${q}`);
}

/** Volta do Cognito: troca o código pelos tokens. */
export async function concluirCognito(codigo: string, estado: string): Promise<Origem> {
  const pkce = JSON.parse(sessionStorage.getItem(CHAVE_PKCE) ?? 'null') as { verificador: string; estado: string; origem: Origem } | null;
  sessionStorage.removeItem(CHAVE_PKCE);
  if (!pkce || pkce.estado !== estado) throw new Error('A volta do login não confere. Tente entrar de novo.');
  const g = await grupo(pkce.origem);
  const r = await fetch(`https://${g.dominio}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: g.client, code: codigo, redirect_uri: urlRetorno(), code_verifier: pkce.verificador }),
  });
  if (!r.ok) throw new Error('Não foi possível concluir o login.');
  const t = await r.json();
  guardar({ origem: pkce.origem, token: t.access_token, refresh: t.refresh_token, expiraEm: Date.now() + t.expires_in * 1000 });
  return pkce.origem;
}

/** Login de desenvolvimento (só com AUTH_MODO=dev na API). */
export async function entrarDev(email: string, origem: Origem) {
  const c = await carregarConfig();
  const r = await fetch(`${c.api}/dev/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, origem }) });
  if (!r.ok) throw new Error('Login de desenvolvimento indisponível.');
  const { token } = await r.json();
  guardar({ origem, token, expiraEm: Date.now() + 8 * 3600_000 });
}

/** Token válido para chamar a API (renova com o refresh token quando possível). */
export async function tokenValido(): Promise<string | null> {
  const s = sessaoAtual();
  if (!s) return null;
  if (Date.now() < s.expiraEm - 60_000) return s.token;
  if (!s.refresh) {
    sair();
    return null;
  }
  try {
    const g = await grupo(s.origem);
    const r = await fetch(`https://${g.dominio}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: g.client, refresh_token: s.refresh }),
    });
    if (!r.ok) throw new Error();
    const t = await r.json();
    guardar({ ...s, token: t.access_token, expiraEm: Date.now() + t.expires_in * 1000 });
    return t.access_token;
  } catch {
    sair();
    return null;
  }
}

/** Sai também da sessão do Cognito. */
export async function sairCompleto() {
  const s = sessaoAtual();
  sair();
  const c = await carregarConfig();
  const g = s && c.auth === 'cognito' ? (s.origem === 'equipe' ? c.equipe : c.clientes) : undefined;
  if (g) location.assign(`https://${g.dominio}/logout?${new URLSearchParams({ client_id: g.client, logout_uri: `${location.origin}/` })}`);
  else location.assign('/entrar/');
}
