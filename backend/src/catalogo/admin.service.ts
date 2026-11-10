import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Database, TipoAtributo } from '../banco/tipos';
import { PG_VIOLACAO_UNICA, codigoPg } from '../comum/erros';

export interface DadosCategoria { id?: string; nome?: string; icone?: string | null; tipos_cliente?: string[] | null; ordem?: number; ativo?: boolean }
export interface DadosAtributo {
  codigo?: string; nome?: string; tipo?: TipoAtributo; opcoes?: string[]; unidade?: string | null;
  obrigatorio?: boolean; filtravel?: boolean; visivel_na_loja?: boolean; ordem?: number; ativo?: boolean;
}
export interface DadosFamilia { codigo?: string; nome?: string; ativo?: boolean; atributos?: number[] }

const unico = (e: unknown, msg: string) => (codigoPg(e) === PG_VIOLACAO_UNICA ? new ConflictException(msg) : e);

/** Catálogo no formato do Bagisto: categorias, atributos, famílias de atributos e a lista completa de produtos. */
@Injectable()
export class CatalogoAdminService {
  constructor(@Inject(BANCO) private readonly db: Banco, private readonly auditoria: AuditoriaService) {}

  // ---------------- produtos (lista da equipe: inclui os inativos) ----------------
  listarProdutos() {
    return this.db.selectFrom('produtos as p')
      .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
      .leftJoin('familias_atributos as f', 'f.id', 'p.familia_id')
      .select(['p.id', 'p.codigo', 'p.nome', 'p.marca', 'p.categoria_id', 'c.nome as categoria', 'p.familia_id', 'f.nome as familia',
        'p.unidade', 'p.multiplo_venda', 'p.estoque', 'p.preco_tabela_centavos', 'p.sob_orcamento', 'p.destaque', 'p.importado', 'p.ativo', 'p.ncm', 'p.atualizado_em'])
      .orderBy('p.id', 'desc').execute();
  }

  async produto(id: number) {
    const p = await this.db.selectFrom('produtos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!p) throw new NotFoundException('Produto não encontrado.');
    return p;
  }

  // ---------------- categorias ----------------
  listarCategorias() {
    return this.db.selectFrom('categorias as c')
      .select(['c.id', 'c.nome', 'c.icone', 'c.tipos_cliente', 'c.ordem', 'c.ativo',
        sql<number>`(SELECT count(*) FROM produtos p WHERE p.categoria_id = c.id)::int`.as('produtos'),
        sql<number>`(SELECT count(*) FROM produtos p WHERE p.categoria_id = c.id AND p.ativo)::int`.as('produtos_ativos')])
      .orderBy('c.ordem').orderBy('c.nome').execute();
  }

  async criarCategoria(d: DadosCategoria, autor: UsuarioAutenticado, ip: string | null) {
    const id = (d.id || d.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!id) throw new BadRequestException('Informe o nome da categoria.');
    try {
      return await this.db.transaction().execute(async (trx) => {
        const ordem = d.ordem ?? (await trx.selectFrom('categorias').select(sql<number>`coalesce(max(ordem), 0) + 1`.as('o')).executeTakeFirstOrThrow()).o;
        const c = await trx.insertInto('categorias')
          .values({ id, nome: d.nome!, icone: d.icone ?? null, tipos_cliente: d.tipos_cliente?.length ? d.tipos_cliente : null, ordem })
          .returningAll().executeTakeFirstOrThrow();
        await this.auditoria.registrar({ usuario: autor, acao: 'categoria.criar', entidade: 'categoria', entidadeId: id, depois: c, ip }, trx);
        return c;
      });
    } catch (e) { throw unico(e, 'Já existe uma categoria com este código.'); }
  }

  async alterarCategoria(id: string, d: DadosCategoria, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('categorias').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw new NotFoundException('Categoria não encontrada.');
      const set: Record<string, unknown> = {};
      if (d.nome !== undefined) set.nome = d.nome;
      if (d.icone !== undefined) set.icone = d.icone || null;
      if (d.tipos_cliente !== undefined) set.tipos_cliente = d.tipos_cliente?.length ? d.tipos_cliente : null;
      if (d.ordem !== undefined) set.ordem = d.ordem;
      if (d.ativo !== undefined) set.ativo = d.ativo;
      if (!Object.keys(set).length) return antes;
      const depois = await trx.updateTable('categorias').set(set).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'categoria.alterar', entidade: 'categoria', entidadeId: id, antes, depois, ip }, trx);
      return depois;
    });
  }

  // ---------------- atributos ----------------
  listarAtributos() {
    return this.db.selectFrom('atributos as a')
      .select(['a.id', 'a.codigo', 'a.nome', 'a.tipo', 'a.opcoes', 'a.unidade', 'a.obrigatorio', 'a.filtravel', 'a.visivel_na_loja', 'a.ordem', 'a.ativo',
        sql<number>`(SELECT count(*) FROM familia_atributos fa WHERE fa.atributo_id = a.id)::int`.as('familias'),
        sql<number>`(SELECT count(*) FROM produtos p WHERE p.atributos ? a.codigo)::int`.as('produtos')])
      .orderBy('a.ordem').orderBy('a.nome').execute();
  }

  private conferirAtributo(d: DadosAtributo) {
    if (d.tipo === 'lista' && d.opcoes !== undefined && d.opcoes.filter((o) => o.trim()).length < 2) throw new BadRequestException('Uma lista precisa de pelo menos duas opções.');
  }

  async criarAtributo(d: DadosAtributo, autor: UsuarioAutenticado, ip: string | null) {
    this.conferirAtributo(d);
    if (d.tipo === 'lista' && !d.opcoes?.length) throw new BadRequestException('Uma lista precisa de pelo menos duas opções.');
    try {
      return await this.db.transaction().execute(async (trx) => {
        const a = await trx.insertInto('atributos').values({
          codigo: d.codigo!, nome: d.nome!, tipo: d.tipo!, opcoes: (d.opcoes ?? []).map((o) => o.trim()).filter(Boolean), unidade: d.unidade || null,
          obrigatorio: d.obrigatorio ?? false, filtravel: d.filtravel ?? false, visivel_na_loja: d.visivel_na_loja ?? true, ordem: d.ordem ?? 0,
        }).returningAll().executeTakeFirstOrThrow();
        await this.auditoria.registrar({ usuario: autor, acao: 'atributo.criar', entidade: 'atributo', entidadeId: a.id, depois: a, ip }, trx);
        return a;
      });
    } catch (e) { throw unico(e, 'Já existe um atributo com este código.'); }
  }

  async alterarAtributo(id: number, d: DadosAtributo, autor: UsuarioAutenticado, ip: string | null) {
    this.conferirAtributo(d);
    return this.db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('atributos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw new NotFoundException('Atributo não encontrado.');
      const { codigo: _c, ...resto } = d;   // o código não muda (os produtos guardam os valores por ele)
      const set = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined).map(([k, v]) => [k, k === 'opcoes' ? (v as string[]).map((o) => o.trim()).filter(Boolean) : k === 'unidade' ? (v || null) : v]));
      if (!Object.keys(set).length) return antes;
      const depois = await trx.updateTable('atributos').set(set).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'atributo.alterar', entidade: 'atributo', entidadeId: id, antes, depois, ip }, trx);
      return depois;
    });
  }

  // ---------------- famílias de atributos ----------------
  async listarFamilias() {
    const familias = await this.db.selectFrom('familias_atributos as f')
      .select(['f.id', 'f.codigo', 'f.nome', 'f.ativo', sql<number>`(SELECT count(*) FROM produtos p WHERE p.familia_id = f.id)::int`.as('produtos')])
      .orderBy('f.nome').execute();
    const ligacoes = await this.db.selectFrom('familia_atributos as fa').innerJoin('atributos as a', 'a.id', 'fa.atributo_id')
      .select(['fa.familia_id', 'a.id', 'a.codigo', 'a.nome', 'a.tipo', 'a.opcoes', 'a.unidade', 'a.obrigatorio', 'fa.ordem'])
      .orderBy('fa.ordem').execute();
    return familias.map((f) => ({ ...f, atributos: ligacoes.filter((l) => l.familia_id === f.id).map(({ familia_id: _f, ...a }) => a) }));
  }

  private async ligar(trx: Transaction<Database>, familiaId: number, atributos: number[]) {
    await trx.deleteFrom('familia_atributos').where('familia_id', '=', familiaId).execute();
    const unicos = [...new Set(atributos)];
    if (unicos.length) {
      const achados = await trx.selectFrom('atributos').select('id').where('id', 'in', unicos).execute();
      if (achados.length !== unicos.length) throw new BadRequestException('Há atributo inexistente na lista.');
      await trx.insertInto('familia_atributos').values(unicos.map((atributo_id, ordem) => ({ familia_id: familiaId, atributo_id, ordem }))).execute();
    }
  }

  async criarFamilia(d: DadosFamilia, autor: UsuarioAutenticado, ip: string | null) {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const f = await trx.insertInto('familias_atributos').values({ codigo: d.codigo!, nome: d.nome! }).returningAll().executeTakeFirstOrThrow();
        await this.ligar(trx, f.id, d.atributos ?? []);
        await this.auditoria.registrar({ usuario: autor, acao: 'familia.criar', entidade: 'familia_atributos', entidadeId: f.id, depois: { ...f, atributos: d.atributos }, ip }, trx);
        return f;
      });
    } catch (e) { throw unico(e, 'Já existe uma família com este código.'); }
  }

  async alterarFamilia(id: number, d: DadosFamilia, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('familias_atributos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw new NotFoundException('Família não encontrada.');
      const atributosAntes = (await trx.selectFrom('familia_atributos').select('atributo_id').where('familia_id', '=', id).orderBy('ordem').execute()).map((x) => x.atributo_id);
      const set: Record<string, unknown> = {};
      if (d.nome !== undefined) set.nome = d.nome;
      if (d.ativo !== undefined) set.ativo = d.ativo;
      const depois = Object.keys(set).length ? await trx.updateTable('familias_atributos').set(set).where('id', '=', id).returningAll().executeTakeFirstOrThrow() : antes;
      if (d.atributos !== undefined) await this.ligar(trx, id, d.atributos);
      await this.auditoria.registrar({ usuario: autor, acao: 'familia.alterar', entidade: 'familia_atributos', entidadeId: id,
        antes: { ...antes, atributos: atributosAntes }, depois: { ...depois, atributos: d.atributos ?? atributosAntes }, ip }, trx);
      return depois;
    });
  }
}
