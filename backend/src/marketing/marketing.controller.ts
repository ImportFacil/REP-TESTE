import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Publico, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { MarketingService } from './marketing.service';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

class PromocaoDto {
  @ApiProperty() @IsString() @Length(3, 120) nome!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) descricao?: string;
  @ApiPropertyOptional({ description: 'Sem cupom = aplicada sozinha no carrinho' }) @IsOptional() @IsString() @MaxLength(30) cupom?: string;
  @ApiProperty({ enum: ['percentual', 'valor_fixo'] }) @IsIn(['percentual', 'valor_fixo']) tipo_desconto!: 'percentual' | 'valor_fixo';
  @ApiPropertyOptional({ description: 'Pontos-base (500 = 5%)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9000) desconto_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) desconto_centavos?: number;
  @ApiPropertyOptional({ description: 'Vazio = todos os tipos' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tipos_cliente?: string[];
  @ApiPropertyOptional({ description: 'Vazio = todos os produtos' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categorias?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) subtotal_minimo_centavos?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(DATA) inicio?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATA) fim?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limite_usos?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limite_por_empresa?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class AlterarPromocaoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 120) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) descricao?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) cupom?: string;
  @ApiPropertyOptional({ enum: ['percentual', 'valor_fixo'] }) @IsOptional() @IsIn(['percentual', 'valor_fixo']) tipo_desconto?: 'percentual' | 'valor_fixo';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9000) desconto_bp?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) desconto_centavos?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tipos_cliente?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categorias?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) subtotal_minimo_centavos?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(DATA) inicio?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(DATA) fim?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limite_usos?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limite_por_empresa?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class InscricaoDto {
  @ApiProperty() @IsEmail() @MaxLength(200) email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) nome?: string;
}
class SairDto {
  @ApiProperty() @IsUUID() token!: string;
}
class AtivoDto {
  @ApiProperty() @IsBoolean() ativo!: boolean;
}
class ModeloDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 200) assunto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 10_000) corpo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}

const QUEM_EDITA = ['comercial', 'administrador'] as const;

@ApiTags('Equipe · Marketing')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/marketing')
export class MarketingController {
  constructor(private readonly mk: MarketingService) {}

  @Get('promocoes')
  @ApiOperation({ summary: 'Promoções e cupons, com usos e total descontado' })
  promocoes() { return this.mk.listarPromocoes(); }

  @Post('promocoes')
  @SoEquipe(...QUEM_EDITA)
  criarPromocao(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: PromocaoDto, @Ip() ip: string) { return this.mk.criarPromocao(d, u, ip); }

  @Patch('promocoes/:id')
  @SoEquipe(...QUEM_EDITA)
  alterarPromocao(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarPromocaoDto, @Ip() ip: string) {
    return this.mk.alterarPromocao(id, d, u, ip);
  }

  @Get('newsletter')
  @ApiOperation({ summary: 'Inscritos na newsletter' })
  newsletter() { return this.mk.listarInscritos(); }

  @Post('newsletter')
  @SoEquipe(...QUEM_EDITA)
  inscrever(@Body() d: InscricaoDto) { return this.mk.inscrever({ ...d, origem: 'painel' }); }

  @Patch('newsletter/:id')
  @SoEquipe(...QUEM_EDITA)
  alterarInscrito(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AtivoDto, @Ip() ip: string) {
    return this.mk.alterarInscrito(id, d.ativo, u, ip);
  }

  @Get('modelos')
  @ApiOperation({ summary: 'Modelos dos e-mails que o sistema manda' })
  modelos() { return this.mk.listarModelos(); }

  @Patch('modelos/:codigo')
  @SoEquipe(...QUEM_EDITA)
  alterarModelo(@UsuarioAtual() u: UsuarioAutenticado, @Param('codigo') codigo: string, @Body() d: ModeloDto, @Ip() ip: string) {
    return this.mk.alterarModelo(codigo, d, u, ip);
  }

  @Post('modelos/:codigo/previa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Prévia do modelo com dados de exemplo (aceita texto ainda não salvo)' })
  previa(@Param('codigo') codigo: string, @Body() d: ModeloDto) { return this.mk.previa(codigo, d); }

  @Get('caixa-de-saida')
  @ApiOperation({ summary: 'Avisos registrados (cobrança, envios, newsletter), com o assunto montado' })
  caixa() { return this.mk.caixaDeSaida(); }
}

@ApiTags('Loja · Newsletter')
@Publico()
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly mk: MarketingService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inscrever um e-mail na newsletter (aberto, sem login)' })
  inscrever(@Body() d: InscricaoDto) { return this.mk.inscrever({ ...d, origem: 'loja' }); }

  @Post('sair')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sair da lista pelo link do e-mail' })
  sair(@Body() d: SairDto) { return this.mk.cancelarInscricao(d.token); }
}
