import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SoEquipe } from '../auth/decoradores';
import { AuditoriaService } from './auditoria.service';

class FiltroAuditoria {
  @IsOptional() @IsString() entidade?: string;
  @IsOptional() @IsString() entidadeId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) antesDe?: number;
}

@ApiTags('Equipe · Auditoria')
@ApiBearerAuth()
@SoEquipe('administrador')
@Controller('equipe/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  listar(@Query() f: FiltroAuditoria) {
    return this.auditoria.listar({ entidade: f.entidade, entidadeId: f.entidadeId, limite: f.limite ?? 50, antesDe: f.antesDe });
  }
}
