import { Body, Controller, Get, Ip, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { Publico, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { ConteudoService } from './conteudo.service';

class PaginaDto {
  @ApiPropertyOptional({ description: 'Endereço; se vazio, sai do título. Não muda depois.' }) @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,60}$/) slug?: string;
  @ApiProperty() @IsString() @Length(2, 120) titulo!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) resumo?: string;
  @ApiProperty({ description: 'Markdown simples: ## título, parágrafos, listas com "-", **negrito**, [link](endereço)' }) @IsString() @Length(1, 50_000) conteudo!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publicada?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() no_rodape?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordem?: number;
}
class AlterarPaginaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) titulo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) resumo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50_000) conteudo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publicada?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() no_rodape?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordem?: number;
}

@ApiTags('Loja · Páginas')
@Publico()
@Controller('conteudo/paginas')
export class ConteudoPublicoController {
  constructor(private readonly conteudo: ConteudoService) {}

  @Get()
  @ApiOperation({ summary: 'Páginas publicadas (abertas, sem login)' })
  listar() { return this.conteudo.publicadas(); }

  @Get(':slug')
  pagina(@Param('slug') slug: string) { return this.conteudo.publicada(slug); }
}

@ApiTags('Equipe · Conteúdo')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/conteudo/paginas')
export class ConteudoEquipeController {
  constructor(private readonly conteudo: ConteudoService) {}

  @Get()
  listar() { return this.conteudo.listar(); }

  @Post()
  @SoEquipe('comercial', 'administrador')
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() d: PaginaDto, @Ip() ip: string) { return this.conteudo.criar(d, u, ip); }

  @Patch(':id')
  @SoEquipe('comercial', 'administrador')
  alterar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AlterarPaginaDto, @Ip() ip: string) {
    return this.conteudo.alterar(id, d, u, ip);
  }
}
