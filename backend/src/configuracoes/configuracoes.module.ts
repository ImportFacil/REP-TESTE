import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ConfiguracoesController } from './configuracoes.controller';
import { ConfiguracoesService } from './configuracoes.service';

/** Configurações no formato do Bagisto: permissões, impostos, locais de estoque, câmbio e importação de produtos. */
@Module({ imports: [DiscoveryModule], providers: [ConfiguracoesService], controllers: [ConfiguracoesController] })
export class ConfiguracoesModule {}
