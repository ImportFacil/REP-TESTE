import { Module } from '@nestjs/common';
import { ConteudoEquipeController, ConteudoPublicoController } from './conteudo.controller';
import { ConteudoService } from './conteudo.service';

/** Conteúdo no formato do Bagisto: páginas da loja. */
@Module({ providers: [ConteudoService], controllers: [ConteudoPublicoController, ConteudoEquipeController] })
export class ConteudoModule {}
