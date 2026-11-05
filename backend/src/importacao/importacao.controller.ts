import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { CancelarDto } from '../pedidos/dto';
import { AvancarOrdemDto, GastoDto, NovoOrcamentoDto, NumerarioDto, PropostaDto } from './dto';
import { ImportacaoService } from './importacao.service';

@ApiTags('Cliente · Orçamentos e ordens')
@ApiBearerAuth()
@SoCliente()
@Controller()
export class ImportacaoClienteController {
  constructor(private readonly imp: ImportacaoService) {}

  @Post('orcamentos')
  @ApiOperation({ summary: 'Pedir orçamento (encomenda, ou conta e ordem se liberada)' })
  solicitar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: NovoOrcamentoDto) {
    return this.imp.solicitar(u, dto);
  }

  @Get('orcamentos')
  orcamentos(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.imp.listarOrcamentos({ empresaId: u.empresaId! });
  }

  @Get('orcamentos/:id')
  orcamento(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.imp.orcamento(id, u.empresaId!);
  }

  @Post('orcamentos/:id/aceitar')
  @HttpCode(200)
  @SoCliente('aprovador')
  aceitar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) {
    return this.imp.decidir(id, true, u, ip);
  }

  @Post('orcamentos/:id/recusar')
  @HttpCode(200)
  @SoCliente('aprovador')
  recusar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Ip() ip: string) {
    return this.imp.decidir(id, false, u, ip);
  }

  @Get('ordens')
  ordens(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.imp.listarOrdens({ empresaId: u.empresaId! });
  }

  @Get('ordens/:id')
  ordem(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.imp.ordem(id, u.empresaId!);
  }

  @Post('numerarios/:id/novo-pix')
  @HttpCode(200)
  novoPix(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.imp.novoPixNumerario(id, u.empresaId!);
  }
}

@ApiTags('Equipe · Orçamentos e ordens')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe')
export class ImportacaoEquipeController {
  constructor(private readonly imp: ImportacaoService) {}

  @Get('orcamentos')
  orcamentos(@Query('situacao') situacao?: string) {
    return this.imp.listarOrcamentos({ situacao });
  }

  @Get('orcamentos/:id')
  orcamento(@Param('id', ParseIntPipe) id: number) {
    return this.imp.orcamento(id);
  }

  @Put('orcamentos/:id/proposta')
  @SoEquipe('comercial', 'administrador')
  responder(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: PropostaDto, @Ip() ip: string) {
    return this.imp.responder(id, dto, u, ip);
  }

  @Get('ordens')
  ordens(@Query('abertas') abertas?: string) {
    return this.imp.listarOrdens({ abertas: abertas === 'true' });
  }

  @Get('ordens/:id')
  ordem(@Param('id', ParseIntPipe) id: number) {
    return this.imp.ordem(id);
  }

  @Post('ordens/:id/avancar')
  @HttpCode(200)
  @SoEquipe('comercial', 'administrador')
  avancar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: AvancarOrdemDto, @Ip() ip: string) {
    return this.imp.avancar(id, dto.observacao, u, ip);
  }

  @Post('ordens/:id/cancelar')
  @HttpCode(200)
  @SoEquipe('comercial', 'administrador')
  cancelar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelarDto, @Ip() ip: string) {
    return this.imp.cancelarOrdem(id, dto.motivo, u, ip);
  }

  @Post('ordens/:id/numerarios')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Cobrar o numerário de uma etapa (câmbio, tributos ou despesas finais) por Pix' })
  numerario(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: NumerarioDto, @Ip() ip: string) {
    return this.imp.cobrarNumerario(id, dto.etapa, dto.valor_centavos, u, ip);
  }

  @Post('numerarios/:id/novo-pix')
  @HttpCode(200)
  @SoEquipe('financeiro', 'administrador')
  novoPix(@Param('id', ParseIntPipe) id: number) {
    return this.imp.novoPixNumerario(id);
  }

  @Post('ordens/:id/gastos')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Registrar gasto real (entra na prestação de contas)' })
  gasto(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: GastoDto, @Ip() ip: string) {
    return this.imp.registrarGasto(id, dto, u, ip);
  }
}
