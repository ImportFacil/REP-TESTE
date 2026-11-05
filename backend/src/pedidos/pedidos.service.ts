import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Endereco, FormaPagamento, SituacaoPedido } from '../banco/tipos';
import { CatalogoService } from '../catalogo/catalogo.service';
import { limites } from '../comum/paginacao';
import { PagamentosService } from '../pagamentos/pagamentos.service';
import { PoliticaService } from '../pagamentos/politica.service';
import { descontoPix, dividir, parcelamentoCartao, vencimentosBoleto, hojeBrasil } from '../pagamentos/regras';

export interface NovoPedido {
  itens: Array<{ produto_id: number; quantidade: number }>;
  forma_pagamento: FormaPagamento;
  parcelas?: number;
  token_cartao?: string;
  endereco_entrega?: Endereco;
  observacao?: string;
}

/** Próximo passo permitido na logística do pedido. */
const PROXIMA: Partial<Record<SituacaoPedido, SituacaoPedido>> = { novo: 'em_separacao', em_separacao: 'enviado', enviado: 'entregue' };
const NOMES: Record<SituacaoPedido, string> = { novo: 'Novo', em_separacao: 'Em separação', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado' };

/** Módulo "Pedidos": fechamento com preço congelado, condições de pagamento e andamento. */
@Injectable()
export class PedidosService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly catalogo: CatalogoService,
    private readonly pagamentos: PagamentosService,
    private readonly politica: PoliticaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Opções de pagamento para um subtotal: Pix com desconto, boleto (se o crédito permitir) e cartão. */
  async condicoes(u: UsuarioAutenticado, subtotal: number) {
    const pol = await this.politica.atual();
    const credito = await this.pagamentos.resumoCredito(u.empresaId!);
    const desconto = descontoPix(subtotal, pol.pix_desconto_bp);
    const hoje = hojeBrasil();
    let motivoBoleto = credito.motivo_bloqueio;
    if (!motivoBoleto && subtotal > credito.disponivel_centavos) {
      motivoBoleto = `O pedido passa do limite disponível (R$ ${(credito.disponivel_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`;
    }
    return {
      gateway_habilitado: this.pagamentos.nomeGateway !== null,
      pix: { desconto_centavos: desconto, total_centavos: subtotal - desconto, validade_horas: pol.pix_validade_horas },
      boleto: {
        disponivel: motivoBoleto === null,
        motivo: motivoBoleto,
        opcoes: Array.from({ length: credito.max_parcelas_boleto }, (_, k) => k + 1).map((n) => ({
          parcelas: n, valores_centavos: dividir(subtotal, n), vencimentos_previstos: vencimentosBoleto(hoje, n),
        })),
        observacao: 'Os boletos são emitidos no faturamento, junto com a nota fiscal; os vencimentos contam a partir dele.',
      },
      cartao: Array.from({ length: pol.cartao_max_parcelas }, (_, k) => k + 1).map((n) => {
        const r = parcelamentoCartao(subtotal, n, pol.cartao_sem_juros_ate, pol.cartao_juros_am_bp);
        return { parcelas: n, valor_parcela_centavos: r.valores[r.valores.length - 1], total_centavos: r.total, juros_centavos: r.juros, sem_juros: r.juros === 0 };
      }),
      credito,
    };
  }

  async criar(u: UsuarioAutenticado, dto: NovoPedido, ip: string | null) {
    if (u.situacaoEmpresa !== 'ativa') throw new ForbiddenException('A empresa está bloqueada para novos pedidos. Fale com a ImportFácil.');
    const cot = await this.catalogo.cotar(u, { itens: dto.itens });
    if (!cot.pode_fechar) {
      throw new BadRequestException({
        message: cot.atinge_pedido_minimo ? 'Há itens com problema (múltiplo de venda, estoque ou produto sob orçamento).' : 'O pedido não atinge o pedido mínimo do seu tipo de cliente.',
        cotacao: cot,
      });
    }
    const parcelas = dto.parcelas ?? 1;
    const subtotal = cot.subtotal_centavos;

    return this.db.transaction().execute(async (trx) => {
      // Trava o cadastro da empresa para que dois pedidos no boleto não usem o mesmo limite ao mesmo tempo.
      await trx.selectFrom('cadastros_credito').select('empresa_id').where('empresa_id', '=', u.empresaId!).forUpdate().execute();
      const pol = await this.politica.atual(trx);
      let desconto = 0;
      let juros = 0;
      let total = subtotal;
      let situacaoPagamento: 'aguardando_pagamento' | 'aguardando_faturamento' | 'pago';

      if (dto.forma_pagamento === 'pix') {
        if (parcelas !== 1) throw new BadRequestException('Pix é à vista.');
        desconto = descontoPix(subtotal, pol.pix_desconto_bp);
        total = subtotal - desconto;
        situacaoPagamento = 'aguardando_pagamento';
      } else if (dto.forma_pagamento === 'cartao') {
        if (parcelas > pol.cartao_max_parcelas) throw new BadRequestException(`O cartão aceita até ${pol.cartao_max_parcelas} parcelas.`);
        if (!dto.token_cartao) throw new BadRequestException('Informe o token do cartão gerado pelo formulário do gateway.');
        const r = parcelamentoCartao(subtotal, parcelas, pol.cartao_sem_juros_ate, pol.cartao_juros_am_bp);
        total = r.total;
        juros = r.juros;
        situacaoPagamento = 'pago';
      } else {
        const credito = await this.pagamentos.resumoCredito(u.empresaId!, trx);
        if (credito.bloqueado) throw new ForbiddenException(credito.motivo_bloqueio);
        if (parcelas > credito.max_parcelas_boleto) throw new BadRequestException(`O boleto da sua empresa vai até ${credito.max_parcelas_boleto} parcelas.`);
        if (subtotal > credito.disponivel_centavos) throw new ForbiddenException('O pedido passa do limite de crédito disponível.');
        situacaoPagamento = 'aguardando_faturamento';
      }
      if (dto.forma_pagamento !== 'boleto') this.pagamentos.gw(); // 503 se pagamentos não estiverem habilitados

      const pedido = await trx.insertInto('pedidos').values({
        empresa_id: u.empresaId!, comprador_id: u.id, tipo_cliente: cot.tipo_cliente, forma_pagamento: dto.forma_pagamento, parcelas,
        subtotal_centavos: subtotal, desconto_centavos: desconto, juros_centavos: juros, total_centavos: total,
        situacao_pagamento: situacaoPagamento, politica_id: pol.id,
        endereco_entrega: dto.endereco_entrega ? JSON.stringify(dto.endereco_entrega) : null, observacao: dto.observacao ?? null,
      }).returningAll().executeTakeFirstOrThrow();

      for (const i of cot.itens) {
        const baixa = await trx.updateTable('produtos').set({ estoque: sql`estoque - ${i.quantidade}` })
          .where('id', '=', i.produto_id).where('estoque', '>=', i.quantidade).executeTakeFirst();
        if (Number(baixa.numUpdatedRows) !== 1) throw new ConflictException(`Estoque insuficiente para ${i.nome}. Atualize o carrinho.`);
      }
      await trx.insertInto('pedido_itens').values(cot.itens.map((i) => ({
        pedido_id: pedido.id, produto_id: i.produto_id, codigo: i.codigo, nome: i.nome, unidade: i.unidade, quantidade: i.quantidade,
        preco_tabela_centavos: i.preco_tabela_centavos, preco_unitario_centavos: i.preco_unitario_centavos, total_centavos: i.total_centavos,
      }))).execute();
      await trx.insertInto('pedido_eventos').values({ pedido_id: pedido.id, tipo: 'criado', usuario_id: u.id, descricao: `Pedido feito por ${u.nome} (${descreverPagamento(dto.forma_pagamento, parcelas)}).` }).execute();

      if (dto.forma_pagamento === 'pix') {
        await this.pagamentos.criarPix(trx, { pedidoId: pedido.id }, total, `Pedido ${pedido.id} ImportFácil`);
      } else if (dto.forma_pagamento === 'cartao') {
        const r = await this.pagamentos.cobrarCartao(trx, pedido.id, total, parcelas, dto.token_cartao!, `Pedido ${pedido.id} ImportFácil`);
        if (!r.aprovado) throw new HttpException(r.motivo, HttpStatus.PAYMENT_REQUIRED);
        await trx.insertInto('pedido_eventos').values({ pedido_id: pedido.id, tipo: 'pagamento', usuario_id: null, descricao: 'Cartão aprovado.' }).execute();
      }
      await this.auditoria.registrar({ usuario: u, acao: 'pedido.criar', entidade: 'pedido', entidadeId: pedido.id, depois: { total, forma: dto.forma_pagamento, parcelas }, ip }, trx);
      return pedido.id;
    }).then((id) => this.detalhe(id, u.empresaId!));
  }

  async listar(f: { empresaId?: string; situacao?: string; situacao_pagamento?: string; pagina?: number; por_pagina?: number }) {
    const { limite, deslocamento, pagina } = limites(f, 20);
    let q = this.db.selectFrom('pedidos as p').innerJoin('empresas as e', 'e.id', 'p.empresa_id');
    if (f.empresaId) q = q.where('p.empresa_id', '=', f.empresaId);
    if (f.situacao) q = q.where('p.situacao', '=', f.situacao as never);
    if (f.situacao_pagamento) q = q.where('p.situacao_pagamento', '=', f.situacao_pagamento as never);
    const [itens, total] = await Promise.all([
      q.selectAll('p').select(['e.razao_social', sql<number>`(select count(*)::int from pedido_itens i where i.pedido_id = p.id)`.as('qtd_itens')])
        .orderBy('p.id', 'desc').limit(limite).offset(deslocamento).execute(),
      q.select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow(),
    ]);
    return { itens, total: total.n, pagina, por_pagina: limite };
  }

  /** Detalhe do pedido. `empresaId` presente = acesso de cliente, preso à própria empresa. */
  async detalhe(id: number, empresaId?: string) {
    let q = this.db.selectFrom('pedidos as p').innerJoin('empresas as e', 'e.id', 'p.empresa_id').innerJoin('usuarios as u', 'u.id', 'p.comprador_id')
      .selectAll('p').select(['e.razao_social', 'e.cnpj', 'u.nome as comprador']).where('p.id', '=', id);
    if (empresaId) q = q.where('p.empresa_id', '=', empresaId);
    const pedido = await q.executeTakeFirst();
    if (!pedido) throw new NotFoundException('Pedido não encontrado.');
    const [itens, eventos, cobrancas] = await Promise.all([
      this.db.selectFrom('pedido_itens').selectAll().where('pedido_id', '=', id).orderBy('id').execute(),
      this.db.selectFrom('pedido_eventos').selectAll().where('pedido_id', '=', id).orderBy('id').execute(),
      this.db.selectFrom('cobrancas').selectAll().where('pedido_id', '=', id).orderBy('id').execute(),
    ]);
    const parcelas = cobrancas.length
      ? await this.db.selectFrom('parcelas').selectAll().where('cobranca_id', 'in', cobrancas.map((c) => c.id)).orderBy('numero').execute()
      : [];
    return {
      ...pedido,
      situacao_nome: NOMES[pedido.situacao],
      itens,
      eventos,
      cobrancas: cobrancas.map((c) => ({ ...c, parcelas: parcelas.filter((p) => p.cobranca_id === c.id) })),
    };
  }

  /** Gera um novo Pix para um pedido cujo Pix expirou. */
  async novoPix(id: number, u: UsuarioAutenticado) {
    await this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos').selectAll().where('id', '=', id).where('empresa_id', '=', u.empresaId!).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      if (p.forma_pagamento !== 'pix' || p.situacao_pagamento !== 'pix_expirado') throw new BadRequestException('Só pedidos com Pix expirado ganham um novo Pix.');
      await this.pagamentos.cancelarPendentes(trx, { pedidoId: id });
      await this.pagamentos.criarPix(trx, { pedidoId: id }, p.total_centavos, `Pedido ${id} ImportFácil`);
      await trx.updateTable('pedidos').set({ situacao_pagamento: 'aguardando_pagamento' }).where('id', '=', id).execute();
      await trx.insertInto('pedido_eventos').values({ pedido_id: id, tipo: 'novo_pix', usuario_id: u.id, descricao: 'Novo Pix gerado.' }).execute();
    });
    return this.detalhe(id, u.empresaId!);
  }

  /** Itens de um pedido antigo, para montar o carrinho de novo (com os preços de hoje). */
  async itensParaRecompra(id: number, empresaId: string) {
    const p = await this.db.selectFrom('pedidos').select('id').where('id', '=', id).where('empresa_id', '=', empresaId).executeTakeFirst();
    if (!p) throw new NotFoundException('Pedido não encontrado.');
    return this.db.selectFrom('pedido_itens').select(['produto_id', 'quantidade']).where('pedido_id', '=', id).execute();
  }

  // ---------- Painel da equipe ----------

  /** Avança a logística. Pix só sai do "novo" depois de pago; boleto, depois de faturado. */
  async avancar(id: number, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      const para = PROXIMA[p.situacao];
      if (!para) throw new BadRequestException(`O pedido está "${NOMES[p.situacao]}" e não avança mais.`);
      if (p.situacao === 'novo') {
        const liberado = p.forma_pagamento === 'boleto' ? ['em_aberto', 'pago'].includes(p.situacao_pagamento) : p.situacao_pagamento === 'pago';
        if (!liberado) {
          throw new BadRequestException(p.forma_pagamento === 'boleto' ? 'Fature o pedido antes de separar.' : 'O pagamento ainda não foi confirmado pelo banco.');
        }
      }
      await trx.updateTable('pedidos').set({ situacao: para }).where('id', '=', id).execute();
      await trx.insertInto('pedido_eventos').values({ pedido_id: id, tipo: 'situacao', usuario_id: autor.id, descricao: `${NOMES[para]}.` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'pedido.avancar', entidade: 'pedido', entidadeId: id, antes: { situacao: p.situacao }, depois: { situacao: para }, ip }, trx);
    });
    return this.detalhe(id);
  }

  /** Faturamento do boleto: emite os boletos (30/60/90/120 a partir de hoje). A NF-e vem do ERP na fase 3. */
  async faturar(id: number, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      if (p.forma_pagamento !== 'boleto' || p.situacao_pagamento !== 'aguardando_faturamento' || p.situacao === 'cancelado') {
        throw new BadRequestException('Só pedidos no boleto aguardando faturamento podem ser faturados.');
      }
      await this.pagamentos.criarBoletos(trx, id, p.total_centavos, p.parcelas, `Pedido ${id} ImportFácil`);
      await trx.updateTable('pedidos').set({ situacao_pagamento: 'em_aberto', faturado_em: new Date() }).where('id', '=', id).execute();
      await trx.insertInto('pedido_eventos').values({ pedido_id: id, tipo: 'faturado', usuario_id: autor.id, descricao: `Faturado: ${p.parcelas} boleto(s) emitido(s).` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'pedido.faturar', entidade: 'pedido', entidadeId: id, ip }, trx);
    });
    return this.detalhe(id);
  }

  /** Cancela: devolve o estoque e cancela cobranças pendentes. Pedido pago exige estorno no gateway antes. */
  async cancelar(id: number, motivo: string, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      if (!['novo', 'em_separacao'].includes(p.situacao)) throw new BadRequestException('Só pedidos novos ou em separação podem ser cancelados.');
      const pagas = await trx.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
        .select(sql<number>`count(*)::int`.as('n')).where('c.pedido_id', '=', id).where('pa.situacao', '=', 'paga').executeTakeFirstOrThrow();
      if (pagas.n > 0) throw new ConflictException('O pedido tem pagamento confirmado: faça o estorno no gateway antes de cancelar.');
      await this.pagamentos.cancelarPendentes(trx, { pedidoId: id });
      const itens = await trx.selectFrom('pedido_itens').select(['produto_id', 'quantidade']).where('pedido_id', '=', id).execute();
      for (const i of itens) await trx.updateTable('produtos').set({ estoque: sql`estoque + ${i.quantidade}` }).where('id', '=', i.produto_id).execute();
      await trx.updateTable('pedidos').set({ situacao: 'cancelado', situacao_pagamento: 'cancelado' }).where('id', '=', id).execute();
      await trx.insertInto('pedido_eventos').values({ pedido_id: id, tipo: 'cancelado', usuario_id: autor.id, descricao: `Cancelado: ${motivo}` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'pedido.cancelar', entidade: 'pedido', entidadeId: id, antes: { situacao: p.situacao }, depois: { motivo }, ip }, trx);
    });
    return this.detalhe(id);
  }
}

function descreverPagamento(forma: FormaPagamento, parcelas: number): string {
  if (forma === 'pix') return 'Pix à vista';
  if (forma === 'boleto') return `boleto em ${parcelas}×`;
  return `cartão em ${parcelas}×`;
}
