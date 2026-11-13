import type { Request, Response } from 'express';
import type { Config } from '../config';
import type { OrigemUsuario } from '../banco/tipos';

/**
 * A sessão fica num cookie httpOnly: o JavaScript da página não consegue ler, então um script malicioso (XSS)
 * não leva a sessão. O token de acesso vive só na memória da página e é renovado por POST /sessao/renovar.
 * No Cognito o cookie guarda o refresh token; no login de desenvolvimento, o próprio token de teste.
 */
export const COOKIE_SESSAO = 'if_sessao';

export interface ConteudoSessao { o: OrigemUsuario; r?: string; t?: string }

export function caminhoCookie(config: Config) {
  return config.prefixoApi ? `/${config.prefixoApi}/sessao` : '/sessao';
}

export function lerCookieSessao(req: Request): ConteudoSessao | null {
  const bruto = (req.headers.cookie ?? '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE_SESSAO}=`));
  if (!bruto) return null;
  try {
    const c = JSON.parse(Buffer.from(decodeURIComponent(bruto.slice(COOKIE_SESSAO.length + 1)), 'base64url').toString('utf8')) as ConteudoSessao;
    if ((c.o !== 'cliente' && c.o !== 'equipe') || (!c.r && !c.t)) return null;
    return c;
  } catch {
    return null;
  }
}

export function gravarCookieSessao(req: Request, res: Response, config: Config, conteudo: ConteudoSessao, validadeSegundos: number) {
  res.cookie(COOKIE_SESSAO, Buffer.from(JSON.stringify(conteudo)).toString('base64url'), {
    httpOnly: true,
    secure: req.secure, // https (atrás do CloudFront/Codespaces, com trust proxy); http só na máquina local e nos testes
    sameSite: 'strict',
    path: caminhoCookie(config), // só vai para as rotas da sessão, nunca para o resto da API
    maxAge: validadeSegundos * 1000,
  });
}

export function apagarCookieSessao(req: Request, res: Response, config: Config) {
  res.clearCookie(COOKIE_SESSAO, { httpOnly: true, secure: req.secure, sameSite: 'strict', path: caminhoCookie(config) });
}
