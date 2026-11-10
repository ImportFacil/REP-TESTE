import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { ConfiguracoesService } from './configuracoes.service';

class RegraDto {
  @ApiProperty() @IsString() @Length(3, 120) nome!: string;
  @ApiPropertyOptional({ description: 'Início do NCM (2 a 8 dígitos); vazio = todos' }) @IsOptional() @IsString() @Matches(/^[0-9.]{0,10}$/) ncm_prefixo?: string | null;
  @ApiPropertyOptional({ description: 'UF de destino; vazio = todas' }) @IsOptional() @IsString() @Matches(/^([A-Za-z]{2})?$/) uf?: string | null;
  @ApiPropertyOptional({ enum: ['nacional', 'importado'] }) @IsOptional() @IsIn(['nacional', 'importado', null]) origem?: 'nacional' | 'importado' | null;
  @ApiProperty({ description: 'Pontos-base (1345 = 13,45%)' }) @Type(() => Number) @IsInt() @Min(0) @Max(10000) aliquota_federal_bp!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10000) aliquota_estadual_bp!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class AlterarRegraDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 120) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[0-9.]{0,10}$/) ncm_prefixo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^([A-Za-z]{2})?$/) uf?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsIn(['nacional', 'importado', null]) origem?: 'nacional' | 'importado' | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) aliquota_federal_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) aliquota_estadual_bp?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class LocalDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{2,30}$/) codigo!: string;
  @ApiProperty() @IsString() @Length(2, 80) nome!: string;
  @ApiProperty() @IsString() @Length(2, 80) cidade!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z]{2}$/) uf!: string;
  @ApiPropertyOptional({ description: 'Menor = sai primeiro e recebe as entradas' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) prioridade?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class AlterarLocalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) cidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) uf?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) prioridade?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class QuantidadeLocalDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) local_id!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) quantidade!: number;
}
class EstoqueDto {
  @ApiProperty({ type: [QuantidadeLocalDto] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => QuantidadeLocalDto) locais!: QuantidadeLocalDto[];
}
class CambioDto {
  @ApiProperty({ enum: ['USD', 'EUR', 'CNY'] }) @IsIn(['USD', 'EUR', 'CNY']) moeda!: 'USD' | 'EUR' | 'CNY';
  @ApiProperty({ example: '2026-11-10' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) data!: string;
  @ApiProperty({ example: 5.4321 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) taxa!: number;
  @ApiPropertyOptional({ example: 'PTAX venda (Banco Central)' }) @IsOptional() @IsString() @MaxLength(80) fonte?: string;
}
class PlanilhaDto {
  @ApiProperty({ description: 'Conteúdo do CSV (separador ";" ou ",")' }) @IsString() @Length(1, 5_000_000) conteudo!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) arquivo?: string;
}

const EDITA = ['comercial', 'administrador'] as const;

@ApiTags('Equipe · Configurações')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/configuracoes')
export class ConfiguracoesController {
  constructor(private readonly cfg: ConfiguracoesService) {}

  @Get('permissoes')
  @SoEquipe('administrador')
  @ApiOperation({ summary: 'Quem pode o quê: lido das próprias rotas da API' })
  permissoes() { return this.cfg.permissoes(); }

  @Get('impostos')
  @ApiOperation({ summary: 'Regras do valor aproximado dos tributos (Lei 12.741)' })
  impostos() { return this.cfg.listarRegras(); }

  @Post('impostos')
  @SoEquipe('financeiro', 'administrador')
  criarRegra(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: RegraDto, @Ip() ip: string) { return this.cfg.criarRegra(d, u, ip); }

  @Patch('impostos/:id')
  @SoEquipe('financeiro', 'administrador')
  alterarRegra(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarRegraDto, @Ip() ip: string) { return this.cfg.alterarRegra(id, d, u, ip); }

  @Get('locais')
  @ApiOperation({ summary: 'Locais de estoque, com unidades e produtos em cada um' })
  locais() { return this.cfg.listarLocais(); }

  @Post('locais')
  @SoEquipe(...EDITA)
  criarLocal(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: LocalDto, @Ip() ip: string) { return this.cfg.criarLocal(d, u, ip); }

  @Patch('locais/:id')
  @SoEquipe(...EDITA)
  alterarLocal(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarLocalDto, @Ip() ip: string) { return this.cfg.alterarLocal(id, d, u, ip); }

  @Get('estoque/:produtoId')
  @ApiOperation({ summary: 'Estoque do produto em cada local' })
  estoque(@Param('produtoId', ParseIntPipe) id: number) { return this.cfg.estoqueDoProduto(id); }

  @Put('estoque/:produtoId')
  @SoEquipe(...EDITA)
  @ApiOperation({ summary: 'Quantidade em cada local; o estoque do produto vira a soma' })
  definirEstoque(@UsuarioAtual() u: UsuarioAutenticado, @Param('produtoId', ParseIntPipe) id: number, @Body() d: EstoqueDto, @Ip() ip: string) {
    return this.cfg.definirEstoque(id, d.locais, u, ip);
  }

  @Get('cambio')
  @ApiOperation({ summary: 'Histórico das cotações de câmbio' })
  cambio() { return this.cfg.listarCambio(); }

  @Get('cambio/atual')
  @ApiOperation({ summary: 'Cotação mais recente de cada moeda' })
  cambioAtual() { return this.cfg.cambioAtual(); }

  @Post('cambio')
  @SoEquipe('financeiro', 'administrador')
  registrarCambio(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: CambioDto, @Ip() ip: string) { return this.cfg.registrarCambio(d, u, ip); }

  @Post('importar/previa')
  @HttpCode(200)
  @SoEquipe(...EDITA)
  @ApiOperation({ summary: 'Lê a planilha de produtos e mostra o que vai mudar, sem gravar' })
  previa(@Body() d: PlanilhaDto) { return this.cfg.previa(d.conteudo); }

  @Post('importar')
  @HttpCode(200)
  @SoEquipe(...EDITA)
  @ApiOperation({ summary: 'Grava as linhas válidas da planilha (as com erro ficam no histórico)' })
  importar(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: PlanilhaDto, @Ip() ip: string) { return this.cfg.aplicar(d.conteudo, d.arquivo || 'planilha.csv', u, ip); }

  @Get('importacoes')
  importacoes() { return this.cfg.historicoImportacoes(); }
}
