import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'kysely';
import { Publico } from '../auth/decoradores';
import { BANCO, type Banco } from '../banco/banco.module';

/** Usado pelo balanceador de carga e pelos alarmes: responde 200 só se o banco responde. */
@ApiTags('Saúde')
@Publico()
@SkipThrottle()
@Controller('saude')
export class SaudeController {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  @Get()
  async verificar() {
    try {
      await sql`select 1`.execute(this.db);
    } catch {
      throw new ServiceUnavailableException({ status: 'indisponivel', banco: 'falhou' });
    }
    return { status: 'ok', banco: 'ok', versao: process.env.VERSAO_APP ?? 'local' };
  }
}
