import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Database } from '../banco/tipos';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { hojeBrasil } from '../pagamentos/regras';
import { EXEMPLO, renderizar, variaveisDesconhecidas, variaveisDoAviso } from './modelos';
import { descontoPromocao, melhorAutomatica, motivoInvalida, normalizarCupom, type RegraPromocao } from './promocoes';

export interface DadosPromocao {
  nome: string; descricao?: string | null; cupom?: string | null; tipo_desconto: 'percentual' | 'valor_fixo';
  desconto_bp?: number | null; desconto_centavos?: number | null; tipos_cliente?: string[] | null; categorias?: string[] | null;
  subtotal_minimo_centavos?: number; inicio?: string | null; fim?: string | null; limite_usos?: number | null; limite_por_empresa?: number | null; ativo?: boolean;
}

export interface PromocaoAplicada { id: number; nome: string; cupom: string | null; desconto_centavos: number }

/** Marketing no formato do Bagisto: promoções e cupons, newsletter, modelos de e-mail e caixa de saída. */
@Injectable()
export class MarketingService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly auditoria: AuditoriaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Conexão padrão, para quem avalia promoção fora de uma transação. */
  get banco(): Banco { return this.db; }

  // ---------- promoções ----------

  /**
   * Promoção para um carrinho: a do cupom (se informado e válido) ou a automática de maior desconto.
   * Com `travar`, segura as linhas das promoções até o fim da transação (limite de usos sem corrida).
   */
  async avaliar(
    db: Kysely<Database>, c: { empresaId: string; tipoCliente: string }, itens: Array<{ produto_id: number; total_centavos: number }>,
    subtotal: number, cupomDigitado?: string | null, travar = false,
  ): Promise<{ promocao: PromocaoAplicada | null; cupom_erro: string | null }> {
    const cupom = normalizarCupom(cupomDigitado);
    let q = db.selectFrom('promocoes').selectAll().where('ativo', '=', true)
      .where((eb) => (cupom ? eb.or([eb('cupom', 'is', null), eb('cupom', '=', cupom)]) : eb('cupom', 'is', null)));
    if (travar) q = q.forUpdate();
    const promos = await q.orderBy('id').execute();
    let cupomErro: string | null = null;
    if (cupom && !promos.some((p) => p.cupom === cupom)) {
      const inativa = await db.selectFrom('promocoes').select('id').where('cupom', '=', cupom).executeTakeFirst();
      cupomErro = inativa ? 'Este cupom não está ativo.' : 'Cupom não encontrado.';
    }
    if (!promos.length || !itens.length) return { promocao: null, cupom_erro: cupomErro };

    const categorias = new Map((await db.selectFrom('produtos').select(['id', 'categoria_id']).where('id', 'in', itens.map((i) => i.produto_id)).execute())
      .map((p) => [p.id, p.categoria_id]));
    const carrinho = itens.map((i) => ({ categoria_id: categorias.get(i.produto_id) ?? '', total_centavos: i.total_centavos }));
    const usos = await db.selectFrom('pedidos').select(['promocao_id', sql<number>`count(*)::int`.as('total'),
      sql<number>`(count(*) FILTER (WHERE empresa_id = ${c.empresaId}))::int`.as('da_empresa')])
      .where('promocao_id', 'in', promos.map((p) => p.id)).where('situacao', '<>', 'cancelado').groupBy('promocao_id').execute();
    const uso = new Map(usos.map((u) => [u.promocao_id, { total: u.total, daEmpresa: u.da_empresa }]));
    const hoje = hojeBrasil();
    const avaliadas = promos.map((p) => {
      const regra = p as RegraPromocao;
      return {
        p: regra,
        desconto: descontoPromocao(regra, carrinho),
        motivo: motivoInvalida(regra, { tipoCliente: c.tipoCliente, hoje, subtotal, itens: carrinho, uso: uso.get(p.id) ?? { total: 0, daEmpresa: 0 } }),
      };
    });
    const doCupom = cupom ? avaliadas.find((a) => a.p.cupom === cupom) : undefined;
    if (doCupom && doCupom.motivo) cupomErro = doCupom.motivo;
    const escolhida = doCupom && !doCupom.motivo ? doCupom : melhorAutomatica(avaliadas);
    return {
      promocao: escolhida ? { id: escolhida.p.id, nome: escolhida.p.nome, cupom: escolhida.p.cupom, desconto_centavos: escolhida.desconto } : null,
      cupom_erro: cupomErro,
    };
  }

  async listarPromocoes() {
    return this.db.selectFrom('promocoes as pr')
      .selectAll('pr')
      .select([
        sql<number>`(select count(*)::int from pedidos p where p.promocao_id = pr.id and p.situacao <> 'cancelado')`.as('usos'),
        sql<number>`(select coalesce(sum(p.promocao_centavos), 0)::bigint from pedidos p where p.promocao_id = pr.id and p.situacao <> 'cancelado')`.as('descontado_centavos'),
      ])
      .orderBy('pr.id', 'desc').execute();
  }

  async criarPromocao(d: DadosPromocao, autor: UsuarioAutenticado, ip: string | null) {
    const v = this.validarPromocao(d);
    try {
      const p = await this.db.insertInto('promocoes').values(v).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'promocao.criar', entidade: 'promocao', entidadeId: p.id, depois: p, ip });
      return p;
    } catch (e) {
      throw this.cupomRepetido(e);
    }
  }

  async alterarPromocao(id: number, d: Partial<DadosPromocao>, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.db.selectFrom('promocoes').selectAll().where('id', '=', id).executeTakeFirst();
    if (!antes) throw new NotFoundException('Promoção não encontrada.');
    const mudou = Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
    const v = this.validarPromocao({ ...(antes as DadosPromocao), ...mudou });
    try {
      const p = await this.db.updateTable('promocoes').set(v).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'promocao.alterar', entidade: 'promocao', entidadeId: id, antes, depois: p, ip });
      return p;
    } catch (e) {
      throw this.cupomRepetido(e);
    }
  }

  private validarPromocao(d: DadosPromocao) {
    const cupom = normalizarCupom(d.cupom);
    if (cupom && !/^[A-Z0-9_-]{3,30}$/.test(cupom)) throw new BadRequestException('Cupom: de 3 a 30 letras, números, "-" ou "_".');
    if (d.tipo_desconto === 'percentual' && !(d.desconto_bp && d.desconto_bp >= 1 && d.desconto_bp <= 9000)) throw new BadRequestException('Informe o percentual de desconto (até 90%).');
    if (d.tipo_desconto === 'valor_fixo' && !(d.desconto_centavos && d.desconto_centavos > 0)) throw new BadRequestException('Informe o valor do desconto.');
    if (d.inicio && d.fim && d.fim < d.inicio) throw new BadRequestException('O fim vem antes do início.');
    return {
      nome: d.nome, descricao: d.descricao || null, cupom, tipo_desconto: d.tipo_desconto,
      desconto_bp: d.tipo_desconto === 'percentual' ? d.desconto_bp! : null,
      desconto_centavos: d.tipo_desconto === 'valor_fixo' ? d.desconto_centavos! : null,
      tipos_cliente: d.tipos_cliente?.length ? d.tipos_cliente : null, categorias: d.categorias?.length ? d.categorias : null,
      subtotal_minimo_centavos: d.subtotal_minimo_centavos ?? 0, inicio: d.inicio || null, fim: d.fim || null,
      limite_usos: d.limite_usos || null, limite_por_empresa: d.limite_por_empresa || null, ativo: d.ativo ?? true,
    };
  }

  private cupomRepetido(e: unknown) {
    return (e as { code?: string }).code === '23505' ? new ConflictException('Já existe uma promoção com este cupom.') : e;
  }

  // ---------- newsletter ----------

  /** Inscreve (ou reativa) um e-mail. Quem já está inscrito não recebe as boas-vindas de novo. */
  async inscrever(d: { email: string; nome?: string | null; origem: 'loja' | 'painel' | 'cadastro'; empresaId?: string | null }) {
    const email = d.email.trim().toLowerCase();
    const atual = await this.db.selectFrom('newsletter_inscritos').selectAll().where('email', '=', email).executeTakeFirst();
    if (atual?.ativo) return { inscrito: true, novo: false };
    const r = atual
      ? await this.db.updateTable('newsletter_inscritos').set({ ativo: true, cancelado_em: null, inscrito_em: new Date(), nome: d.nome || atual.nome })
        .where('id', '=', atual.id).returningAll().executeTakeFirstOrThrow()
      : await this.db.insertInto('newsletter_inscritos').values({ email, nome: d.nome || null, origem: d.origem, empresa_id: d.empresaId ?? null })
        .returningAll().executeTakeFirstOrThrow();
    await this.notificacoes.registrar({
      empresaId: r.empresa_id, destinatarios: [email], modelo: 'newsletter_boas_vindas',
      chave: `newsletter:${r.id}:${new Date(r.inscrito_em).getTime()}`, dados: { link_sair: `/newsletter/sair/?t=${r.token}` },
    });
    return { inscrito: true, novo: true };
  }

  async cancelarInscricao(token: string) {
    const r = await this.db.updateTable('newsletter_inscritos').set({ ativo: false, cancelado_em: new Date() })
      .where('token', '=', token).where('ativo', '=', true).returning('email').executeTakeFirst();
    if (!r) {
      const existe = await this.db.selectFrom('newsletter_inscritos').select('id').where('token', '=', token).executeTakeFirst();
      if (!existe) throw new NotFoundException('Inscrição não encontrada.');
    }
    return { cancelado: true };
  }

  listarInscritos() {
    return this.db.selectFrom('newsletter_inscritos as n').leftJoin('empresas as e', 'e.id', 'n.empresa_id')
      .select(['n.id', 'n.email', 'n.nome', 'n.origem', 'n.ativo', 'n.inscrito_em', 'n.cancelado_em', 'e.razao_social'])
      .orderBy('n.inscrito_em', 'desc').limit(10_000).execute();
  }

  async alterarInscrito(id: number, ativo: boolean, autor: UsuarioAutenticado, ip: string | null) {
    const r = await this.db.updateTable('newsletter_inscritos').set(ativo ? { ativo: true, cancelado_em: null } : { ativo: false, cancelado_em: new Date() })
      .where('id', '=', id).returningAll().executeTakeFirst();
    if (!r) throw new NotFoundException('Inscrição não encontrada.');
    await this.auditoria.registrar({ usuario: autor, acao: ativo ? 'newsletter.reativar' : 'newsletter.cancelar', entidade: 'newsletter', entidadeId: id, ip });
    return r;
  }

  // ---------- modelos de e-mail ----------

  listarModelos() {
    return this.db.selectFrom('modelos_email as m')
      .selectAll('m')
      .select(sql<number>`(select count(*)::int from notificacoes n where n.modelo = m.codigo)`.as('avisos'))
      .orderBy('m.nome').execute();
  }

  async alterarModelo(codigo: string, d: { assunto?: string; corpo?: string; ativo?: boolean }, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.db.selectFrom('modelos_email').selectAll().where('codigo', '=', codigo).executeTakeFirst();
    if (!antes) throw new NotFoundException('Modelo não encontrado.');
    const erradas = variaveisDesconhecidas(`${d.assunto ?? ''} ${d.corpo ?? ''}`, antes.variaveis);
    if (erradas.length) throw new BadRequestException(`Variáveis que este modelo não tem: ${erradas.map((v) => `{{${v}}}`).join(', ')}. Use: ${antes.variaveis.map((v) => `{{${v}}}`).join(', ')}.`);
    const m = await this.db.updateTable('modelos_email').set({ ...d, atualizado_por: autor.id }).where('codigo', '=', codigo).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: 'modelo_email.alterar', entidade: 'modelo_email', entidadeId: codigo, antes, depois: m, ip });
    return m;
  }

  /** Prévia com dados de exemplo; aceita o texto ainda não salvo. */
  async previa(codigo: string, d: { assunto?: string; corpo?: string }) {
    const m = await this.db.selectFrom('modelos_email').selectAll().where('codigo', '=', codigo).executeTakeFirst();
    if (!m) throw new NotFoundException('Modelo não encontrado.');
    const assunto = d.assunto ?? m.assunto;
    const corpo = d.corpo ?? m.corpo;
    return { assunto: renderizar(assunto, EXEMPLO), corpo: renderizar(corpo, EXEMPLO), desconhecidas: variaveisDesconhecidas(`${assunto} ${corpo}`, m.variaveis) };
  }

  /** Avisos registrados (régua de cobrança, envios, newsletter) já com o assunto montado. */
  async caixaDeSaida() {
    const [avisos, modelos] = await Promise.all([
      this.db.selectFrom('notificacoes as n').leftJoin('empresas as e', 'e.id', 'n.empresa_id')
        .select(['n.id', 'n.destinatario', 'n.canal', 'n.modelo', 'n.situacao', 'n.criado_em', 'n.enviado_em', 'n.dados', 'e.razao_social'])
        .orderBy('n.id', 'desc').limit(2000).execute(),
      this.db.selectFrom('modelos_email').select(['codigo', 'nome', 'assunto', 'corpo']).execute(),
    ]);
    const porCodigo = new Map(modelos.map((m) => [m.codigo, m]));
    return avisos.map(({ dados, ...a }) => {
      const m = porCodigo.get(a.modelo);
      const v = { ...variaveisDoAviso(dados), empresa: a.razao_social ?? '' };
      return { ...a, modelo_nome: m?.nome ?? a.modelo, assunto: m ? renderizar(m.assunto, v) : a.modelo, corpo: m ? renderizar(m.corpo, v) : '' };
    });
  }
}
