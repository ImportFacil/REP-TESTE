import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { SoEquipe } from '../auth/decoradores';
import { RelatoriosService, type Agrupamento } from './relatorios.service';

class PeriodoQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
}
class VendasQuery extends PeriodoQuery {
  @ApiPropertyOptional({ enum: ['dia', 'semana', 'mes'] }) @IsOptional() @IsIn(['dia', 'semana', 'mes']) agrupar?: Agrupamento;
}

class JanelaQuery extends PeriodoQuery {
  @ApiPropertyOptional({ description: 'Últimas N horas (24, 48, 72, 168 = semana, 720 = 30 dias). Sem horas nem período: últimos 7 dias.', example: 24 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9600) horas?: number;
  @ApiPropertyOptional({ description: 'Perfil do cliente: revendedor, distribuidora, construtora, cooperativa, hospital' }) @IsOptional() @IsString() @MaxLength(40) tipo_cliente?: string;
  @ApiPropertyOptional({ description: 'Só este cliente' }) @IsOptional() @IsUUID() empresa_id?: string;
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

  @Get('pedidos')
  @ApiOperation({ summary: 'Consolidado de pedidos (com a descrição dos itens e a situação financeira de cada um), por cliente e por perfil: últimas 24/48/72 horas, semana, mês ou período' })
  pedidos(@Query() q: JanelaQuery) { return this.relatorios.pedidos(q); }

  @Get('financeiro')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Financeiro de todos os clientes: vendido e recebido na janela; em aberto, vencido, atraso e crédito hoje' })
  financeiro(@Query() q: JanelaQuery) { return this.relatorios.financeiro(q); }

  @Get('clientes')
  @ApiOperation({ summary: 'Empresas: pedidos, vendas e ticket no período; primeira e última compra' })
  clientes(@Query() q: PeriodoQuery) { return this.relatorios.clientes(q.de, q.ate); }
}
