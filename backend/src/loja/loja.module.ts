import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { LojaController } from './loja.controller';
import { LojaService } from './loja.service';

/** A loja no formato do Bagisto: favoritos, endereços de entrega e listas de compra. */
@Module({ imports: [CatalogoModule], providers: [LojaService], controllers: [LojaController], exports: [LojaService] })
export class LojaModule {}
