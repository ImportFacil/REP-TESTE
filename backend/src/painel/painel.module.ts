import { Module } from '@nestjs/common';
import { PainelController } from './painel.controller';
import { PainelService } from './painel.service';

/** Painel de controle da equipe (formato do Bagisto). */
@Module({ providers: [PainelService], controllers: [PainelController], exports: [PainelService] })
export class PainelModule {}
