import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { AvaliacoesController, ClientesEquipeController } from './clientes.controller';
import { ClientesService } from './clientes.service';

/** Clientes no formato do Bagisto: usuários das empresas e avaliações de produtos. */
@Module({ imports: [CatalogoModule], providers: [ClientesService], controllers: [AvaliacoesController, ClientesEquipeController] })
export class ClientesModule {}
