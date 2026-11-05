import { Global, Module } from '@nestjs/common';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

@Global()
@Module({ providers: [AuditoriaService], controllers: [AuditoriaController], exports: [AuditoriaService] })
export class AuditoriaModule {}
