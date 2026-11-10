import { Module } from '@nestjs/common';
import { CatalogoController, EquipeCatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

/** Módulo "Catálogo e preços": produtos, categorias e condição por tipo de cliente. */
@Module({ providers: [CatalogoService], controllers: [CatalogoController, EquipeCatalogoController], exports: [CatalogoService] })
export class CatalogoModule {}
