import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ItemOrcamentoDto {
  @ApiPropertyOptional({ description: 'Produto do catálogo (ou deixe vazio e descreva o item)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) produto_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) descricao?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) unidade?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) quantidade!: number;
}

export class NovoOrcamentoDto {
  @ApiProperty({ enum: ['encomenda', 'conta_e_ordem'] }) @IsIn(['encomenda', 'conta_e_ordem']) modalidade!: 'encomenda' | 'conta_e_ordem';
  @ApiProperty({ type: [ItemOrcamentoDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ItemOrcamentoDto) itens!: ItemOrcamentoDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) observacao?: string;
}

export class PrecoItemDto {
  @ApiProperty() @Type(() => Number) @IsInt() id!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) preco_unitario_centavos!: number;
}

export class PropostaDto {
  @ApiProperty({ type: [PrecoItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => PrecoItemDto) itens!: PrecoItemDto[];
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) frete_centavos!: number;
  @ApiPropertyOptional({ description: 'Conta e ordem: taxa de serviço em pontos-base sobre a mercadoria' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5000) taxa_servico_bp?: number;
  @ApiProperty() @IsString() @Length(2, 500) condicao!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(720) prazo_entrega_dias!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(90) validade_dias!: number;
}

export class AvancarOrdemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) observacao?: string;
}

export class NumerarioDto {
  @ApiProperty({ enum: ['cambio', 'tributos', 'despesas_finais'] }) @IsIn(['cambio', 'tributos', 'despesas_finais']) etapa!: 'cambio' | 'tributos' | 'despesas_finais';
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) valor_centavos!: number;
}

export class GastoDto extends NumerarioDto {
  @ApiProperty() @IsString() @Length(2, 300) descricao!: string;
}

export class RotaOrdemDto {
  @ApiProperty({ example: 'CNSHA', description: 'Porto de embarque (UN/LOCODE)' }) @IsString() @Matches(/^[A-Za-z]{2}[A-Za-z0-9]{3}$/) porto_embarque!: string;
  @ApiProperty({ example: 'BRSSZ', description: 'Porto de chegada (UN/LOCODE)' }) @IsString() @Matches(/^[A-Za-z]{2}[A-Za-z0-9]{3}$/) porto_chegada!: string;
  @ApiPropertyOptional({ example: '2026-11-20', description: 'Data de embarque (prevista ou realizada)' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) embarque_em?: string | null;
}
