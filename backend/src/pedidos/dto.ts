import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ItemCotacaoDto } from '../catalogo/dto';
import { Paginacao } from '../comum/paginacao';
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
}

export class FiltroPedidos extends Paginacao {
  @ApiPropertyOptional() @IsOptional() @IsString() situacao?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() situacao_pagamento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() empresa_id?: string;
}

export class CancelarDto {
  @ApiProperty() @IsString() @Length(3, 500) motivo!: string;
}
