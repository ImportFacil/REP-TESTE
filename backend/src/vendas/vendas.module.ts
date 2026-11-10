import { Module } from '@nestjs/common';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

/** Vendas no formato do Bagisto: notas fiscais, envios, reembolsos e transações. */
@Module({ providers: [VendasService], controllers: [VendasController], exports: [VendasService] })
export class VendasModule {}
