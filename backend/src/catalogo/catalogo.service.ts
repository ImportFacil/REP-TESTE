import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type ExpressionBuilder, type SelectQueryBuilder } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Database, Produto, TabelaPreco } from '../banco/tipos';
import { PG_VIOLACAO_FK, PG_VIOLACAO_UNICA, codigoPg } from '../comum/erros';
import { limites } from '../comum/paginacao';
import type { AlterarProdutoDto, AlterarTabelaPrecoDto, CotacaoDto, FiltroProdutos, ProdutoDto } from './dto';
import { cotar, precoParaTipo } from './precos';

type ProdutoComPreco = Produto & {
  categoria_nome: string;
  preco_cliente_centavos: number | null;
  tipo_cliente_preco: string | null;
};

const EXPR_BUSCA = sql`busca_normalizada(p.nome || ' ' || coalesce(p.marca, '') || ' ' || p.codigo)`;

/**
 * Módulo "Catálogo e preços".
 *
 * Clientes veem só as categorias do seu tipo de cliente e os preços da sua tabela.
 * A equipe vê tudo e pode simular os preços de qualquer tipo.
 */
@Injectable()
export class CatalogoService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ---------- tabelas de preço ----------

  listarTabelas(): Promise<TabelaPreco[]> {
    return this.db.selectFrom('tabelas_preco').selectAll().orderBy('nome').execute();
  }

  /** Condição de preço que vale para a requisição: a do cliente logado, ou a escolhida pela equipe. */
  private async condicao(u: UsuarioAutenticado, tipoPedido?: string): Promise<TabelaPreco | null> {
    const tipo = u.origem === 'cliente' ? u.tipoCliente : tipoPedido;
    if (!tipo) return null;
    const t = await this.db.selectFrom('tabelas_preco').selectAll().where('tipo_cliente', '=', tipo).executeTakeFirst();
    if (!t) throw new BadRequestException(`Tipo de cliente desconhecido: ${tipo}`);
    return t;
  }

  async alterarTabela(tipo: string, dto: AlterarTabelaPrecoDto, autor: UsuarioAutenticado, ip: string | null): Promise<TabelaPreco> {
    return this.db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('tabelas_preco').selectAll().where('tipo_cliente', '=', tipo).forUpdate().executeTakeFirst();
      if (!antes) throw new NotFoundException('Tipo de cliente não encontrado.');
      const set = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
      if (!Object.keys(set).length) return antes;
      const depois = await trx.updateTable('tabelas_preco').set(set).where('tipo_cliente', '=', tipo).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'tabela_preco.alterar', entidade: 'tabela_preco', entidadeId: tipo, antes, depois, ip }, trx);
      return depois;
    });
  }

  // ---------- categorias ----------

  async categorias(u: UsuarioAutenticado) {
    let q = this.db.selectFrom('categorias as c').selectAll().orderBy('ordem');
    if (u.origem === 'cliente') q = this.visivelAoCliente(q.where('c.ativo', '=', true), u.tipoCliente!);
    return q.execute();
  }

  private visivelAoCliente<O>(q: SelectQueryBuilder<Database & { c: Database['categorias'] }, 'c', O>, tipo: string) {
    return q.where((eb: ExpressionBuilder<Database & { c: Database['categorias'] }, 'c'>) =>
      eb.or([eb('c.tipos_cliente', 'is', null), eb(sql`${tipo}`, '=', sql`ANY(c.tipos_cliente)`)]),
    );
  }

  // ---------- produtos ----------

  private consultaProdutos(u: UsuarioAutenticado, incluirInativos: boolean) {
    let q = this.db.selectFrom('produtos as p').innerJoin('categorias as c', 'c.id', 'p.categoria_id');
    if (u.origem === 'cliente' || !incluirInativos) q = q.where('p.ativo', '=', true).where('c.ativo', '=', true);
    if (u.origem === 'cliente') q = this.visivelAoCliente(q, u.tipoCliente!);
    return q;
  }

  private comPreco(p: Produto & { categoria_nome: string }, t: TabelaPreco | null): ProdutoComPreco {
    return {
      ...p,
      preco_cliente_centavos: t ? precoParaTipo(p.preco_tabela_centavos, t.desconto_bp) : null,
      tipo_cliente_preco: t?.tipo_cliente ?? null,
    };
  }

  async listarProdutos(u: UsuarioAutenticado, f: FiltroProdutos) {
    const { limite, deslocamento, pagina } = limites(f, 24);
    const t = await this.condicao(u, f.tipo_cliente);
    let q = this.consultaProdutos(u, u.origem === 'equipe' && !!f.incluir_inativos);
    if (f.categoria) q = q.where('p.categoria_id', '=', f.categoria);
    if (f.destaque !== undefined) q = q.where('p.destaque', '=', f.destaque);
    if (f.busca?.trim()) {
      const termo = f.busca.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
      q = q.where(sql<boolean>`${EXPR_BUSCA} LIKE '%' || busca_normalizada(${termo}) || '%'`);
    }
    const [linhas, total] = await Promise.all([
      q.selectAll('p').select('c.nome as categoria_nome').orderBy('p.destaque', 'desc').orderBy('p.nome').limit(limite).offset(deslocamento).execute(),
      q.select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow(),
    ]);
    return {
      itens: linhas.map((p) => this.comPreco(p, t)),
      total: total.n,
      pagina,
      por_pagina: limite,
      pedido_minimo_centavos: t?.pedido_minimo_centavos ?? null,
    };
  }

  async obterProduto(u: UsuarioAutenticado, id: number, tipo?: string): Promise<ProdutoComPreco> {
    const t = await this.condicao(u, tipo);
    const p = await this.consultaProdutos(u, u.origem === 'equipe')
      .selectAll('p')
      .select('c.nome as categoria_nome')
      .where('p.id', '=', id)
      .executeTakeFirst();
    if (!p) throw new NotFoundException('Produto não encontrado.');
    return this.comPreco(p, t);
  }

  /** Preços dos itens para o tipo do cliente, múltiplo de venda, estoque e pedido mínimo. */
  async cotar(u: UsuarioAutenticado, dto: CotacaoDto) {
    const t = await this.condicao(u, dto.tipo_cliente);
    if (!t) throw new BadRequestException('Informe o tipo de cliente para cotar.');
    const quantidades = new Map<number, number>();
    for (const i of dto.itens) quantidades.set(i.produto_id, (quantidades.get(i.produto_id) ?? 0) + i.quantidade);
    const ids = [...quantidades.keys()];
    const produtos = await this.consultaProdutos(u, false)
      .select(['p.id', 'p.codigo', 'p.nome', 'p.unidade', 'p.preco_tabela_centavos', 'p.multiplo_venda', 'p.estoque', 'p.sob_orcamento'])
      .where('p.id', 'in', ids)
      .execute();
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const faltando = ids.filter((id) => !porId.has(id));
    if (faltando.length) throw new BadRequestException(`Produtos indisponíveis: ${faltando.join(', ')}`);

    const r = cotar(ids.map((id) => ({ quantidade: quantidades.get(id)!, produto: porId.get(id)! })), t);
    return {
      ...r,
      tipo_cliente: t.tipo_cliente,
      itens: r.itens.map((i) => {
        const p = porId.get(i.produto_id)!;
        return { ...i, codigo: p.codigo, nome: p.nome, unidade: p.unidade, multiplo_venda: p.multiplo_venda };
      }),
    };
  }

  async criarProduto(dto: ProdutoDto, autor: UsuarioAutenticado, ip: string | null): Promise<Produto> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const p = await trx
          .insertInto('produtos')
          .values({
            ...dto,
            marca: dto.marca ?? null,
            subcategoria: dto.subcategoria ?? null,
            descricao: dto.descricao ?? null,
            ncm: dto.ncm ?? null,
            especificacoes: JSON.stringify(dto.especificacoes ?? []),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await this.auditoria.registrar({ usuario: autor, acao: 'produto.criar', entidade: 'produto', entidadeId: p.id, depois: p, ip }, trx);
        return p;
      });
    } catch (e) {
      throw traduzirErroProduto(e);
    }
  }

  async alterarProduto(id: number, dto: AlterarProdutoDto, autor: UsuarioAutenticado, ip: string | null): Promise<Produto> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const antes = await trx.selectFrom('produtos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
        if (!antes) throw new NotFoundException('Produto não encontrado.');
        const { especificacoes, ...resto } = dto;
        const set = {
          ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)),
          ...(especificacoes !== undefined && { especificacoes: JSON.stringify(especificacoes) }),
        };
        if (!Object.keys(set).length) return antes;
        const depois = await trx.updateTable('produtos').set(set).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
        await this.auditoria.registrar({ usuario: autor, acao: 'produto.alterar', entidade: 'produto', entidadeId: id, antes, depois, ip }, trx);
        return depois;
      });
    } catch (e) {
      throw traduzirErroProduto(e);
    }
  }
}

function traduzirErroProduto(e: unknown): unknown {
  if (codigoPg(e) === PG_VIOLACAO_UNICA) return new ConflictException('Já existe um produto com este código.');
  if (codigoPg(e) === PG_VIOLACAO_FK) return new BadRequestException('Categoria inexistente.');
  return e;
}
