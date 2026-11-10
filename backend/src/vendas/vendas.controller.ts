import { Body, Controller, Get, Ip, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, MaxLength, Min, ValidateNested } from 'class-validator';
import { SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { VendasService } from './vendas.service';

class MotivoDto {
  @ApiProperty() @IsString() @Length(3, 500) motivo!: string;
}
class EnvioDto {
  @ApiProperty() @IsString() @Length(2, 120) transportadora!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) codigo_rastreio?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) volumes?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) peso_kg?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) observacao?: string;
}
class ItemDevolvidoDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) produto_id!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) quantidade!: number;
}
class ReembolsoDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) valor_centavos!: number;
  @ApiProperty() @IsString() @Length(3, 500) motivo!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() devolver_estoque?: boolean;
  @ApiPropertyOptional({ type: [ItemDevolvidoDto] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemDevolvidoDto) itens?: ItemDevolvidoDto[];
}

@ApiTags('Equipe · Vendas')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/vendas')
export class VendasController {
  constructor(private readonly vendas: VendasService) {}

  @Get('notas')
  @ApiOperation({ summary: 'Notas fiscais emitidas e canceladas' })
  notas() { return this.vendas.listarNotas(); }

  @Post('pedidos/:id/nota')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Emitir a nota fiscal do pedido (numerada aqui até a integração com o ERP)' })
  emitir(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) { return this.vendas.emitirNota(id, u, ip); }

  @Post('notas/:id/cancelar')
  @SoEquipe('financeiro', 'administrador')
  cancelarNota(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto, @Ip() ip: string) {
    return this.vendas.cancelarNota(id, dto.motivo, u, ip);
  }

  @Get('envios')
  @ApiOperation({ summary: 'Remessas: transportadora, rastreio e entrega' })
  envios() { return this.vendas.listarEnvios(); }

  @Post('pedidos/:id/envio')
  @SoEquipe('comercial', 'administrador')
  @ApiOperation({ summary: 'Registrar o envio (o pedido passa de "em separação" para "enviado")' })
  enviar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EnvioDto, @Ip() ip: string) {
    return this.vendas.registrarEnvio(id, dto, u, ip);
  }

  @Post('envios/:id/entregue')
  @SoEquipe('comercial', 'administrador')
  @ApiOperation({ summary: 'Confirmar a entrega (o pedido passa para "entregue")' })
  entregue(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) { return this.vendas.confirmarEntrega(id, u, ip); }

  @Get('reembolsos')
  reembolsos() { return this.vendas.listarReembolsos(); }

  @Post('pedidos/:id/reembolso')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Reembolso total ou parcial (Pix, estorno no cartão ou abatimento nos boletos em aberto)' })
  reembolsar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: ReembolsoDto, @Ip() ip: string) {
    return this.vendas.registrarReembolso(id, dto, u, ip);
  }

  @Get('transacoes')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Pagamentos recebidos (Pix, boleto, cartão e numerário de importação)' })
  transacoes() { return this.vendas.listarTransacoes(); }

  @Get('pedidos/:id')
  @ApiOperation({ summary: 'Nota, envios e reembolsos de um pedido' })
  doPedido(@Param('id', ParseIntPipe) id: number) { return this.vendas.doPedido(id); }
}
