import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { ItemCotacaoDto } from '../catalogo/dto';
import { B2bService } from './b2b.service';

const FORMAS = ['pix', 'boleto', 'cartao'] as const;

class RequisicaoDto {
  @ApiProperty({ type: [ItemCotacaoDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemCotacaoDto) itens!: ItemCotacaoDto[];
  @ApiProperty({ enum: FORMAS, description: 'Forma sugerida; o aprovador pode trocar' }) @IsIn(FORMAS) forma_pagamento!: (typeof FORMAS)[number];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) parcelas?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) cupom?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) endereco_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) ordem_compra?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) observacao?: string;
}
class FechamentoDto {
  @ApiPropertyOptional({ enum: FORMAS }) @IsOptional() @IsIn(FORMAS) forma_pagamento?: (typeof FORMAS)[number];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) parcelas?: number;
  @ApiPropertyOptional({ description: 'Token do cartão gerado pelo formulário do gateway' }) @IsOptional() @IsString() @MaxLength(200) token_cartao?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) endereco_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) ordem_compra?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) observacao?: string;
}
class AceiteDto extends FechamentoDto {
  @ApiProperty({ enum: FORMAS }) @IsIn(FORMAS) declare forma_pagamento: (typeof FORMAS)[number];
}
class MotivoDto {
  @ApiProperty() @IsString() @Length(3, 500) motivo!: string;
}
class NovaCotacaoDto {
  @ApiProperty({ type: [ItemCotacaoDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemCotacaoDto) itens!: ItemCotacaoDto[];
  @ApiPropertyOptional({ description: 'Volume previsto, prazo, recorrência…' }) @IsOptional() @IsString() @MaxLength(2000) mensagem?: string;
}
class PrecoPropostoDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) produto_id!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) preco_proposto_centavos!: number;
}
class RespostaDto {
  @ApiProperty({ type: [PrecoPropostoDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PrecoPropostoDto) itens!: PrecoPropostoDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) resposta?: string;
  @ApiProperty({ example: 15 }) @Type(() => Number) @IsInt() @Min(1) @Max(90) validade_dias!: number;
}

@ApiTags('Loja · Aprovações e cotações (B2B)')
@ApiBearerAuth()
@SoCliente()
@Controller('empresa')
export class B2bClienteController {
  constructor(private readonly b2b: B2bService) {}

  @Get('requisicoes')
  @ApiOperation({ summary: 'Compras que esperam (ou esperaram) o aprovador: o aprovador vê todas; o comprador, as dele' })
  requisicoes(@UsuarioAtual() u: UsuarioAutenticado) { return this.b2b.requisicoes(u); }

  @Post('requisicoes')
  @SoCliente('comprador')
  @ApiOperation({ summary: 'Mandar a compra para o aprovador (acima do limite do comprador)' })
  criarRequisicao(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: RequisicaoDto, @Ip() ip: string) { return this.b2b.criarRequisicao(u, d, ip); }

  @Get('requisicoes/:id')
  requisicao(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) { return this.b2b.requisicao(u, id); }

  @Post('requisicoes/:id/aprovar')
  @HttpCode(200)
  @SoCliente('aprovador')
  @ApiOperation({ summary: 'Aprovar: o pedido é fechado em nome de quem pediu, com os preços de agora' })
  aprovar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: FechamentoDto, @Ip() ip: string) { return this.b2b.aprovarRequisicao(u, id, d, ip); }

  @Post('requisicoes/:id/recusar')
  @HttpCode(200)
  @SoCliente('aprovador')
  recusar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: MotivoDto, @Ip() ip: string) { return this.b2b.recusarRequisicao(u, id, d.motivo, ip); }

  @Post('requisicoes/:id/cancelar')
  @HttpCode(200)
  @SoCliente('comprador')
  cancelarRequisicao(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) { return this.b2b.cancelarRequisicao(u, id, ip); }

  @Get('cotacoes')
  @ApiOperation({ summary: 'Cotações de preço negociado da empresa' })
  cotacoes(@UsuarioAtual() u: UsuarioAutenticado) { return this.b2b.cotacoes(u.empresaId!); }

  @Post('cotacoes')
  @ApiOperation({ summary: 'Pedir cotação: preço negociado para produtos do catálogo, em volume' })
  criarCotacao(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: NovaCotacaoDto, @Ip() ip: string) { return this.b2b.criarCotacao(u, d, ip); }

  @Get('cotacoes/:id')
  cotacao(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) { return this.b2b.cotacao(id, u.empresaId!); }

  @Post('cotacoes/:id/aceitar')
  @HttpCode(200)
  @SoCliente('aprovador')
  @ApiOperation({ summary: 'Aceitar a cotação: o pedido sai com o preço negociado' })
  aceitar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AceiteDto, @Ip() ip: string) { return this.b2b.aceitarCotacao(u, id, d, ip); }

  @Post('cotacoes/:id/recusar')
  @HttpCode(200)
  @SoCliente('aprovador')
  recusarCotacao(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) { return this.b2b.recusarCotacao(u, id, ip); }

  @Post('cotacoes/:id/cancelar')
  @HttpCode(200)
  cancelarCotacao(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) { return this.b2b.cancelarCotacao(u, id, ip); }
}

@ApiTags('Equipe · Cotações (B2B)')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/cotacoes')
export class B2bEquipeController {
  constructor(private readonly b2b: B2bService) {}

  @Get()
  @ApiOperation({ summary: 'Cotações de preço negociado de todas as empresas (as que esperam resposta primeiro)' })
  cotacoes() { return this.b2b.cotacoes(); }

  @Get(':id')
  cotacao(@Param('id', ParseIntPipe) id: number) { return this.b2b.cotacao(id); }

  @Put(':id/resposta')
  @SoEquipe('comercial', 'administrador')
  @ApiOperation({ summary: 'Responder com o preço de cada item e a validade' })
  responder(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: RespostaDto, @Ip() ip: string) { return this.b2b.responderCotacao(id, d, u, ip); }
}
