import { Body, Controller, ForbiddenException, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';
import { CONFIG, type Config } from '../config';
import { Publico } from './decoradores';
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
  async token(@Body() b: PedidoTokenDev) {
    if (this.config.auth.modo !== 'dev') throw new ForbiddenException();
    return { token: await gerarTokenDev(this.config.auth.segredoDev!, `dev-${b.email.toLowerCase()}`, b.origem, 8 * 3600) };
  }
}
