import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { SoEquipe } from '../auth/decoradores';
import { PainelService } from './painel.service';

class PeriodoQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
}

@ApiTags('Equipe · Painel de controle')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/painel')
export class PainelController {
  constructor(private readonly painel: PainelService) {}

  @Get('avisos')
  @ApiOperation({ summary: 'O que pede atenção: cadastros em análise, boletos para faturar, pedidos para separar, orçamentos, ordens e parcelas vencidas' })
  avisos() {
    return this.painel.avisos();
  }

  @Get()
  @ApiOperation({ summary: 'Painel de controle: vendas, pedidos, clientes e ticket médio do período (com comparação), gráfico diário, rankings, estoque baixo e hoje' })
  resumo(@Query() q: PeriodoQuery) {
    const p = this.painel.periodo(q.de, q.ate);
    return this.painel.resumo(p.de, p.ate);
  }
}
