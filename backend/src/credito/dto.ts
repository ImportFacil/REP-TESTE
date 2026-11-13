import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class SalvarCadastroDto {
  @ApiPropertyOptional({ description: 'Faturamento mensal médio, em centavos' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) faturamento_mensal_centavos?: number;
  @ApiPropertyOptional({ description: 'Compras mensais previstas na Export Fácil, em centavos' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) compras_mensais_previstas_centavos?: number;
  @ApiPropertyOptional({ description: 'Limite de crédito desejado, em centavos' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) limite_solicitado_centavos?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(200) anos_cnpj?: number;
  @ApiPropertyOptional({ description: 'Campos próprios do tipo de cliente (nº de cooperados, CNES, etc.)' }) @IsOptional() @IsObject() dados?: Record<string, unknown>;
}

export class DecisaoCreditoDto {
  @ApiProperty({ enum: ['aprovar', 'pedir_documentos', 'reprovar'] }) @IsIn(['aprovar', 'pedir_documentos', 'reprovar']) acao!: 'aprovar' | 'pedir_documentos' | 'reprovar';
  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] }) @IsOptional() @IsIn(['A', 'B', 'C']) faixa?: 'A' | 'B' | 'C';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) limite_centavos?: number;
  @ApiProperty() @IsString() @Length(3, 2000) parecer!: string;
}

export class ContaEOrdemDto {
  @ApiProperty() @IsBoolean() liberar!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
  @ApiPropertyOptional({ description: 'Só o administrador: liberar mesmo sem atender à regra de cliente grande' }) @IsOptional() @IsBoolean() forcar?: boolean;
}
