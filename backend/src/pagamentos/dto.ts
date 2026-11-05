import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Campos editáveis das condições de pagamento (cada alteração gera uma nova versão). */
export class AlterarPoliticaDto {
  @ApiPropertyOptional({ description: 'Desconto do Pix em pontos-base (300 = 3%)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2000) pix_desconto_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168) pix_validade_horas?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) boleto_max_parcelas?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) cartao_max_parcelas?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) cartao_sem_juros_ate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) cartao_juros_am_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(200) multa_atraso_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) juros_atraso_am_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) atraso_bloqueio_dias?: number;
  @ApiPropertyOptional({ description: 'Pedidos mensais (centavos) a partir dos quais a empresa é "cliente grande"' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cliente_grande_mensal_centavos?: number;
}
