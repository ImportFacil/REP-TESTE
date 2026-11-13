import { Body, Controller, ForbiddenException, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { CONFIG, type Config } from '../config';
import { Publico } from './decoradores';
import type { OrigemUsuario } from '../banco/tipos';
import { VERIFICADOR_TOKEN, type VerificadorToken } from './identidade';
import { apagarCookieSessao, gravarCookieSessao, lerCookieSessao } from './sessao-cookie';

class NovaSessaoDto {
  @IsIn(['cliente', 'equipe']) origem!: OrigemUsuario;
  @IsString() @MaxLength(8000) refresh_token!: string;
}

const TRINTA_DIAS = 30 * 24 * 3600;

/** Troca um refresh token do Cognito por um token de acesso (fluxo REFRESH_TOKEN_AUTH, cliente público, sem segredo). */
async function renovarNoCognito(config: Config, origem: OrigemUsuario, refresh: string) {
  const cliente = origem === 'equipe' ? config.auth.equipe : config.auth.clientes;
  const r = await fetch(`https://cognito-idp.${config.auth.regiao}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: cliente.clientId, AuthParameters: { REFRESH_TOKEN: refresh } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new UnauthorizedException('Sessão expirada. Entre de novo.');
  const d = (await r.json()) as { AuthenticationResult?: { AccessToken?: string; ExpiresIn?: number } };
  const token = d.AuthenticationResult?.AccessToken;
  if (!token) throw new UnauthorizedException('Sessão expirada. Entre de novo.');
  return { token, expiraEmSegundos: d.AuthenticationResult?.ExpiresIn ?? 3600 };
}

/**
 * Sessão do site num cookie httpOnly (o navegador não deixa o JavaScript ler).
 * O site guarda o token de acesso só na memória e, ao abrir ou quando ele vence, pede outro aqui.
 */
@ApiTags('Sessão')
@Publico()
@Controller('sessao')
export class SessaoController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorToken,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Depois do login no Cognito: guarda o refresh token num cookie httpOnly e devolve o token de acesso' })
  async criar(@Body() d: NovaSessaoDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (this.config.auth.modo !== 'cognito') throw new ForbiddenException('Use o login de desenvolvimento neste ambiente.');
    const t = await renovarNoCognito(this.config, d.origem, d.refresh_token);
    gravarCookieSessao(req, res, this.config, { o: d.origem, r: d.refresh_token }, TRINTA_DIAS);
    return { origem: d.origem, token: t.token, expira_em_segundos: t.expiraEmSegundos };
  }

  @Post('renovar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Devolve um token de acesso novo a partir do cookie da sessão' })
  async renovar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = lerCookieSessao(req);
    if (!s) throw new UnauthorizedException('Sem sessão.');
    try {
      if (this.config.auth.modo === 'cognito') {
        if (!s.r) throw new Error();
        const t = await renovarNoCognito(this.config, s.o, s.r);
        return { origem: s.o, token: t.token, expira_em_segundos: t.expiraEmSegundos };
      }
      if (!s.t) throw new Error();
      const id = await this.verificador.verificar(s.t); // token de teste vencido ou adulterado não passa
      const exp = JSON.parse(Buffer.from(s.t.split('.')[1], 'base64url').toString()).exp as number;
      return { origem: id.origem, token: s.t, expira_em_segundos: Math.max(0, exp - Math.floor(Date.now() / 1000)) };
    } catch {
      apagarCookieSessao(req, res, this.config);
      throw new UnauthorizedException('Sessão expirada. Entre de novo.');
    }
  }

  @Post('sair')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apaga o cookie da sessão' })
  sair(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    apagarCookieSessao(req, res, this.config);
    return { ok: true };
  }
}
