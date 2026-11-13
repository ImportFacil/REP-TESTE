import { Body, Controller, ForbiddenException, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';
import { CONFIG, type Config } from '../config';
import { Publico } from './decoradores';
import { gravarCookieSessao } from './sessao-cookie';
import { gerarTokenDev } from './verificador-dev';

class PedidoTokenDev {
  @IsEmail() email!: string;
  @IsIn(['cliente', 'equipe']) origem!: 'cliente' | 'equipe';
}

/** Só com AUTH_MODO=dev (local e dev): entra como qualquer usuário de demonstração, sem senha. */
@ApiTags('Desenvolvimento')
@Publico()
@Controller('dev')
export class DevTokenController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Post('token')
  async token(@Body() b: PedidoTokenDev, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (this.config.auth.modo !== 'dev') throw new ForbiddenException();
    const token = await gerarTokenDev(this.config.auth.segredoDev!, `dev-${b.email.toLowerCase()}`, b.origem, 8 * 3600);
    gravarCookieSessao(req, res, this.config, { o: b.origem, t: token }, 8 * 3600); // a página guarda só na memória
    return { token };
  }
}
