import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { SoCliente, SoEquipe, UsuarioAtual } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { ClientesService } from './clientes.service';

class AvaliacaoDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @Type(() => Number) @IsInt() @Min(1) @Max(5) nota!: number;
  @ApiProperty() @IsString() @Length(3, 120) titulo!: string;
  @ApiProperty() @IsString() @Length(10, 2000) comentario!: string;
}
class ModeracaoDto {
  @ApiProperty({ enum: ['aprovada', 'recusada'] }) @IsIn(['aprovada', 'recusada']) situacao!: 'aprovada' | 'recusada';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}

@ApiTags('Loja · Avaliações')
@ApiBearerAuth()
@Controller('catalogo/produtos/:id/avaliacoes')
export class AvaliacoesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({ summary: 'Avaliações aprovadas do produto (média, distribuição) e a minha' })
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) { return this.clientes.avaliacoesDoProduto(id, u); }

  @Post()
  @SoCliente()
  @ApiOperation({ summary: 'Avaliar o produto (uma vez; aparece depois da moderação)' })
  avaliar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: AvaliacaoDto, @Ip() ip: string) {
    return this.clientes.avaliar(id, u, d, ip);
  }
}

@ApiTags('Equipe · Clientes')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/clientes')
export class ClientesEquipeController {
  constructor(private readonly clientes: ClientesService) {}

  @Get('usuarios')
  @ApiOperation({ summary: 'Usuários de todas as empresas clientes' })
  usuarios() { return this.clientes.listarUsuarios(); }

  @Get('avaliacoes')
  @ApiOperation({ summary: 'Avaliações de produtos (pendentes primeiro)' })
  avaliacoes() { return this.clientes.listarAvaliacoes(); }

  @Post('avaliacoes/:id/moderar')
  @HttpCode(200)
  @SoEquipe('comercial', 'administrador')
  moderar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() d: ModeracaoDto, @Ip() ip: string) {
    return this.clientes.moderar(id, d.situacao, d.motivo, u, ip);
  }
}
