import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { SoEquipe } from '../auth/decoradores';
import { buscarPortos, calcularRota } from './rotas';

class RotaQuery {
  @ApiPropertyOptional({ example: 'CNSHA', description: 'Código UN/LOCODE do porto de origem' }) @IsString() @Matches(/^[A-Za-z]{2}[A-Za-z0-9]{3}$/) origem!: string;
  @ApiPropertyOptional({ example: 'BRSSZ', description: 'Código UN/LOCODE do porto de destino' }) @IsString() @Matches(/^[A-Za-z]{2}[A-Za-z0-9]{3}$/) destino!: string;
  @ApiPropertyOptional({ example: 16, description: 'Velocidade média em nós (5 a 30)' }) @IsOptional() @Type(() => Number) @IsNumber() @Min(5) @Max(30) velocidade?: number;
  @ApiPropertyOptional({ example: 'suez', description: 'Canais a evitar, separados por vírgula: suez, panama' }) @IsOptional() @IsString() @MaxLength(40) evitar?: string;
}

@ApiTags('Equipe · Rotas marítimas')
@ApiBearerAuth()
@SoEquipe()
@Controller('equipe/importacao')
export class RotasController {
  @Get('portos')
  @ApiOperation({ summary: 'Portos (UN/LOCODE): os principais ou a busca por nome, país ou código' })
  portos(@Query('busca') busca?: string) {
    return buscarPortos(typeof busca === 'string' ? busca.slice(0, 60) : undefined);
  }

  @Get('rota')
  @ApiOperation({ summary: 'Rota marítima entre dois portos: caminho, distância, tempo de viagem e canais atravessados' })
  rota(@Query() q: RotaQuery) {
    return calcularRota(q.origem, q.destino, q.velocidade ?? 16, q.evitar ? q.evitar.split(',') : []);
  }
}
