import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { META_ACESSO, META_PUBLICO, type RegraAcesso } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import { classificarProdutosSemFamilia } from '../catalogo/familias';
import { diferencas, lerLinhas, type LinhaLida } from './planilha';
import { buscarPtaxDolar } from './ptax';

export interface DadosRegra { nome: string; ncm_prefixo?: string | null; uf?: string | null; origem?: 'nacional' | 'importado' | null; aliquota_federal_bp: number; aliquota_estadual_bp: number; ativo?: boolean }
export interface DadosLocal { codigo: string; nome: string; cidade: string; uf: string; prioridade?: number; ativo?: boolean }

const PAPEIS = ['comercial', 'financeiro', 'administrador', 'comprador', 'aprovador'] as const;
const CAMPOS_PRODUTO = ['nome', 'categoria_id', 'preco_tabela_centavos', 'estoque', 'multiplo_venda', 'unidade', 'marca', 'ncm', 'ativo'] as const;

const FONTE_PTAX = 'PTAX venda (Banco Central, automática)';

/** Configurações no formato do Bagisto: permissões, impostos, locais de estoque, câmbio e importação de produtos. */
@Injectable()
export class ConfiguracoesService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly auditoria: AuditoriaService,
    private readonly descoberta: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  // ---------- papéis e permissões (lidos das próprias rotas: é o que o sistema realmente aplica) ----------

  permissoes() {
    const linhas: Array<{ area: string; metodo: string; caminho: string; descricao: string; publico: boolean; origem: string | null; papeis: string[] }> = [];
    for (const w of this.descoberta.getControllers()) {
      const classe = w.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!classe || !w.instance) continue;
      const base = (Reflect.getMetadata('path', classe) as string | undefined) ?? '';
      const tags = (Reflect.getMetadata('swagger/apiUseTags', classe) as string[] | undefined) ?? [];
      const proto = Object.getPrototypeOf(w.instance) as Record<string, unknown>;
      for (const nome of this.scanner.getAllMethodNames(proto)) {
        const fn = proto[nome] as (...a: unknown[]) => unknown;
        const caminho = Reflect.getMetadata('path', fn) as string | undefined;
        const metodo = Reflect.getMetadata('method', fn) as number | undefined;
        if (caminho === undefined || metodo === undefined) continue;
        const publico = !!this.reflector.getAllAndOverride<boolean>(META_PUBLICO, [fn, classe]);
        const regra = this.reflector.getAllAndOverride<RegraAcesso | undefined>(META_ACESSO, [fn, classe]);
        const op = Reflect.getMetadata('swagger/apiOperation', fn) as { summary?: string } | undefined;
        const completo = `/${[base, caminho].map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`;
        const papeis = publico ? [...PAPEIS]
          : !regra ? [...PAPEIS]
            : regra.papeis.length ? regra.papeis
              : PAPEIS.filter((p) => (regra.origem === 'equipe' ? ['comercial', 'financeiro', 'administrador'] : ['comprador', 'aprovador']).includes(p));
        linhas.push({
          area: tags[0] ?? 'Geral', metodo: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'][metodo] ?? String(metodo),
          caminho: completo, descricao: op?.summary ?? '', publico, origem: publico ? null : regra?.origem ?? null, papeis,
        });
      }
    }
    return linhas.sort((a, b) => a.area.localeCompare(b.area) || a.caminho.localeCompare(b.caminho) || a.metodo.localeCompare(b.metodo));
  }

  // ---------- regras de impostos ----------

  listarRegras() {
    return this.db.selectFrom('regras_impostos').selectAll().orderBy('ativo', 'desc').orderBy('id').execute();
  }

  async criarRegra(d: DadosRegra, autor: UsuarioAutenticado, ip: string | null) {
    const r = await this.db.insertInto('regras_impostos').values(this.regra(d)).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: 'imposto.criar', entidade: 'regra_imposto', entidadeId: r.id, depois: r, ip });
    return r;
  }

  async alterarRegra(id: number, d: Partial<DadosRegra>, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.db.selectFrom('regras_impostos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw new NotFoundException('Regra não encontrada.');
    const mudou = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
    const r = await this.db.updateTable('regras_impostos').set(this.regra({ ...antes, ...mudou } as DadosRegra)).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: 'imposto.alterar', entidade: 'regra_imposto', entidadeId: id, antes, depois: r, ip });
    return r;
  }

  private regra(d: DadosRegra) {
    return {
      nome: d.nome, ncm_prefixo: d.ncm_prefixo?.replace(/\D/g, '') || null, uf: d.uf?.toUpperCase() || null, origem: d.origem || null,
      aliquota_federal_bp: d.aliquota_federal_bp, aliquota_estadual_bp: d.aliquota_estadual_bp, ativo: d.ativo ?? true,
    };
  }

  // ---------- locais de estoque ----------

  listarLocais() {
    return this.db.selectFrom('locais_estoque as l')
      .selectAll('l')
      .select([
        sql<number>`(select coalesce(sum(quantidade), 0)::int from estoque_locais e where e.local_id = l.id)`.as('unidades'),
        sql<number>`(select count(*)::int from estoque_locais e where e.local_id = l.id and e.quantidade > 0)`.as('produtos'),
      ])
      .orderBy('l.prioridade').orderBy('l.id').execute();
  }

  async criarLocal(d: DadosLocal, autor: UsuarioAutenticado, ip: string | null) {
    try {
      const l = await this.db.insertInto('locais_estoque').values({ ...d, uf: d.uf.toUpperCase() }).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'local_estoque.criar', entidade: 'local_estoque', entidadeId: l.id, depois: l, ip });
      return l;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Já existe um local com este código.');
      throw e;
    }
  }

  async alterarLocal(id: number, d: Partial<Omit<DadosLocal, 'codigo'>>, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.db.selectFrom('locais_estoque').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw new NotFoundException('Local não encontrado.');
    if (d.ativo === false) {
      const outro = await this.db.selectFrom('locais_estoque').select('id').where('ativo', '=', true).where('id', '<>', id).executeTakeFirst();
      if (!outro) throw new BadRequestException('Mantenha ao menos um local ativo: é para ele que vão as entradas de estoque.');
    }
    const l = await this.db.updateTable('locais_estoque').set({ ...d, ...(d.uf ? { uf: d.uf.toUpperCase() } : {}) }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: 'local_estoque.alterar', entidade: 'local_estoque', entidadeId: id, antes, depois: l, ip });
    return l;
  }

  async estoqueDoProduto(produtoId: number) {
    const p = await this.db.selectFrom('produtos').select(['id', 'codigo', 'nome', 'estoque', 'unidade']).where('id', '=', produtoId).executeTakeFirst();
    if (!p) throw new NotFoundException('Produto não encontrado.');
    const locais = await this.db.selectFrom('locais_estoque as l')
      .leftJoin('estoque_locais as e', (j) => j.onRef('e.local_id', '=', 'l.id').on('e.produto_id', '=', produtoId))
      .select(['l.id as local_id', 'l.codigo', 'l.nome', 'l.cidade', 'l.uf', 'l.ativo', 'l.prioridade', sql<number>`coalesce(e.quantidade, 0)`.as('quantidade')])
      .orderBy('l.prioridade').orderBy('l.id').execute();
    return { ...p, locais };
  }

  /** Grava a quantidade de cada local; o estoque do produto vira a soma (pelo gatilho do banco). */
  async definirEstoque(produtoId: number, locais: Array<{ local_id: number; quantidade: number }>, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.estoqueDoProduto(produtoId);
    const validos = new Set(antes.locais.map((l) => l.local_id));
    for (const l of locais) if (!validos.has(l.local_id)) throw new BadRequestException(`Local ${l.local_id} não existe.`);
    await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('produtos').select('id').where('id', '=', produtoId).forUpdate().execute();
      for (const l of locais) {
        await trx.insertInto('estoque_locais').values({ produto_id: produtoId, local_id: l.local_id, quantidade: l.quantidade })
          .onConflict((oc) => oc.columns(['produto_id', 'local_id']).doUpdateSet({ quantidade: l.quantidade })).execute();
      }
    });
    const depois = await this.estoqueDoProduto(produtoId);
    await this.auditoria.registrar({ usuario: autor, acao: 'estoque.locais', entidade: 'produto', entidadeId: produtoId,
      antes: antes.locais.map((l) => ({ [l.codigo]: l.quantidade })), depois: depois.locais.map((l) => ({ [l.codigo]: l.quantidade })), ip });
    return depois;
  }

  // ---------- câmbio ----------

  listarCambio() {
    return this.db.selectFrom('cotacoes_cambio as c').leftJoin('usuarios as u', 'u.id', 'c.criado_por')
      .select(['c.id', 'c.moeda', 'c.data', 'c.taxa', 'c.fonte', 'c.criado_em', 'u.nome as criado_por'])
      .orderBy('c.data', 'desc').orderBy('c.moeda').limit(2000).execute();
  }

  /** A cotação mais recente de cada moeda. */
  async cambioAtual() {
    const r = await sql<{ moeda: string; data: string; taxa: number }>`
      SELECT DISTINCT ON (moeda) moeda, data, taxa FROM cotacoes_cambio ORDER BY moeda, data DESC`.execute(this.db);
    return r.rows.map((x) => ({ ...x, taxa: Number(x.taxa) }));
  }

  private readonly log = new Logger('Cambio');
  private ptax: { em: number; valor: { data: string; taxa: number } | null } | null = null;

  /**
   * O dólar do dia para a calculadora de importação: a PTAX de venda mais recente do Banco Central
   * (consultada no máximo a cada 30 minutos e gravada no histórico de câmbio). Sem resposta do Banco Central,
   * vale a última cotação cadastrada em Configurações → Câmbio.
   */
  async dolarDoDia(buscar: () => Promise<{ data: string; taxa: number } | null> = buscarPtaxDolar) {
    if (!this.ptax || Date.now() - this.ptax.em > (this.ptax.valor ? 30 : 2) * 60_000) {
      this.ptax = { em: Date.now(), valor: await buscar().catch(() => null) };
      const v = this.ptax.valor;
      this.log.log(v ? `Dólar do dia: PTAX de venda ${v.taxa} (${v.data}), Banco Central` : 'Dólar do dia: sem resposta do Banco Central; vale a última cotação cadastrada');
      if (v) {
        await this.db.insertInto('cotacoes_cambio').values({ moeda: 'USD', data: v.data, taxa: v.taxa, fonte: FONTE_PTAX, criado_por: null })
          .onConflict((oc) => oc.columns(['moeda', 'data']).doUpdateSet({ taxa: v.taxa, fonte: FONTE_PTAX, criado_por: null }).where('cotacoes_cambio.taxa', '<>', v.taxa))
          .execute();
      }
    }
    if (this.ptax.valor) return { moeda: 'USD', ...this.ptax.valor, fonte: FONTE_PTAX, origem: 'banco_central' as const };
    const c = await this.db.selectFrom('cotacoes_cambio').select(['data', 'taxa', 'fonte']).where('moeda', '=', 'USD').orderBy('data', 'desc').limit(1).executeTakeFirst();
    return c ? { moeda: 'USD', data: String(c.data), taxa: Number(c.taxa), fonte: c.fonte, origem: 'cadastro' as const } : null;
  }

  /** Registra (ou corrige) a cotação do dia; a correção fica na auditoria. */
  async registrarCambio(d: { moeda: 'USD' | 'EUR' | 'CNY'; data: string; taxa: number; fonte?: string }, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.db.selectFrom('cotacoes_cambio').selectAll().where('moeda', '=', d.moeda).where('data', '=', d.data).executeTakeFirst();
    const c = await this.db.insertInto('cotacoes_cambio').values({ moeda: d.moeda, data: d.data, taxa: d.taxa, fonte: d.fonte || 'manual', criado_por: autor.id })
      .onConflict((oc) => oc.columns(['moeda', 'data']).doUpdateSet({ taxa: d.taxa, fonte: d.fonte || 'manual', criado_por: autor.id }))
      .returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: antes ? 'cambio.corrigir' : 'cambio.registrar', entidade: 'cambio', entidadeId: c.id, antes, depois: c, ip });
    return { ...c, taxa: Number(c.taxa) };
  }

  // ---------- importação de produtos por planilha ----------

  /** Lê a planilha e diz, linha a linha, o que vai acontecer (sem gravar nada). */
  async previa(texto: string) {
    const lido = lerLinhas(texto);
    if (lido.erroGeral) throw new BadRequestException(lido.erroGeral);
    if (lido.linhas.length > 5000) throw new BadRequestException('Envie no máximo 5.000 linhas por vez.');
    const [cats, atuais] = await Promise.all([
      this.db.selectFrom('categorias').select('id').execute(),
      this.db.selectFrom('produtos').select(['id', 'codigo', ...CAMPOS_PRODUTO]).where('codigo', 'in', lido.linhas.map((l) => l.codigo).filter(Boolean).concat('')).execute(),
    ]);
    const categorias = new Set(cats.map((c) => c.id));
    const porCodigo = new Map(atuais.map((p) => [p.codigo, p]));
    const linhas = lido.linhas.map((l) => {
      const erros = [...l.erros];
      if (l.valores.categoria_id && !categorias.has(l.valores.categoria_id)) erros.push(`Categoria não existe: ${l.valores.categoria_id}.`);
      const atual = porCodigo.get(l.codigo);
      if (!atual && !erros.length) {
        for (const [campo, nome] of [['nome', 'nome'], ['categoria_id', 'categoria'], ['preco_tabela_centavos', 'preço']] as const) {
          if (l.valores[campo] === undefined) erros.push(`Produto novo precisa de ${nome}.`);
        }
      }
      const mudancas = atual ? diferencas(atual as unknown as Record<string, unknown>, l.valores) : {};
      const acao = erros.length ? 'erro' : !atual ? 'criar' : Object.keys(mudancas).length ? 'alterar' : 'sem_mudanca';
      return { linha: l.linha, codigo: l.codigo, acao, erros, mudancas, valores: l.valores, produto_id: atual?.id ?? null };
    });
    const conta = (a: string) => linhas.filter((l) => l.acao === a).length;
    return { linhas, ignoradas: lido.ignoradas, resumo: { total: linhas.length, criar: conta('criar'), alterar: conta('alterar'), sem_mudanca: conta('sem_mudanca'), erro: conta('erro') } };
  }

  /** Grava as linhas válidas numa transação só; as com erro ficam de fora e vão para o histórico. */
  async aplicar(texto: string, arquivo: string, autor: UsuarioAutenticado, ip: string | null) {
    const p = await this.previa(texto);
    let criados = 0;
    let alterados = 0;
    await this.db.transaction().execute(async (trx) => {
      for (const l of p.linhas) {
        const v = l.valores as LinhaLida['valores'];
        if (l.acao === 'criar') {
          await trx.insertInto('produtos').values({
            codigo: l.codigo, nome: v.nome!, categoria_id: v.categoria_id!, preco_tabela_centavos: v.preco_tabela_centavos!, estoque: v.estoque ?? 0,
            multiplo_venda: v.multiplo_venda ?? 1, unidade: v.unidade ?? 'un', marca: v.marca ?? null, ncm: v.ncm ?? null, ativo: v.ativo ?? true,
            especificacoes: '[]',
          }).execute();
          criados++;
        } else if (l.acao === 'alterar') {
          const set = Object.fromEntries(Object.keys(l.mudancas).map((k) => [k, (v as Record<string, unknown>)[k]]));
          await trx.updateTable('produtos').set(set).where('id', '=', l.produto_id!).execute();
          alterados++;
        }
      }
      const erros = p.linhas.filter((l) => l.acao === 'erro').map((l) => ({ linha: l.linha, mensagens: l.erros }));
      await trx.insertInto('importacoes_produtos').values({
        arquivo, linhas: p.resumo.total, criados, alterados, com_erro: erros.length, erros: JSON.stringify(erros), criado_por: autor.id,
      }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'produtos.importar', entidade: 'importacao', entidadeId: arquivo, depois: { criados, alterados, com_erro: erros.length }, ip }, trx);
    });
    if (criados) await classificarProdutosSemFamilia(this.db);
    return { ...p.resumo, criados, alterados };
  }

  historicoImportacoes() {
    return this.db.selectFrom('importacoes_produtos as i').leftJoin('usuarios as u', 'u.id', 'i.criado_por')
      .select(['i.id', 'i.arquivo', 'i.linhas', 'i.criados', 'i.alterados', 'i.com_erro', 'i.erros', 'i.criado_em', 'u.nome as criado_por'])
      .orderBy('i.id', 'desc').limit(100).execute();
  }
}
