import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import { CatalogoService } from '../catalogo/catalogo.service';

export interface NovaAvaliacao { nota: number; titulo: string; comentario: string }

/** "Marina Souza" → "Marina S." (a loja mostra o nome curto de quem avaliou). */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
}

/** Clientes no formato do Bagisto: usuários das empresas e avaliações de produtos. */
@Injectable()
export class ClientesService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly catalogo: CatalogoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Todos os usuários de empresas clientes, com empresa, pedidos feitos e newsletter. */
  listarUsuarios() {
    return this.db.selectFrom('usuarios as u').innerJoin('empresas as e', 'e.id', 'u.empresa_id')
      .select(['u.id', 'u.nome', 'u.email', 'u.papel', 'u.ativo', 'u.criado_em', 'u.ultimo_acesso_em', 'u.empresa_id',
        'e.razao_social', 'e.tipo_cliente', 'e.situacao as situacao_empresa',
        sql<number>`(select count(*)::int from pedidos p where p.comprador_id = u.id)`.as('pedidos'),
        sql<number>`(select coalesce(sum(p.total_centavos), 0)::bigint from pedidos p where p.comprador_id = u.id and p.situacao <> 'cancelado')`.as('comprado_centavos'),
        sql<boolean>`exists (select 1 from newsletter_inscritos n where n.email = lower(u.email) and n.ativo)`.as('newsletter'),
      ])
      .where('u.origem', '=', 'cliente').orderBy('e.razao_social').orderBy('u.nome').execute();
  }

  // ---------- avaliações ----------

  /** Avaliações aprovadas do produto, com média e distribuição; e a avaliação de quem pergunta, em qualquer situação. */
  async avaliacoesDoProduto(produtoId: number, u: UsuarioAutenticado) {
    await this.catalogo.obterProduto(u, produtoId); // 404 se o produto não existe ou não é do catálogo de quem pergunta
    const [aprovadas, minha] = await Promise.all([
      this.db.selectFrom('avaliacoes as a').innerJoin('usuarios as u', 'u.id', 'a.usuario_id').innerJoin('empresas as e', 'e.id', 'a.empresa_id')
        .select(['a.id', 'a.nota', 'a.titulo', 'a.comentario', 'a.compra_verificada', 'a.criado_em', 'u.nome', 'e.tipo_cliente'])
        .where('a.produto_id', '=', produtoId).where('a.situacao', '=', 'aprovada').orderBy('a.criado_em', 'desc').limit(200).execute(),
      u.origem === 'cliente'
        ? this.db.selectFrom('avaliacoes').select(['id', 'nota', 'titulo', 'comentario', 'situacao', 'motivo_recusa', 'criado_em'])
          .where('produto_id', '=', produtoId).where('usuario_id', '=', u.id).executeTakeFirst()
        : Promise.resolve(undefined),
    ]);
    const distribuicao = [1, 2, 3, 4, 5].map((n) => aprovadas.filter((a) => a.nota === n).length);
    const media = aprovadas.length ? Math.round((aprovadas.reduce((s, a) => s + a.nota, 0) / aprovadas.length) * 10) / 10 : null;
    return {
      media, total: aprovadas.length, distribuicao,
      avaliacoes: aprovadas.map(({ nome, ...a }) => ({ ...a, autor: nomeCurto(nome) })),
      minha: minha ?? null,
    };
  }

  /** O cliente avalia uma vez cada produto; a avaliação aparece na loja depois da moderação. */
  async avaliar(produtoId: number, u: UsuarioAutenticado, d: NovaAvaliacao, ip: string | null) {
    await this.catalogo.obterProduto(u, produtoId);
    const comprou = await this.db.selectFrom('pedido_itens as i').innerJoin('pedidos as p', 'p.id', 'i.pedido_id').select('i.id')
      .where('p.empresa_id', '=', u.empresaId!).where('i.produto_id', '=', produtoId).where('p.situacao', '<>', 'cancelado').executeTakeFirst();
    try {
      const a = await this.db.insertInto('avaliacoes').values({
        produto_id: produtoId, empresa_id: u.empresaId!, usuario_id: u.id, nota: d.nota, titulo: d.titulo.trim(), comentario: d.comentario.trim(), compra_verificada: !!comprou,
      }).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: u, acao: 'avaliacao.criar', entidade: 'avaliacao', entidadeId: a.id, depois: { produto_id: produtoId, nota: d.nota }, ip });
      return a;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Você já avaliou este produto.');
      throw e;
    }
  }

  listarAvaliacoes() {
    return this.db.selectFrom('avaliacoes as a').innerJoin('produtos as p', 'p.id', 'a.produto_id').innerJoin('usuarios as u', 'u.id', 'a.usuario_id')
      .innerJoin('empresas as e', 'e.id', 'a.empresa_id').leftJoin('usuarios as m', 'm.id', 'a.moderada_por')
      .select(['a.id', 'a.produto_id', 'a.nota', 'a.titulo', 'a.comentario', 'a.compra_verificada', 'a.situacao', 'a.motivo_recusa', 'a.criado_em', 'a.moderada_em',
        'p.codigo', 'p.nome as produto', 'u.nome as autor', 'u.email', 'e.razao_social', 'm.nome as moderada_por'])
      .orderBy(sql`a.situacao = 'pendente'`, 'desc').orderBy('a.criado_em', 'desc').limit(5000).execute();
  }

  /** Aprova ou recusa (recusa pede motivo, que o cliente vê na própria avaliação). */
  async moderar(id: number, situacao: 'aprovada' | 'recusada', motivo: string | undefined, autor: UsuarioAutenticado, ip: string | null) {
    if (situacao === 'recusada' && !motivo?.trim()) throw new BadRequestException('Informe o motivo da recusa; o cliente vê esse texto.');
    const antes = await this.db.selectFrom('avaliacoes').select(['id', 'situacao']).where('id', '=', id).executeTakeFirst();
    if (!antes) throw new NotFoundException('Avaliação não encontrada.');
    const a = await this.db.updateTable('avaliacoes')
      .set({ situacao, motivo_recusa: situacao === 'recusada' ? motivo!.trim() : null, moderada_por: autor.id, moderada_em: new Date() })
      .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: `avaliacao.${situacao === 'aprovada' ? 'aprovar' : 'recusar'}`, entidade: 'avaliacao', entidadeId: id, antes, depois: { situacao, motivo }, ip });
    return a;
  }
}
