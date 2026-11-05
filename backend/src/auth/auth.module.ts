import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CONFIG, type Config } from '../config';
import { AuthGuard } from './auth.guard';
import { PROVEDOR_IDENTIDADE, VERIFICADOR_TOKEN } from './identidade';
import { ProvedorCognito, ProvedorDev } from './provedor-cognito';
import { VerificadorCognito } from './verificador-cognito';
import { VerificadorDev } from './verificador-dev';

@Global()
@Module({
  providers: [
    {
      provide: VERIFICADOR_TOKEN,
      inject: [CONFIG],
      useFactory: (c: Config) => (c.auth.modo === 'cognito' ? new VerificadorCognito(c.auth) : new VerificadorDev(c.auth.segredoDev!)),
    },
    {
      provide: PROVEDOR_IDENTIDADE,
      inject: [CONFIG],
      useFactory: (c: Config) => (c.auth.modo === 'cognito' ? new ProvedorCognito(c.auth) : new ProvedorDev()),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [VERIFICADOR_TOKEN, PROVEDOR_IDENTIDADE],
})
export class AuthModule {}
