import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { SoEquipe } from '../auth/decoradores';
import { RelatoriosService, type Agrupamento } from './relatorios.service';

class PeriodoQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
}
class VendasQuery extends PeriodoQuery {
  @ApiPropertyOptional({ enum: ['dia', 'semana', 'mes'] }) @IsOptional() @IsIn(['dia', 'semana', 'mes']) agrupar?: Agrupamento;
}

@ApiTags('Equipe · Relatórios')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/relatorios')
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get('vendas')
  @ApiOperation({ summary: 'Vendas por dia, semana ou mês: pedidos, descontos, juros, reembolsos, líquido; por forma de pagamento e tipo de cliente' })
  vendas(@Query() q: VendasQuery) { return this.relatorios.vendas(q.de, q.ate, q.agrupar); }

  @Get('produtos')
  @ApiOperation({ summary: 'Produtos e categorias mais vendidos no período' })
  produtos(@Query() q: PeriodoQuery) { return this.relatorios.produtos(q.de, q.ate); }

  @Get('clientes')
  @ApiOperation({ summary: 'Empresas: pedidos, vendas e ticket no período; primeira e última compra' })
  clientes(@Query() q: PeriodoQuery) { return this.relatorios.clientes(q.de, q.ate); }
}
