import { Module } from '@nestjs/common';
import { ImportacaoModule } from '../importacao/importacao.module';
import { RotinasService } from './rotinas.service';

@Module({ imports: [ImportacaoModule], providers: [RotinasService], exports: [RotinasService] })
export class RotinasModule {}
