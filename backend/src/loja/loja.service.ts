import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Endereco } from '../banco/tipos';
import { CatalogoService } from '../catalogo/catalogo.service';

/** A loja no formato do Bagisto: favoritos, endereços de entrega e listas de compra da empresa. */
@Injectable()
export class LojaService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly catalogo: CatalogoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Produtos visíveis ao cliente, com o preço dele, na ordem dos ids pedidos (some o que saiu do catálogo). */
  private async produtos(u: UsuarioAutenticado, ids: number[]) {
    if (!ids.length) return [];
    const r = await this.catalogo.listarProdutos(u, { ids: ids.slice(0, 200).join(','), por_pagina: 200, pagina: 1 });
    const porId = new Map(r.itens.map((p) => [p.id, p]));
    return ids.map((id) => porId.get(id)).filter((p) => !!p);
  }

  // ---------- favoritos ----------

  async idsFavoritos(u: UsuarioAutenticado) {
    return (await this.db.selectFrom('favoritos').select('produto_id').where('usuario_id', '=', u.id).execute()).map((f) => f.produto_id);
  }

  async favoritos(u: UsuarioAutenticado) {
    const ids = (await this.db.selectFrom('favoritos').select('produto_id').where('usuario_id', '=', u.id).orderBy('criado_em', 'desc').execute()).map((f) => f.produto_id);
    return this.produtos(u, ids);
  }

  async favoritar(u: UsuarioAutenticado, produtoId: number) {
    await this.catalogo.obterProduto(u, produtoId);
    await this.db.insertInto('favoritos').values({ usuario_id: u.id, produto_id: produtoId }).onConflict((oc) => oc.doNothing()).execute();
    return { favorito: true };
  }

  async desfavoritar(u: UsuarioAutenticado, produtoId: number) {
    await this.db.deleteFrom('favoritos').where('usuario_id', '=', u.id).where('produto_id', '=', produtoId).execute();
    return { favorito: false };
  }

  // ---------- endereços de entrega ----------

  enderecos(u: UsuarioAutenticado) {
    return this.db.selectFrom('enderecos_entrega').select(['id', 'apelido', 'endereco', 'padrao', 'ativo', 'criado_em'])
      .where('empresa_id', '=', u.empresaId!).where('ativo', '=', true).orderBy('padrao', 'desc').orderBy('apelido').execute();
  }

  async criarEndereco(u: UsuarioAutenticado, d: { apelido: string; endereco: Endereco; padrao?: boolean }, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const existe = await trx.selectFrom('enderecos_entrega').select('id').where('empresa_id', '=', u.empresaId!).where('ativo', '=', true).executeTakeFirst();
      const padrao = d.padrao || !existe; // o primeiro endereço já vira o padrão
      if (padrao) await trx.updateTable('enderecos_entrega').set({ padrao: false }).where('empresa_id', '=', u.empresaId!).where('padrao', '=', true).execute();
      const e = await trx.insertInto('enderecos_entrega').values({ empresa_id: u.empresaId!, apelido: d.apelido, endereco: JSON.stringify(d.endereco), padrao, criado_por: u.id })
        .returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: u, acao: 'endereco.criar', entidade: 'empresa', entidadeId: u.empresaId!, depois: e, ip }, trx);
      return e;
    });
  }

  async alterarEndereco(u: UsuarioAutenticado, id: number, d: { apelido?: string; endereco?: Endereco; padrao?: boolean; ativo?: boolean }, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('enderecos_entrega').selectAll().where('id', '=', id).where('empresa_id', '=', u.empresaId!).forUpdate().executeTakeFirst();
      if (!antes || !antes.ativo) throw new NotFoundException('Endereço não encontrado.');
      if (d.ativo === false && antes.padrao) throw new BadRequestException('Escolha outro endereço como padrão antes de tirar este.');
      if (d.padrao) await trx.updateTable('enderecos_entrega').set({ padrao: false }).where('empresa_id', '=', u.empresaId!).where('id', '<>', id).where('padrao', '=', true).execute();
      const e = await trx.updateTable('enderecos_entrega').set({
        ...(d.apelido !== undefined && { apelido: d.apelido }), ...(d.endereco && { endereco: JSON.stringify(d.endereco) }),
        ...(d.padrao !== undefined && { padrao: d.padrao }), ...(d.ativo !== undefined && { ativo: d.ativo }),
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: u, acao: 'endereco.alterar', entidade: 'empresa', entidadeId: u.empresaId!, antes, depois: e, ip }, trx);
      return e;
    });
  }

  /** O endereço pertence à empresa e está ativo? Devolve o endereço para gravar no pedido. */
  async enderecoDaEmpresa(empresaId: string, id: number): Promise<Endereco> {
    const e = await this.db.selectFrom('enderecos_entrega').select('endereco').where('id', '=', id).where('empresa_id', '=', empresaId).where('ativo', '=', true).executeTakeFirst();
    if (!e) throw new BadRequestException('Endereço de entrega não encontrado.');
    return e.endereco;
  }

  // ---------- listas de compra (da empresa: todos os usuários dela veem e usam) ----------

  listas(u: UsuarioAutenticado) {
    return this.db.selectFrom('listas_compra as l').leftJoin('usuarios as us', 'us.id', 'l.criado_por')
      .select(['l.id', 'l.nome', 'l.criado_em', 'l.atualizado_em', 'us.nome as criado_por',
        sql<number>`(select count(*)::int from lista_itens i where i.lista_id = l.id)`.as('itens')])
      .where('l.empresa_id', '=', u.empresaId!).where('l.ativo', '=', true).orderBy('l.atualizado_em', 'desc').execute();
  }

  private async lista(u: UsuarioAutenticado, id: number) {
    const l = await this.db.selectFrom('listas_compra').selectAll().where('id', '=', id).where('empresa_id', '=', u.empresaId!).where('ativo', '=', true).executeTakeFirst();
    if (!l) throw new NotFoundException('Lista não encontrada.');
    return l;
  }

  async detalheLista(u: UsuarioAutenticado, id: number) {
    const l = await this.lista(u, id);
    const itens = await this.db.selectFrom('lista_itens').select(['produto_id', 'quantidade']).where('lista_id', '=', id).execute();
    const produtos = await this.produtos(u, itens.map((i) => i.produto_id));
    const qtd = new Map(itens.map((i) => [i.produto_id, i.quantidade]));
    return {
      id: l.id, nome: l.nome, atualizado_em: l.atualizado_em,
      itens: produtos.map((p) => ({ produto: p, quantidade: qtd.get(p.id)! })),
      indisponiveis: itens.length - produtos.length,
    };
  }

  async criarLista(u: UsuarioAutenticado, nome: string, itens: Array<{ produto_id: number; quantidade: number }> = []) {
    const l = await this.db.insertInto('listas_compra').values({ empresa_id: u.empresaId!, nome: nome.trim(), criado_por: u.id }).returningAll().executeTakeFirstOrThrow();
    if (itens.length) await this.adicionarItens(u, l.id, itens);
    return this.detalheLista(u, l.id);
  }

  async alterarLista(u: UsuarioAutenticado, id: number, d: { nome?: string; ativo?: boolean }) {
    await this.lista(u, id);
    await this.db.updateTable('listas_compra').set({ ...(d.nome && { nome: d.nome.trim() }), ...(d.ativo !== undefined && { ativo: d.ativo }) }).where('id', '=', id).execute();
    return d.ativo === false ? { removida: true } : this.detalheLista(u, id);
  }

  /** Soma as quantidades aos itens que já estão na lista (ex.: "guardar o carrinho na lista"). */
  async adicionarItens(u: UsuarioAutenticado, id: number, itens: Array<{ produto_id: number; quantidade: number }>) {
    await this.lista(u, id);
    const visiveis = new Set((await this.produtos(u, [...new Set(itens.map((i) => i.produto_id))])).map((p) => p.id));
    const fora = itens.filter((i) => !visiveis.has(i.produto_id));
    if (fora.length) throw new BadRequestException(`Produtos fora do seu catálogo: ${fora.map((i) => i.produto_id).join(', ')}.`);
    for (const i of itens) {
      await this.db.insertInto('lista_itens').values({ lista_id: id, produto_id: i.produto_id, quantidade: i.quantidade })
        .onConflict((oc) => oc.columns(['lista_id', 'produto_id']).doUpdateSet({ quantidade: sql`lista_itens.quantidade + excluded.quantidade` })).execute();
    }
    await this.db.updateTable('listas_compra').set({ atualizado_em: new Date() }).where('id', '=', id).execute();
    return this.detalheLista(u, id);
  }

  /** Define a quantidade de um item; zero tira o item da lista. */
  async definirItem(u: UsuarioAutenticado, id: number, produtoId: number, quantidade: number) {
    await this.lista(u, id);
    if (quantidade === 0) await this.db.deleteFrom('lista_itens').where('lista_id', '=', id).where('produto_id', '=', produtoId).execute();
    else {
      await this.catalogo.obterProduto(u, produtoId);
      await this.db.insertInto('lista_itens').values({ lista_id: id, produto_id: produtoId, quantidade })
        .onConflict((oc) => oc.columns(['lista_id', 'produto_id']).doUpdateSet({ quantidade })).execute();
    }
    await this.db.updateTable('listas_compra').set({ atualizado_em: new Date() }).where('id', '=', id).execute();
    return this.detalheLista(u, id);
  }
}
