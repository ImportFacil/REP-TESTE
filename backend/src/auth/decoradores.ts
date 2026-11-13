import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OrigemUsuario, PapelCliente, PapelEquipe } from '../banco/tipos';
import type { UsuarioAutenticado } from './identidade';

export const META_PUBLICO = 'exportfacil:publico';
export const META_ACESSO = 'exportfacil:acesso';

export interface RegraAcesso {
  origem: OrigemUsuario;
  papeis: string[];
}

/** Rota aberta, sem login (ex.: verificação de saúde). */
export const Publico = () => SetMetadata(META_PUBLICO, true);

/** Só usuários da equipe Export Fácil; se papéis forem informados, só esses papéis. */
export const SoEquipe = (...papeis: PapelEquipe[]) => SetMetadata(META_ACESSO, { origem: 'equipe', papeis } satisfies RegraAcesso);

/** Só usuários de empresas clientes; se papéis forem informados, só esses papéis. */
export const SoCliente = (...papeis: PapelCliente[]) => SetMetadata(META_ACESSO, { origem: 'cliente', papeis } satisfies RegraAcesso);

/** Injeta o usuário autenticado no método do controlador. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): UsuarioAutenticado => ctx.switchToHttp().getRequest().usuario,
);
