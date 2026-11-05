import type { OrigemUsuario, Papel, SituacaoEmpresa } from '../banco/tipos';

/** O que o token de login prova: quem é a pessoa e de qual grupo de usuários ela veio. */
export interface Identidade {
  sub: string;
  origem: OrigemUsuario;
}

/** Usuário já conferido no banco, disponível em cada requisição autenticada. */
export interface UsuarioAutenticado {
  id: string;
  origem: OrigemUsuario;
  papel: Papel;
  nome: string;
  email: string;
  empresaId: string | null;
  tipoCliente: string | null;
  situacaoEmpresa: SituacaoEmpresa | null;
}

export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
export interface VerificadorToken {
  /** Lança erro se o token for inválido, expirado ou de outro sistema. */
  verificar(token: string): Promise<Identidade>;
}

export const PROVEDOR_IDENTIDADE = Symbol('PROVEDOR_IDENTIDADE');
export interface ProvedorIdentidade {
  /** Cria o login da pessoa (o Cognito envia o convite por e-mail) e devolve o identificador dela. */
  convidar(origem: OrigemUsuario, email: string, nome: string): Promise<{ sub: string }>;
  /** Impede novos logins (o usuário fica inativo, nunca é apagado). */
  desativar(origem: OrigemUsuario, email: string): Promise<void>;
  /** Volta a permitir logins de um usuário desativado. */
  reativar(origem: OrigemUsuario, email: string): Promise<void>;
}
