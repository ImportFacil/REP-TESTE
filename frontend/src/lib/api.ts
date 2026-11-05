import { carregarConfig } from './config';
import { sair, tokenValido } from './auth';

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string, public dados?: unknown) {
    super(mensagem);
  }
}

/** Chama a API com o token da sessão. 401 manda de volta para o login. */
export async function api<T = unknown>(caminho: string, opcoes: { metodo?: string; corpo?: unknown; arquivo?: FormData } = {}): Promise<T> {
  const c = await carregarConfig();
  const token = await tokenValido();
  if (!token) {
    location.assign('/entrar/');
    throw new ErroApi(401, 'Faça login para continuar.');
  }
  const r = await fetch(`${c.api}${caminho}`, {
    method: opcoes.metodo ?? (opcoes.corpo || opcoes.arquivo ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: opcoes.arquivo ?? (opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined),
  });
  if (r.status === 401) {
    sair();
    location.assign('/entrar/');
  }
  const tipo = r.headers.get('content-type') ?? '';
  const dados = tipo.includes('application/json') ? await r.json() : await r.blob();
  if (!r.ok) {
    const d = dados as { message?: string | string[] };
    const msg = Array.isArray(d?.message) ? d.message.join(' ') : d?.message ?? 'Algo deu errado. Tente de novo.';
    throw new ErroApi(r.status, traduzir(msg), dados);
  }
  return dados as T;
}

/** As mensagens de validação da API vêm em inglês quando são genéricas; traduz as mais comuns. */
function traduzir(m: string): string {
  return m
    .replace(/should not be empty/g, 'é obrigatório')
    .replace(/must be an email/g, 'deve ser um e-mail válido')
    .replace(/must not be less than (\d+)/g, 'deve ser no mínimo $1')
    .replace(/must be an integer number/g, 'deve ser um número inteiro')
    .replace(/property (\w+) should not exist/g, 'o campo $1 não é aceito');
}

/** Baixa um arquivo protegido (documentos) e abre no navegador. */
export async function baixar(caminho: string, nome: string) {
  const blob = await api<Blob>(caminho);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
