import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { CreditoService, TAMANHO_MAX_ARQUIVO, type ArquivoRecebido } from './credito.service';
import { ContaEOrdemDto, DecisaoCreditoDto, SalvarCadastroDto } from './dto';

const upload = FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAX_ARQUIVO + 1 } });

function baixar(res: Response, nome: string, tipo: string, conteudo: Buffer) {
  res.set({ 'Content-Type': tipo, 'Content-Disposition': `attachment; filename="${encodeURIComponent(nome)}"`, 'Cache-Control': 'private, no-store' });
  return new StreamableFile(conteudo);
}

@ApiTags('Cliente · Crédito')
@ApiBearerAuth()
@SoCliente()
@Controller('credito')
export class CreditoClienteController {
  constructor(private readonly credito: CreditoService) {}

  @Get('cadastro')
  @ApiOperation({ summary: 'Cadastro de crédito da empresa, documentos e limite' })
  cadastro(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.credito.detalhe(u.empresaId!);
  }

  @Put('cadastro')
  @SoCliente('aprovador')
  salvar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: SalvarCadastroDto) {
    return this.credito.salvar(u.empresaId!, dto);
  }

  @Post('documentos')
  @SoCliente('aprovador')
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  enviarDocumento(@UsuarioAtual() u: UsuarioAutenticado, @Query('tipo') tipo: string, @UploadedFile() arquivo: ArquivoRecebido) {
    return this.credito.enviarDocumento(u.empresaId!, tipo, arquivo, u);
  }

  @Get('documentos/:id')
  async documento(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { documento, conteudo } = await this.credito.lerDocumento(id, u.empresaId!);
    return baixar(res, documento.nome_arquivo, documento.tipo_conteudo, conteudo);
  }

  @Post('cadastro/enviar')
  @SoCliente('aprovador')
  @ApiOperation({ summary: 'Enviar o cadastro para análise do financeiro' })
  enviar(@UsuarioAtual() u: UsuarioAutenticado, @Ip() ip: string) {
    return this.credito.enviarParaAnalise(u.empresaId!, u, ip);
  }
}

@ApiTags('Equipe · Crédito')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe')
export class CreditoEquipeController {
  constructor(private readonly credito: CreditoService) {}

  @Get('credito')
  @ApiOperation({ summary: 'Cadastros de crédito (filtre por situação, ex.: em_analise)' })
  fila(@Query('situacao') situacao?: string) {
    return this.credito.fila(situacao);
  }

  @Get('credito/:empresaId')
  async detalhe(@Param('empresaId', ParseUUIDPipe) empresaId: string) {
    const det = await this.credito.detalhe(empresaId);
    const faixa = det.cadastro.faixa ?? 'A';
    return { ...det, sugestao: await this.credito.sugestao(empresaId, faixa), cliente_grande: await this.credito.avaliarClienteGrande(empresaId) };
  }

  @Get('credito/:empresaId/documentos/:id')
  async documento(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { documento, conteudo } = await this.credito.lerDocumento(id);
    return baixar(res, documento.nome_arquivo, documento.tipo_conteudo, conteudo);
  }

  @Post('credito/:empresaId/decisao')
  @SoEquipe('financeiro', 'administrador')
  @ApiOperation({ summary: 'Aprovar (faixa e limite), pedir documentos ou reprovar' })
  decidir(@UsuarioAtual() u: UsuarioAutenticado, @Param('empresaId', ParseUUIDPipe) empresaId: string, @Body() dto: DecisaoCreditoDto, @Ip() ip: string) {
    return this.credito.decidir(empresaId, dto, u, ip);
  }

  @Put('empresas/:empresaId/conta-e-ordem')
  @SoEquipe('comercial', 'administrador')
  @ApiOperation({ summary: 'Liberar ou bloquear a conta e ordem (cliente grande: pedidos mensais a partir de R$ 400 mil)' })
  contaEOrdem(@UsuarioAtual() u: UsuarioAutenticado, @Param('empresaId', ParseUUIDPipe) empresaId: string, @Body() dto: ContaEOrdemDto, @Ip() ip: string) {
    return this.credito.definirContaEOrdem(empresaId, dto, u, ip);
  }
}
