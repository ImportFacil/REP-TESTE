import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ItemCotacaoDto } from '../catalogo/dto';
import { Ordenacao } from '../comum/paginacao';
import { EnderecoDto } from '../contas/dto';

export class NovoPedidoDto {
  @ApiProperty({ type: [ItemCotacaoDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemCotacaoDto) itens!: ItemCotacaoDto[];
  @ApiProperty({ enum: ['pix', 'boleto', 'cartao'] }) @IsIn(['pix', 'boleto', 'cartao']) forma_pagamento!: 'pix' | 'boleto' | 'cartao';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) parcelas?: number;
  @ApiPropertyOptional({ description: 'Token do cartão gerado pelo formulário do gateway (no simulador: qualquer texto; "tok_recusado" é negado)' })
  @IsOptional() @IsString() @MaxLength(200) token_cartao?: string;
  @ApiPropertyOptional({ type: EnderecoDto }) @IsOptional() @ValidateNested() @Type(() => EnderecoDto) endereco_entrega?: EnderecoDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) observacao?: string;
  @ApiPropertyOptional({ description: 'Cupom de promoção' }) @IsOptional() @IsString() @MaxLength(30) cupom?: string;
  @ApiPropertyOptional({ description: 'Endereço de entrega cadastrado da empresa (sem ele, vale o padrão)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) endereco_id?: number;
  @ApiPropertyOptional({ description: 'Número da ordem de compra da sua empresa' }) @IsOptional() @IsString() @MaxLength(60) ordem_compra?: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export class FiltroPedidos extends Ordenacao {
  @ApiPropertyOptional() @IsOptional() @IsString() situacao?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() situacao_pagamento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() empresa_id?: string;
  @ApiPropertyOptional({ description: 'Só pedidos das últimas N horas (24, 48, 72, 168…)', example: 24 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9600) horas?: number;
  @ApiPropertyOptional({ description: 'Período: data inicial (fuso de Brasília)', example: '2026-11-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @ApiPropertyOptional({ description: 'Período: data final', example: '2026-11-12' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
  @ApiPropertyOptional({ description: 'Perfil do cliente: revendedor, distribuidora, construtora, cooperativa, hospital' }) @IsOptional() @IsString() @MaxLength(40) tipo_cliente?: string;
  @ApiPropertyOptional({ description: 'Número do pedido, empresa ou ordem de compra' }) @IsOptional() @IsString() @MaxLength(100) busca?: string;
  @ApiPropertyOptional({ enum: ['recentes', 'antigos', 'maior_valor', 'menor_valor'] }) @IsOptional() @IsIn(['recentes', 'antigos', 'maior_valor', 'menor_valor']) ordem?: 'recentes' | 'antigos' | 'maior_valor' | 'menor_valor';
  @ApiPropertyOptional({ description: 'Uma ou mais formas, separadas por vírgula' }) @IsOptional() @Matches(/^(pix|boleto|cartao)(,(pix|boleto|cartao))*$/) forma_pagamento?: string;
  @ApiPropertyOptional({ description: 'Parte da razão social' }) @IsOptional() @IsString() @MaxLength(100) razao_social?: string;
  @ApiPropertyOptional({ description: 'Parte da ordem de compra' }) @IsOptional() @IsString() @MaxLength(60) ordem_compra?: string;
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(DATA) criado_em_de?: string;
  @ApiPropertyOptional({ example: '2026-11-12' }) @IsOptional() @Matches(DATA) criado_em_ate?: string;
  @ApiPropertyOptional({ description: 'Total mínimo, em reais' }) @IsOptional() @Type(() => Number) @Min(0) total_min?: number;
  @ApiPropertyOptional({ description: 'Total máximo, em reais' }) @IsOptional() @Type(() => Number) @Min(0) total_max?: number;
  @ApiPropertyOptional({ enum: ['id', 'razao_social', 'criado_em', 'total_centavos'], description: 'Coluna para ordenar (com `dir`); tem preferência sobre `ordem`' })
  @IsOptional() @IsIn(['id', 'razao_social', 'criado_em', 'total_centavos']) ordenar?: 'id' | 'razao_social' | 'criado_em' | 'total_centavos';
}

export class CancelarDto {
  @ApiProperty() @IsString() @Length(3, 500) motivo!: string;
}
