import { SignJWT, jwtVerify } from 'jose';
import type { OrigemUsuario } from '../banco/tipos';
import type { Identidade, VerificadorToken } from './identidade';

/**
 * Login de desenvolvimento: tokens assinados com um segredo local.
 * Só existe nos ambientes local, teste e dev (a configuração recusa em homologação e produção).
 */
const EMISSOR = 'importfacil-dev';

export class VerificadorDev implements VerificadorToken {
  private readonly chave: Uint8Array;

  constructor(segredo: string) {
    this.chave = new TextEncoder().encode(segredo);
  }

  async verificar(token: string): Promise<Identidade> {
    const { payload } = await jwtVerify(token, this.chave, { issuer: EMISSOR, algorithms: ['HS256'] });
    const origem = payload.origem;
    if (typeof payload.sub !== 'string' || (origem !== 'cliente' && origem !== 'equipe')) {
      throw new Error('Token de desenvolvimento sem sub ou origem.');
    }
    return { sub: payload.sub, origem };
  }
}

export async function gerarTokenDev(segredo: string, sub: string, origem: OrigemUsuario, validadeSegundos = 3600): Promise<string> {
  return new SignJWT({ origem })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(EMISSOR)
    .setIssuedAt()
    .setExpirationTime(`${validadeSegundos}s`)
    .sign(new TextEncoder().encode(segredo));
}
