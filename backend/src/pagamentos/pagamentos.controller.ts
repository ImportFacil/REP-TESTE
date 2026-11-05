import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Ip, NotFoundException, Param, ParseIntPipe, Post, Put, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Publico, SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import { AlterarPoliticaDto } from './dto';
import { GATEWAY, type GatewayPagamento } from './gateway';
import { GatewaySimulador } from './gateway-simulador';
import { PagamentosService } from './pagamentos.service';
import { PoliticaService } from './politica.service';
import { WebhookService } from './webhook.service';

@ApiTags('Pagamentos')
@Controller()
export class PagamentosController {
  constructor(
    private readonly pagamentos: PagamentosService,
    private readonly politica: PoliticaService,
    private readonly webhooks: WebhookService,
    @Inject(GATEWAY) private readonly gateway: GatewayPagamento | null,
    @Inject(BANCO) private readonly db: Banco,
  ) {}

  /** Aviso do gateway (público; a assinatura é conferida). */
  @Publico()
  @SkipThrottle()
  @Post('pagamentos/webhook/:origem')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Param('origem') origem: string, @Req() req: RawBodyRequest<Request>) {
    return this.webhooks.receber(origem, req.rawBody ?? Buffer.from(''), req.headers);
  }

  @ApiBearerAuth()
  @SoCliente()
  @Get('financeiro')
  @ApiOperation({ summary: 'Parcelas da empresa, limite de crédito e bloqueios' })
  financeiro(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.pagamentos.financeiroCliente(u.empresaId!);
  }

  @ApiBearerAuth()
  @Get('pagamentos/condicoes')
  @ApiOperation({ summary: 'Condições de pagamento vigentes' })
  async condicoes() {
    return { ...(await this.politica.atual()), gateway: this.pagamentos.nomeGateway };
  }

  @ApiBearerAuth()
  @SoEquipe('financeiro', 'administrador')
  @Get('equipe/recebiveis')
  recebiveis() {
    return this.pagamentos.recebiveis();
  }

  @ApiBearerAuth()
  @SoEquipe('administrador')
  @Put('equipe/politica-pagamento')
  @ApiOperation({ summary: 'Muda as condições de pagamento (só o administrador)' })
  alterarPolitica(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: AlterarPoliticaDto, @Ip() ip: string) {
    return this.politica.alterar(dto, u, ip);
  }

  /** Só com o gateway simulado: envia um aviso de pagamento assinado, como o banco faria. */
  @ApiBearerAuth()
  @SoEquipe()
  @Post('equipe/simulador/parcelas/:id/confirmar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Simular a confirmação do banco (dev e homologação)' })
  async simular(@Param('id', ParseIntPipe) id: number) {
    if (!(this.gateway instanceof GatewaySimulador)) throw new ForbiddenException('Disponível só com o gateway simulado.');
    const p = await this.db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .select(['pa.id_gateway', 'pa.valor_centavos', 'pa.situacao', 'c.meio']).where('pa.id', '=', id).executeTakeFirst();
    if (!p?.id_gateway) throw new NotFoundException('Parcela não encontrada.');
    const { corpo, assinatura } = this.gateway.eventoPagamento(p.id_gateway, p.valor_centavos, p.meio);
    return this.webhooks.receber(this.gateway.nome, Buffer.from(corpo), { 'x-assinatura': assinatura });
  }
}
