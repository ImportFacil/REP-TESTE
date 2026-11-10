import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested, IsObject } from 'class-validator';
import { Paginacao } from '../comum/paginacao';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const paraBooleano = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class FiltroProdutos extends Paginacao {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) categoria?: string;
  @ApiPropertyOptional({ description: 'Nome, marca ou código' }) @IsOptional() @IsString() @MaxLength(100) busca?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(paraBooleano) @IsBoolean() destaque?: boolean;
  @ApiPropertyOptional({ description: 'Só para a equipe: ver os preços de um tipo de cliente' }) @IsOptional() @IsString() tipo_cliente?: string;
  @ApiPropertyOptional({ description: 'Só para a equipe: incluir produtos inativos' }) @IsOptional() @Transform(paraBooleano) @IsBoolean() incluir_inativos?: boolean;
}

export class ItemCotacaoDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) produto_id!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) quantidade!: number;
}

export class CotacaoDto {
  @ApiProperty({ type: [ItemCotacaoDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemCotacaoDto) itens!: ItemCotacaoDto[];
  @ApiPropertyOptional({ description: 'Só para a equipe: cotar para um tipo de cliente' }) @IsOptional() @IsString() tipo_cliente?: string;
}

export class EspecificacaoDto {
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 80) nome!: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 200) valor!: string;
}

export class ProdutoDto {
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 40) codigo!: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(2, 200) nome!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(100) marca?: string;
  @ApiProperty() @IsString() categoria_id!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(100) subcategoria?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) descricao?: string;
  @ApiPropertyOptional({ example: '84248221' }) @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value)) @Matches(/^\d{8}$/, { message: 'NCM deve ter 8 dígitos.' }) ncm?: string;
  @ApiProperty({ example: 'un' }) @Transform(aparar) @IsString() @Length(1, 30) unidade!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) multiplo_venda!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) estoque!: number;
  @ApiProperty({ description: 'Preço de tabela em centavos' }) @Type(() => Number) @IsInt() @Min(1) preco_tabela_centavos!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sob_orcamento?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() destaque?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importado?: boolean;
  @ApiPropertyOptional({ type: [EspecificacaoDto] }) @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => EspecificacaoDto) especificacoes?: EspecificacaoDto[];
  @ApiPropertyOptional({ description: 'Família de atributos' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) familia_id?: number;
  @ApiPropertyOptional({ description: 'Valores dos atributos da família: { codigo: valor }' }) @IsOptional() @IsObject() atributos?: Record<string, string>;
}

export class AlterarProdutoDto {
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @Length(2, 200) nome?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(100) marca?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoria_id?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(100) subcategoria?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) descricao?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value)) @Matches(/^\d{8}$/, { message: 'NCM deve ter 8 dígitos.' }) ncm?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @Length(1, 30) unidade?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) multiplo_venda?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) estoque?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) preco_tabela_centavos?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sob_orcamento?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() destaque?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
  @ApiPropertyOptional({ type: [EspecificacaoDto] }) @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => EspecificacaoDto) especificacoes?: EspecificacaoDto[];
  @ApiPropertyOptional({ description: 'Família de atributos' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) familia_id?: number;
  @ApiPropertyOptional({ description: 'Valores dos atributos da família: { codigo: valor }' }) @IsOptional() @IsObject() atributos?: Record<string, string>;
}

export class AlterarTabelaPrecoDto {
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @Length(2, 60) nome?: string;
  @ApiPropertyOptional({ description: 'Desconto em pontos-base (1800 = 18%)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9000) desconto_bp?: number;
  @ApiPropertyOptional({ description: 'Pedido mínimo em centavos' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) pedido_minimo_centavos?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
