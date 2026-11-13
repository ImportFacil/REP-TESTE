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
}

/**
 * A sessão não fica mais no localStorage (que qualquer script da página consegue ler).
 * O token de acesso vive só na memória desta página; a API guarda a sessão num cookie httpOnly,
 * que o JavaScript não lê, e devolve um token novo em POST /sessao/renovar quando a página abre
 * ou quando o token vence.
 */
let sessao: Sessao | null = null;
let renovando: Promise<Sessao | null> | null = null;
const CHAVE_ANTIGA = 'importfacil:sessao';
const CHAVE_PKCE = 'importfacil:pkce';

function apagarSessaoAntiga() {
  try { localStorage.removeItem(CHAVE_ANTIGA); } catch { /* sem armazenamento */ }
}

function guardar(origem: Origem, token: string, expiraEmSegundos: number) {
  sessao = { origem, token, expiraEm: Date.now() + expiraEmSegundos * 1000 };
  apagarSessaoAntiga();
  return sessao;
}

async function chamarSessao(caminho: string, corpo?: unknown) {
  const c = await carregarConfig();
  return fetch(`${c.api}/sessao${caminho}`, {
    method: 'POST', credentials: 'include',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

/** Pede à API um token novo a partir do cookie da sessão (uma chamada por vez). */
function renovar(): Promise<Sessao | null> {
  renovando ??= chamarSessao('/renovar')
    .then(async (r) => {
      if (!r.ok) { sessao = null; return null; }
      const d = (await r.json()) as { origem: Origem; token: string; expira_em_segundos: number };
      return guardar(d.origem, d.token, d.expira_em_segundos);
    })
    .catch(() => null)
    .finally(() => { renovando = null; });
  return renovando;
}

/** A sessão atual: da memória ou, ao abrir a página, recuperada do cookie. */
export async function sessaoAtual(): Promise<Sessao | null> {
  if (sessao && Date.now() < sessao.expiraEm - 60_000) return sessao;
  return renovar();
}

/** Esquece a sessão nesta página e apaga o cookie na API. */
export function sair() {
  sessao = null;
  apagarSessaoAntiga();
  void chamarSessao('/sair').catch(() => undefined);
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
  // o refresh token vai direto para o cookie httpOnly da API e não fica guardado na página
  const s = await chamarSessao('', { origem: pkce.origem, refresh_token: t.refresh_token });
  if (!s.ok) throw new Error('Não foi possível concluir o login.');
  const d = (await s.json()) as { token: string; expira_em_segundos: number };
  guardar(pkce.origem, d.token, d.expira_em_segundos);
  return pkce.origem;
}

/** Login de desenvolvimento (só com AUTH_MODO=dev na API). */
export async function entrarDev(email: string, origem: Origem) {
  const c = await carregarConfig();
  const r = await fetch(`${c.api}/dev/token`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, origem }) });
  if (!r.ok) throw new Error('Login de desenvolvimento indisponível.');
  const { token } = await r.json();
  guardar(origem, token, 8 * 3600);
}

/** Token válido para chamar a API (renovado pela API quando está para vencer). */
export async function tokenValido(): Promise<string | null> {
  return (await sessaoAtual())?.token ?? null;
}

/** Sai também da sessão do Cognito. */
export async function sairCompleto() {
  const s = sessao;
  sair();
  const c = await carregarConfig();
  const g = s && c.auth === 'cognito' ? (s.origem === 'equipe' ? c.equipe : c.clientes) : undefined;
  if (g) location.assign(`https://${g.dominio}/logout?${new URLSearchParams({ client_id: g.client, logout_uri: `${location.origin}/` })}`);
  else location.assign('/entrar/');
}
