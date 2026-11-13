import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateNested,
  registerDecorator, type ValidationOptions,
} from 'class-validator';
import { cnpjValido, normalizarCnpj } from '../comum/cnpj';
import { Ordenacao } from '../comum/paginacao';
import { PAPEIS_CLIENTE, PAPEIS_EQUIPE, type PapelCliente, type PapelEquipe, type SituacaoEmpresa } from '../banco/tipos';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emailMinusculo = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

function IsCnpj(opcoes?: ValidationOptions) {
  return (obj: object, prop: string) =>
    registerDecorator({
      name: 'isCnpj', target: obj.constructor, propertyName: prop, options: { message: 'CNPJ inválido.', ...opcoes },
      validator: { validate: (v: unknown) => typeof v === 'string' && cnpjValido(v) },
    });
}

export class EnderecoDto {
  @ApiProperty({ example: '78890000' }) @Transform(({ value }) => String(value ?? '').replace(/\D/g, '')) @Matches(/^\d{8}$/, { message: 'CEP deve ter 8 dígitos.' }) cep!: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 200) logradouro!: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 20) numero!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(100) complemento?: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 100) bairro!: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(1, 100) cidade!: string;
  @ApiProperty({ example: 'MT' }) @Transform(({ value }) => String(value ?? '').toUpperCase()) @Matches(/^[A-Z]{2}$/) uf!: string;
}

export class CriarEmpresaDto {
  @ApiProperty({ example: '11.222.333/0001-81', description: 'Aceita CNPJ numérico ou alfanumérico, com ou sem pontuação.' })
  @IsCnpj() cnpj!: string;
  @ApiProperty() @Transform(aparar) @IsString() @Length(2, 200) razao_social!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(200) nome_fantasia?: string;
  @ApiProperty({ example: 'cooperativa' }) @IsString() tipo_cliente!: string;
  @ApiPropertyOptional({ type: EnderecoDto }) @IsOptional() @ValidateNested() @Type(() => EnderecoDto) endereco?: EnderecoDto;
}

const SITUACOES: SituacaoEmpresa[] = ['ativa', 'bloqueada', 'inativa'];

export class AlterarEmpresaDto {
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @Length(2, 200) razao_social?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(aparar) @IsString() @MaxLength(200) nome_fantasia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tipo_cliente?: string;
  @ApiPropertyOptional({ enum: SITUACOES }) @IsOptional() @IsIn(SITUACOES) situacao?: SituacaoEmpresa;
  @ApiPropertyOptional({ type: EnderecoDto }) @IsOptional() @ValidateNested() @Type(() => EnderecoDto) endereco?: EnderecoDto;
}

export class FiltroEmpresas extends Ordenacao {
  @ApiPropertyOptional({ description: 'Parte da razão social, do nome fantasia ou do CNPJ' }) @IsOptional() @IsString() @MaxLength(100) busca?: string;
  @ApiPropertyOptional({ description: `Uma ou mais, separadas por vírgula: ${SITUACOES.join(', ')}` })
  @IsOptional() @Matches(new RegExp(`^(${SITUACOES.join('|')})(,(${SITUACOES.join('|')}))*$`)) situacao?: string;
  @ApiPropertyOptional({ description: 'Um ou mais tipos de cliente, separados por vírgula' }) @IsOptional() @IsString() @MaxLength(200) tipo_cliente?: string;
  @ApiPropertyOptional({ description: 'true, false ou true,false' }) @IsOptional() @Matches(/^(true|false)(,(true|false))?$/) conta_e_ordem_liberada?: string;
  @ApiPropertyOptional({ enum: ['razao_social', 'tipo_cliente', 'criado_em'] }) @IsOptional() @IsIn(['razao_social', 'tipo_cliente', 'criado_em']) ordenar?: 'razao_social' | 'tipo_cliente' | 'criado_em';
}

export class NovoUsuarioClienteDto {
  @ApiProperty() @Transform(aparar) @IsString() @Length(2, 120) nome!: string;
  @ApiProperty() @Transform(emailMinusculo) @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ enum: PAPEIS_CLIENTE }) @IsIn(PAPEIS_CLIENTE) papel!: PapelCliente;
}

export class NovoUsuarioEquipeDto {
  @ApiProperty() @Transform(aparar) @IsString() @Length(2, 120) nome!: string;
  @ApiProperty() @Transform(emailMinusculo) @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ enum: PAPEIS_EQUIPE }) @IsIn(PAPEIS_EQUIPE) papel!: PapelEquipe;
}

export class AlterarUsuarioClienteDto {
  @ApiPropertyOptional({ enum: PAPEIS_CLIENTE }) @IsOptional() @IsIn(PAPEIS_CLIENTE) papel?: PapelCliente;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Valor máximo por pedido sem aprovação (compradores); null = sem limite' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) limite_pedido_centavos?: number | null;
}

export class AlterarUsuarioEquipeDto {
  @ApiPropertyOptional({ enum: PAPEIS_EQUIPE }) @IsOptional() @IsIn(PAPEIS_EQUIPE) papel?: PapelEquipe;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}

export { normalizarCnpj };
