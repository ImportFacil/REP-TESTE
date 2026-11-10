import { Module } from '@nestjs/common';
import { MarketingModule } from '../marketing/marketing.module';
import { CatalogoAdminController } from './admin.controller';
import { CatalogoAdminService } from './admin.service';
import { CatalogoController, EquipeCatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

/** Módulo "Catálogo e preços": produtos, categorias e condição por tipo de cliente. */
@Module({ imports: [MarketingModule], providers: [CatalogoService, CatalogoAdminService], controllers: [CatalogoController, EquipeCatalogoController, CatalogoAdminController], exports: [CatalogoService] })
export class CatalogoModule {}
