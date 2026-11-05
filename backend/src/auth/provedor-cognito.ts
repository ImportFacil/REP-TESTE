import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import type { OrigemUsuario } from '../banco/tipos';
import type { Config } from '../config';
import type { ProvedorIdentidade } from './identidade';

/** Cria e desativa logins nos grupos de usuários do Cognito (o e-mail é o nome de usuário). */
export class ProvedorCognito implements ProvedorIdentidade {
  private readonly cliente: CognitoIdentityProviderClient;

  constructor(private readonly auth: Config['auth']) {
    this.cliente = new CognitoIdentityProviderClient({ region: auth.regiao });
  }

  private pool(origem: OrigemUsuario): string {
    return origem === 'equipe' ? this.auth.equipe.poolId : this.auth.clientes.poolId;
  }

  async convidar(origem: OrigemUsuario, email: string, nome: string): Promise<{ sub: string }> {
    const UserPoolId = this.pool(origem);
    try {
      const r = await this.cliente.send(
        new AdminCreateUserCommand({
          UserPoolId,
          Username: email,
          DesiredDeliveryMediums: ['EMAIL'],
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: nome },
          ],
        }),
      );
      const sub = r.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw new Error('Cognito não devolveu o identificador do usuário.');
      return { sub };
    } catch (e) {
      if (!(e instanceof UsernameExistsException)) throw e;
      // O login já existe no Cognito (ex.: tentativa anterior): reaproveita.
      const r = await this.cliente.send(new AdminGetUserCommand({ UserPoolId, Username: email }));
      const sub = r.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw e;
      return { sub };
    }
  }

  async desativar(origem: OrigemUsuario, email: string): Promise<void> {
    await this.cliente.send(new AdminDisableUserCommand({ UserPoolId: this.pool(origem), Username: email }));
  }

  async reativar(origem: OrigemUsuario, email: string): Promise<void> {
    await this.cliente.send(new AdminEnableUserCommand({ UserPoolId: this.pool(origem), Username: email }));
  }
}

/** No login de desenvolvimento não há Cognito: o identificador é derivado do e-mail. */
export class ProvedorDev implements ProvedorIdentidade {
  async convidar(_origem: OrigemUsuario, email: string): Promise<{ sub: string }> {
    return { sub: email ? `dev-${email}` : randomUUID() };
  }
  async desativar(): Promise<void> {}
  async reativar(): Promise<void> {}
}
