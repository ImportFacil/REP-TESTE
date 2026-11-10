import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { LojaModule } from '../loja/loja.module';
import { MarketingModule } from '../marketing/marketing.module';
import { PedidosModule } from '../pedidos/pedidos.module';
import { B2bClienteController, B2bEquipeController } from './b2b.controller';
import { B2bService } from './b2b.service';

/** B2B no formato do Bagisto B2B: aprovação de compras e cotações de preço negociado. */
@Module({ imports: [PedidosModule, CatalogoModule, MarketingModule, LojaModule], providers: [B2bService], controllers: [B2bClienteController, B2bEquipeController] })
export class B2bModule {}
