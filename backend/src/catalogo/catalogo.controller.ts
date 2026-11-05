import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { CatalogoService } from './catalogo.service';
import { AlterarProdutoDto, AlterarTabelaPrecoDto, CotacaoDto, FiltroProdutos, ProdutoDto } from './dto';

@ApiTags('Catálogo')
@ApiBearerAuth()
@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('categorias')
  @ApiOperation({ summary: 'Categorias visíveis para quem está logado' })
  categorias(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.catalogo.categorias(u);
  }

  @Get('produtos')
  @ApiOperation({ summary: 'Produtos com o preço da tabela do cliente' })
  produtos(@UsuarioAtual() u: UsuarioAutenticado, @Query() f: FiltroProdutos) {
    return this.catalogo.listarProdutos(u, f);
  }

  @Get('produtos/:id')
  @ApiQuery({ name: 'tipo_cliente', required: false, description: 'Só para a equipe' })
  produto(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Query('tipo_cliente') tipo?: string) {
    return this.catalogo.obterProduto(u, id, tipo);
  }

  @Post('cotacao')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula preços, confere múltiplo de venda, estoque e pedido mínimo' })
  cotacao(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: CotacaoDto) {
    return this.catalogo.cotar(u, dto);
  }
}

@ApiTags('Equipe · Catálogo e preços')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe')
export class EquipeCatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('tabelas-preco')
  @ApiOperation({ summary: 'Desconto e pedido mínimo por tipo de cliente' })
  tabelas() {
    return this.catalogo.listarTabelas();
  }

  @Put('tabelas-preco/:tipo')
  @SoEquipe('comercial', 'administrador')
  alterarTabela(@UsuarioAtual() u: UsuarioAutenticado, @Param('tipo') tipo: string, @Body() dto: AlterarTabelaPrecoDto, @Ip() ip: string) {
    return this.catalogo.alterarTabela(tipo, dto, u, ip);
  }

  @Post('produtos')
  @SoEquipe('comercial', 'administrador')
  criarProduto(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: ProdutoDto, @Ip() ip: string) {
    return this.catalogo.criarProduto(dto, u, ip);
  }

  @Patch('produtos/:id')
  @SoEquipe('comercial', 'administrador')
  @ApiOperation({ summary: 'Altera produto; para tirar do catálogo, envie ativo=false (nada é apagado)' })
  alterarProduto(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: AlterarProdutoDto, @Ip() ip: string) {
    return this.catalogo.alterarProduto(id, dto, u, ip);
  }
}
