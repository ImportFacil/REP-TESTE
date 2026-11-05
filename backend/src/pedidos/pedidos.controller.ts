import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { CancelarDto, FiltroPedidos, NovoPedidoDto } from './dto';
import { PedidosService } from './pedidos.service';

class SubtotalQuery {
  @Type(() => Number) @IsInt() @Min(1) subtotal_centavos!: number;
}

@ApiTags('Cliente · Pedidos')
@ApiBearerAuth()
@SoCliente()
@Controller('pedidos')
export class PedidosClienteController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get('condicoes')
  @ApiOperation({ summary: 'Opções de pagamento para o valor do carrinho' })
  condicoes(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: SubtotalQuery) {
    return this.pedidos.condicoes(u, q.subtotal_centavos);
  }

  @Post()
  @ApiOperation({ summary: 'Fechar pedido (preço congelado; Pix, boleto no faturamento ou cartão)' })
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: NovoPedidoDto, @Ip() ip: string) {
    return this.pedidos.criar(u, dto, ip);
  }

  @Get()
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query() f: FiltroPedidos) {
    return this.pedidos.listar({ ...f, empresaId: u.empresaId! });
  }

  @Get(':id')
  detalhe(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.pedidos.detalhe(id, u.empresaId!);
  }

  @Post(':id/novo-pix')
  @HttpCode(200)
  novoPix(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.pedidos.novoPix(id, u);
  }

  @Get(':id/recompra')
  @ApiOperation({ summary: 'Itens do pedido para refazer o carrinho' })
  recompra(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.pedidos.itensParaRecompra(id, u.empresaId!);
  }
}

@ApiTags('Equipe · Pedidos')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/pedidos')
export class PedidosEquipeController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  listar(@Query() f: FiltroPedidos) {
    return this.pedidos.listar({ ...f, empresaId: f.empresa_id });
  }

  @Get(':id')
  detalhe(@Param('id', ParseIntPipe) id: number) {
    return this.pedidos.detalhe(id);
  }

  @Post(':id/avancar')
  @HttpCode(200)
  @SoEquipe('comercial', 'administrador')
  avancar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) {
    return this.pedidos.avancar(id, u, ip);
  }

  @Post(':id/faturar')
  @HttpCode(200)
  @SoEquipe('financeiro', 'administrador')
  faturar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) {
    return this.pedidos.faturar(id, u, ip);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @SoEquipe('comercial', 'financeiro', 'administrador')
  cancelar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelarDto, @Ip() ip: string) {
    return this.pedidos.cancelar(id, dto.motivo, u, ip);
  }
}
