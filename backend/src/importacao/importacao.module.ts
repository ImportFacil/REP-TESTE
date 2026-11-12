import { Module } from '@nestjs/common';
import { ImportacaoClienteController, ImportacaoEquipeController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RotasController } from './rotas.controller';

/** Módulo "Importação": orçamentos, ordens, numerário, prestação de contas e rotas marítimas. */
@Module({ providers: [ImportacaoService], controllers: [ImportacaoClienteController, ImportacaoEquipeController, RotasController], exports: [ImportacaoService] })
export class ImportacaoModule {}
