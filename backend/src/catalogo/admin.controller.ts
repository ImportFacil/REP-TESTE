import { Body, Controller, Get, Ip, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { CatalogoAdminService } from './admin.service';

class CategoriaDto {
  @ApiPropertyOptional({ description: 'Código (vira o endereço); se vazio, sai do nome' }) @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,40}$/) id?: string;
  @ApiProperty() @IsString() @Length(2, 80) nome!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) icone?: string;
  @ApiPropertyOptional({ description: 'Tipos de cliente que veem a categoria; vazio = todos' }) @IsOptional() @IsArray() @IsString({ each: true }) tipos_cliente?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordem?: number;
}
class AlterarCategoriaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) icone?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tipos_cliente?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordem?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
const TIPOS = ['texto', 'numero', 'lista', 'sim_nao'] as const;
class AtributoDto {
  @ApiProperty({ example: 'tensao' }) @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/, { message: 'Código: letras minúsculas, números e _, começando por letra' }) codigo!: string;
  @ApiProperty() @IsString() @Length(2, 80) nome!: string;
  @ApiProperty({ enum: TIPOS }) @IsIn(TIPOS) tipo!: (typeof TIPOS)[number];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) opcoes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() obrigatorio?: boolean;
  @ApiPropertyOptional({ description: 'Aparece nos filtros da loja' }) @IsOptional() @IsBoolean() filtravel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visivel_na_loja?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordem?: number;
}
class AlterarAtributoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) nome?: string;
  @ApiPropertyOptional({ enum: TIPOS }) @IsOptional() @IsIn(TIPOS) tipo?: (typeof TIPOS)[number];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) opcoes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() obrigatorio?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() filtravel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visivel_na_loja?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordem?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
class FamiliaDto {
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/, { message: 'Código: letras minúsculas, números e _, começando por letra' }) codigo!: string;
  @ApiProperty() @IsString() @Length(2, 80) nome!: string;
  @ApiPropertyOptional({ description: 'Atributos, na ordem' }) @IsOptional() @IsArray() @ArrayMaxSize(80) @Type(() => Number) @IsInt({ each: true }) atributos?: number[];
}
class AlterarFamiliaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(80) @Type(() => Number) @IsInt({ each: true }) atributos?: number[];
}

const QUEM_EDITA = ['comercial', 'administrador'] as const;

@ApiTags('Equipe · Catálogo')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/catalogo')
export class CatalogoAdminController {
  constructor(private readonly admin: CatalogoAdminService) {}

  @Get('produtos')
  @ApiOperation({ summary: 'Todos os produtos (inclusive inativos), com categoria e família' })
  produtos() { return this.admin.listarProdutos(); }

  @Get('produtos/:id')
  produto(@Param('id', ParseIntPipe) id: number) { return this.admin.produto(id); }

  @Get('categorias')
  categorias() { return this.admin.listarCategorias(); }

  @Post('categorias')
  @SoEquipe(...QUEM_EDITA)
  criarCategoria(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: CategoriaDto, @Ip() ip: string) { return this.admin.criarCategoria(d, u, ip); }

  @Patch('categorias/:id')
  @SoEquipe(...QUEM_EDITA)
  @ApiOperation({ summary: 'Altera categoria; para tirar da loja, ativo=false (nada é apagado)' })
  alterarCategoria(@UsuarioAtual() u: UsuarioAutenticado, @Param('id') id: string, @Body() d: AlterarCategoriaDto, @Ip() ip: string) { return this.admin.alterarCategoria(id, d, u, ip); }

  @Get('atributos')
  atributos() { return this.admin.listarAtributos(); }

  @Post('atributos')
  @SoEquipe(...QUEM_EDITA)
  criarAtributo(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: AtributoDto, @Ip() ip: string) { return this.admin.criarAtributo(d, u, ip); }

  @Patch('atributos/:id')
  @SoEquipe(...QUEM_EDITA)
  alterarAtributo(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarAtributoDto, @Ip() ip: string) { return this.admin.alterarAtributo(id, d, u, ip); }

  @Get('familias')
  familias() { return this.admin.listarFamilias(); }

  @Post('familias')
  @SoEquipe(...QUEM_EDITA)
  criarFamilia(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: FamiliaDto, @Ip() ip: string) { return this.admin.criarFamilia(d, u, ip); }

  @Patch('familias/:id')
  @SoEquipe(...QUEM_EDITA)
  alterarFamilia(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarFamiliaDto, @Ip() ip: string) { return this.admin.alterarFamilia(id, d, u, ip); }
}
