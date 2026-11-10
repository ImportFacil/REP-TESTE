import { Body, Controller, Delete, Get, Ip, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { SoCliente, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { EnderecoDto } from '../contas/dto';
import { LojaService } from './loja.service';

class NovoEnderecoDto {
  @ApiProperty({ example: 'Matriz' }) @IsString() @Length(2, 60) apelido!: string;
  @ApiProperty({ type: EnderecoDto }) @ValidateNested() @Type(() => EnderecoDto) endereco!: EnderecoDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() padrao?: boolean;
}
class AlterarEnderecoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 60) apelido?: string;
  @ApiPropertyOptional({ type: EnderecoDto }) @IsOptional() @ValidateNested() @Type(() => EnderecoDto) endereco?: EnderecoDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() padrao?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class ItemListaDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) produto_id!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) quantidade!: number;
}
class NovaListaDto {
  @ApiProperty() @IsString() @Length(2, 80) nome!: string;
  @ApiPropertyOptional({ type: [ItemListaDto] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemListaDto) itens?: ItemListaDto[];
}
class AlterarListaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class ItensDto {
  @ApiProperty({ type: [ItemListaDto] }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ItemListaDto) itens!: ItemListaDto[];
}
class QuantidadeDto {
  @ApiProperty({ description: 'Zero tira o item' }) @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) quantidade!: number;
}

@ApiTags('Loja · Favoritos, endereços e listas')
@ApiBearerAuth()
@SoCliente()
@Controller('loja')
export class LojaController {
  constructor(private readonly loja: LojaService) {}

  @Get('favoritos')
  @ApiOperation({ summary: 'Meus favoritos, com o preço da minha tabela' })
  favoritos(@UsuarioAtual() u: UsuarioAutenticado) { return this.loja.favoritos(u); }

  @Get('favoritos/ids')
  idsFavoritos(@UsuarioAtual() u: UsuarioAutenticado) { return this.loja.idsFavoritos(u); }

  @Put('favoritos/:produtoId')
  favoritar(@UsuarioAtual() u: UsuarioAutenticado, @Param('produtoId', ParseIntPipe) id: number) { return this.loja.favoritar(u, id); }

  @Delete('favoritos/:produtoId')
  desfavoritar(@UsuarioAtual() u: UsuarioAutenticado, @Param('produtoId', ParseIntPipe) id: number) { return this.loja.desfavoritar(u, id); }

  @Get('enderecos')
  @ApiOperation({ summary: 'Endereços de entrega da empresa' })
  enderecos(@UsuarioAtual() u: UsuarioAutenticado) { return this.loja.enderecos(u); }

  @Post('enderecos')
  @SoCliente('aprovador')
  criarEndereco(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: NovoEnderecoDto, @Ip() ip: string) { return this.loja.criarEndereco(u, d, ip); }

  @Patch('enderecos/:id')
  @SoCliente('aprovador')
  alterarEndereco(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarEnderecoDto, @Ip() ip: string) {
    return this.loja.alterarEndereco(u, id, d, ip);
  }

  @Get('listas')
  @ApiOperation({ summary: 'Listas de compra da empresa' })
  listas(@UsuarioAtual() u: UsuarioAutenticado) { return this.loja.listas(u); }

  @Post('listas')
  criarLista(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: NovaListaDto) { return this.loja.criarLista(u, d.nome, d.itens); }

  @Get('listas/:id')
  lista(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) { return this.loja.detalheLista(u, id); }

  @Patch('listas/:id')
  alterarLista(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarListaDto) { return this.loja.alterarLista(u, id, d); }

  @Post('listas/:id/itens')
  @ApiOperation({ summary: 'Junta itens à lista (soma as quantidades)' })
  adicionar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: ItensDto) { return this.loja.adicionarItens(u, id, d.itens); }

  @Put('listas/:id/itens/:produtoId')
  definirItem(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Param('produtoId', ParseIntPipe) produtoId: number, @Body() d: QuantidadeDto) {
    return this.loja.definirItem(u, id, produtoId, d.quantidade);
  }
}
