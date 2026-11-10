import { Module } from '@nestjs/common';
import { ARMAZENAMENTO, ArmazenamentoLocal, ArmazenamentoS3 } from '../arquivos/armazenamento';
import { CONFIG, type Config } from '../config';
import { CreditoClienteController, CreditoEquipeController } from './credito.controller';
import { CreditoService } from './credito.service';

/** Módulo "Crédito": cadastro, documentos, análise, limite e liberação da conta e ordem. */
@Module({
  providers: [
    CreditoService,
    {
      provide: ARMAZENAMENTO,
      inject: [CONFIG],
      useFactory: (c: Config) => (c.arquivos.modo === 's3' ? new ArmazenamentoS3(c.arquivos.bucket!) : new ArmazenamentoLocal(c.arquivos.pasta)),
    },
  ],
  controllers: [CreditoClienteController, CreditoEquipeController],
  exports: [CreditoService, ARMAZENAMENTO],
})
export class CreditoModule {}
