import { Module } from '@nestjs/common';
import { ImportacaoClienteController, ImportacaoEquipeController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';

/** Módulo "Importação": orçamentos, ordens, numerário e prestação de contas. */
@Module({ providers: [ImportacaoService], controllers: [ImportacaoClienteController, ImportacaoEquipeController], exports: [ImportacaoService] })
export class ImportacaoModule {}
