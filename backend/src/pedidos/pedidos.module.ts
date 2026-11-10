import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { PedidosClienteController, PedidosEquipeController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

/** Módulo "Pedidos e orçamentos" (parte de pedidos). */
@Module({ imports: [CatalogoModule], providers: [PedidosService], controllers: [PedidosClienteController, PedidosEquipeController], exports: [PedidosService] })
export class PedidosModule {}
