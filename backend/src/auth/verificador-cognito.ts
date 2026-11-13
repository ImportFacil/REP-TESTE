import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Config } from '../config';
import type { Identidade, VerificadorToken } from './identidade';

/**
 * Confere tokens de acesso dos dois grupos de usuários do Cognito:
 * clientes e equipe Export Fácil. O emissor (iss) do token diz de qual grupo ele veio,
 * e por isso uma conta de cliente nunca chega ao Painel da equipe.
 */
export class VerificadorCognito implements VerificadorToken {
  private readonly verificador;
  private readonly emissorEquipe: string;

  constructor(auth: Config['auth']) {
    this.verificador = CognitoJwtVerifier.create([
      { userPoolId: auth.clientes.poolId, tokenUse: 'access', clientId: auth.clientes.clientId },
      { userPoolId: auth.equipe.poolId, tokenUse: 'access', clientId: auth.equipe.clientId },
    ]);
    this.emissorEquipe = `https://cognito-idp.${auth.regiao}.amazonaws.com/${auth.equipe.poolId}`;
  }

  async verificar(token: string): Promise<Identidade> {
    const payload = await this.verificador.verify(token);
    return { sub: payload.sub, origem: payload.iss === this.emissorEquipe ? 'equipe' : 'cliente' };
  }
}
