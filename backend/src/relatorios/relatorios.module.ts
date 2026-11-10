import { Module } from '@nestjs/common';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';

/** Relatórios no formato do Bagisto: vendas, produtos e clientes. */
@Module({ providers: [RelatoriosService], controllers: [RelatoriosController] })
export class RelatoriosModule {}
