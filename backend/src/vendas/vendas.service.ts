import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { randomInt } from 'node:crypto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { calcularTributos } from '../configuracoes/impostos';

export interface NovoEnvio { transportadora: string; codigo_rastreio?: string; volumes?: number; peso_kg?: number; observacao?: string }
export interface NovoReembolso {
  valor_centavos: number;
  motivo: string;
  devolver_estoque?: boolean;
  itens?: Array<{ produto_id: number; quantidade: number }>;
}

const MEIO_REEMBOLSO = { pix: 'pix', cartao: 'estorno_cartao', boleto: 'abatimento_boleto' } as const;

/** Chave de acesso de 44 dígitos no formato da NF-e (simulada até a integração com o ERP). */
function chaveSimulada(numero: number, cnpj: string): string {
  const agora = new Date();
  const base = `35${String(agora.getFullYear()).slice(2)}${String(agora.getMonth() + 1).padStart(2, '0')}${cnpj.replace(/\D/g, '').padStart(14, '0').slice(0, 14)}55001${String(numero).padStart(9, '0')}1${String(randomInt(0, 99_999_999)).padStart(8, '0')}`;
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  for (let i = base.length - 1, k = 0; i >= 0; i--, k++) soma += Number(base[i]) * pesos[k % 8];
  const dv = 11 - (soma % 11);
  return base + (dv >= 10 ? 0 : dv);
}

/** Vendas no formato do Bagisto: notas fiscais, envios, reembolsos e transações (pagamentos recebidos). */
@Injectable()
export class VendasService {
  constructor(@Inject(BANCO) private readonly db: Banco, private readonly auditoria: AuditoriaService, private readonly notificacoes: NotificacoesService) {}

  // ---------------- notas fiscais ----------------
  listarNotas() {
    return this.db.selectFrom('notas_fiscais as n').innerJoin('pedidos as p', 'p.id', 'n.pedido_id').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
      .select(['n.id', 'n.numero', 'n.serie', 'n.chave', 'n.valor_centavos', 'n.situacao', 'n.emitida_em', 'n.cancelada_em', 'n.motivo_cancelamento',
        'n.pedido_id', 'e.razao_social', 'e.cnpj', 'p.forma_pagamento'])
      .orderBy('n.numero', 'desc').limit(5000).execute();
  }

  async emitirNota(pedidoId: number, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos as p').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
        .select(['p.id', 'p.situacao', 'p.situacao_pagamento', 'p.total_centavos', 'e.cnpj']).where('p.id', '=', pedidoId).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      if (p.situacao === 'cancelado') throw new BadRequestException('Pedido cancelado não recebe nota fiscal.');
      if (!['pago', 'em_aberto'].includes(p.situacao_pagamento)) {
        throw new BadRequestException('Emita a nota depois do pagamento confirmado (Pix ou cartão) ou do faturamento do boleto.');
      }
      const existe = await trx.selectFrom('notas_fiscais').select('numero').where('pedido_id', '=', pedidoId).where('situacao', '=', 'emitida').executeTakeFirst();
      if (existe) throw new ConflictException(`O pedido já tem a nota fiscal nº ${existe.numero}.`);
      const { numero } = await sql<{ numero: number }>`SELECT nextval('notas_fiscais_numero')::int AS numero`.execute(trx).then((r) => r.rows[0]);
      // valor aproximado dos tributos (Lei 12.741), pelas regras de Configurações → Impostos
      const [itens, regras, destino] = await Promise.all([
        trx.selectFrom('pedido_itens as i').innerJoin('produtos as pr', 'pr.id', 'i.produto_id').select(['pr.ncm', 'pr.importado', 'i.total_centavos as valor_centavos'])
          .where('i.pedido_id', '=', pedidoId).execute(),
        trx.selectFrom('regras_impostos').select(['id', 'nome', 'ncm_prefixo', 'uf', 'origem', 'aliquota_federal_bp', 'aliquota_estadual_bp']).where('ativo', '=', true).execute(),
        trx.selectFrom('pedidos as p').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
          .select(sql<string | null>`coalesce(p.endereco_entrega->>'uf', e.endereco->>'uf')`.as('uf')).where('p.id', '=', pedidoId).executeTakeFirstOrThrow(),
      ]);
      const tributos = calcularTributos(regras, itens, p.total_centavos, destino.uf?.toUpperCase() ?? null);
      const nota = await trx.insertInto('notas_fiscais')
        .values({ pedido_id: pedidoId, numero, chave: chaveSimulada(numero, p.cnpj), valor_centavos: p.total_centavos, emitida_por: autor.id,
          tributos_centavos: tributos.total_centavos, tributos: JSON.stringify({ ...tributos, uf: destino.uf }) })
        .returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('pedido_eventos').values({ pedido_id: pedidoId, tipo: 'nota_fiscal', usuario_id: autor.id, descricao: `Nota fiscal nº ${numero} emitida.` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'nota_fiscal.emitir', entidade: 'pedido', entidadeId: pedidoId, depois: nota, ip }, trx);
      return nota;
    });
  }

  async cancelarNota(id: number, motivo: string, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const n = await trx.selectFrom('notas_fiscais').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!n) throw new NotFoundException('Nota fiscal não encontrada.');
      if (n.situacao === 'cancelada') throw new ConflictException('A nota já está cancelada.');
      const depois = await trx.updateTable('notas_fiscais').set({ situacao: 'cancelada', cancelada_em: new Date(), motivo_cancelamento: motivo })
        .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('pedido_eventos').values({ pedido_id: n.pedido_id, tipo: 'nota_fiscal', usuario_id: autor.id, descricao: `Nota fiscal nº ${n.numero} cancelada: ${motivo}` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'nota_fiscal.cancelar', entidade: 'pedido', entidadeId: n.pedido_id, antes: n, depois, ip }, trx);
      return depois;
    });
  }

  // ---------------- envios ----------------
  listarEnvios() {
    return this.db.selectFrom('envios as v').innerJoin('pedidos as p', 'p.id', 'v.pedido_id').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
      .select(['v.id', 'v.pedido_id', 'v.transportadora', 'v.codigo_rastreio', 'v.volumes', 'v.peso_kg', 'v.observacao', 'v.enviado_em', 'v.entregue_em',
        'e.razao_social', 'p.situacao', 'p.total_centavos'])
      .orderBy('v.enviado_em', 'desc').limit(5000).execute();
  }

  /** Registra a remessa e leva o pedido de "em separação" para "enviado". */
  async registrarEnvio(pedidoId: number, dto: NovoEnvio, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos').select(['id', 'situacao']).where('id', '=', pedidoId).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      if (p.situacao !== 'em_separacao') throw new BadRequestException('Registre o envio quando o pedido estiver em separação.');
      const envio = await trx.insertInto('envios').values({
        pedido_id: pedidoId, transportadora: dto.transportadora, codigo_rastreio: dto.codigo_rastreio || null, volumes: dto.volumes ?? 1,
        peso_kg: dto.peso_kg != null ? String(dto.peso_kg) : null, observacao: dto.observacao || null, criado_por: autor.id,
      }).returningAll().executeTakeFirstOrThrow();
      await trx.updateTable('pedidos').set({ situacao: 'enviado' }).where('id', '=', pedidoId).execute();
      const rastreio = dto.codigo_rastreio ? `, rastreio ${dto.codigo_rastreio}` : '';
      await trx.insertInto('pedido_eventos').values({ pedido_id: pedidoId, tipo: 'situacao', usuario_id: autor.id, descricao: `Enviado por ${dto.transportadora}${rastreio}.` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'pedido.enviar', entidade: 'pedido', entidadeId: pedidoId, antes: { situacao: p.situacao }, depois: envio, ip }, trx);
      return envio;
    }).then(async (envio) => {
      // Avisa quem comprou (modelo "Pedido enviado", editável em Marketing → Modelos de e-mail).
      const c = await this.db.selectFrom('pedidos as p').innerJoin('usuarios as u', 'u.id', 'p.comprador_id').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
        .select(['u.email', 'u.nome', 'e.razao_social', 'p.empresa_id']).where('p.id', '=', pedidoId).executeTakeFirstOrThrow();
      await this.notificacoes.registrar({
        empresaId: c.empresa_id, destinatarios: [c.email], modelo: 'pedido_enviado', chave: `envio:${envio.id}`,
        dados: { nome: c.nome, empresa: c.razao_social, pedido: pedidoId, transportadora: envio.transportadora, rastreio: envio.codigo_rastreio ?? 'não informado', volumes: envio.volumes },
      });
      return envio;
    });
  }

  /** Confirma a entrega da remessa e leva o pedido para "entregue". */
  async confirmarEntrega(envioId: number, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const v = await trx.selectFrom('envios').selectAll().where('id', '=', envioId).forUpdate().executeTakeFirst();
      if (!v) throw new NotFoundException('Envio não encontrado.');
      if (v.entregue_em) throw new ConflictException('A entrega já foi confirmada.');
      const depois = await trx.updateTable('envios').set({ entregue_em: new Date() }).where('id', '=', envioId).returningAll().executeTakeFirstOrThrow();
      const p = await trx.selectFrom('pedidos').select('situacao').where('id', '=', v.pedido_id).forUpdate().executeTakeFirstOrThrow();
      if (p.situacao === 'enviado') {
        await trx.updateTable('pedidos').set({ situacao: 'entregue' }).where('id', '=', v.pedido_id).execute();
        await trx.insertInto('pedido_eventos').values({ pedido_id: v.pedido_id, tipo: 'situacao', usuario_id: autor.id, descricao: 'Entregue.' }).execute();
      }
      await this.auditoria.registrar({ usuario: autor, acao: 'pedido.entregar', entidade: 'pedido', entidadeId: v.pedido_id, antes: v, depois, ip }, trx);
      return depois;
    });
  }

  // ---------------- reembolsos ----------------
  listarReembolsos() {
    return this.db.selectFrom('reembolsos as r').innerJoin('pedidos as p', 'p.id', 'r.pedido_id').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
      .select(['r.id', 'r.pedido_id', 'r.valor_centavos', 'r.meio', 'r.motivo', 'r.devolver_estoque', 'r.itens', 'r.criado_em', 'e.razao_social', 'p.total_centavos'])
      .orderBy('r.criado_em', 'desc').limit(5000).execute();
  }

  /**
   * Reembolso total ou parcial de um pedido pago (ou com boletos emitidos).
   * Pix: devolução por Pix; cartão: estorno; boleto: abatimento nas parcelas em aberto (as últimas primeiro).
   * Com "devolver ao estoque", as quantidades voltam para o estoque dos produtos.
   */
  async registrarReembolso(pedidoId: number, dto: NovoReembolso, autor: UsuarioAutenticado, ip: string | null) {
    return this.db.transaction().execute(async (trx) => {
      const p = await trx.selectFrom('pedidos').selectAll().where('id', '=', pedidoId).forUpdate().executeTakeFirst();
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      if (!['pago', 'em_aberto'].includes(p.situacao_pagamento)) throw new BadRequestException('Só há reembolso de pedido pago ou com boletos emitidos.');
      const ja = await trx.selectFrom('reembolsos').select(sql<number>`coalesce(sum(valor_centavos), 0)::bigint`.as('v')).where('pedido_id', '=', pedidoId).executeTakeFirstOrThrow();
      const disponivel = p.total_centavos - Number(ja.v);
      if (dto.valor_centavos > disponivel) throw new BadRequestException(`O valor passa do que ainda pode ser reembolsado (${(disponivel / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`);

      const itens = dto.devolver_estoque ? (dto.itens ?? []) : [];
      if (itens.length) {
        const pedidos = await trx.selectFrom('pedido_itens').select(['produto_id', 'quantidade']).where('pedido_id', '=', pedidoId).execute();
        const devolvidos = await trx.selectFrom('reembolsos').select('itens').where('pedido_id', '=', pedidoId).execute();
        for (const i of itens) {
          const comprado = pedidos.filter((x) => x.produto_id === i.produto_id).reduce((s, x) => s + x.quantidade, 0);
          const antes = devolvidos.flatMap((r) => r.itens).filter((x) => x.produto_id === i.produto_id).reduce((s, x) => s + x.quantidade, 0);
          if (i.quantidade > comprado - antes) throw new BadRequestException(`Quantidade a devolver do produto ${i.produto_id} passa do que foi comprado.`);
          await trx.updateTable('produtos').set({ estoque: sql`estoque + ${i.quantidade}` }).where('id', '=', i.produto_id).execute();
        }
      }

      const meio = MEIO_REEMBOLSO[p.forma_pagamento];
      if (meio === 'abatimento_boleto') {
        // abate nas parcelas em aberto, das últimas para as primeiras
        let falta = dto.valor_centavos;
        const abertas = await trx.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
          .select(['pa.id', 'pa.valor_centavos']).where('c.pedido_id', '=', pedidoId).where('pa.situacao', 'in', ['aberta', 'vencida'])
          .orderBy('pa.numero', 'desc').execute();
        for (const pa of abertas) {
          if (falta <= 0) break;
          if (pa.valor_centavos <= falta) {
            await trx.updateTable('parcelas').set({ situacao: 'cancelada' }).where('id', '=', pa.id).execute();
            falta -= pa.valor_centavos;
          } else {
            await trx.updateTable('parcelas').set({ valor_centavos: pa.valor_centavos - falta }).where('id', '=', pa.id).execute();
            falta = 0;
          }
        }
        if (falta > 0) throw new BadRequestException('Não há parcelas em aberto suficientes para abater esse valor; o restante deve ser devolvido por Pix.');
      }

      const r = await trx.insertInto('reembolsos').values({
        pedido_id: pedidoId, valor_centavos: dto.valor_centavos, meio, motivo: dto.motivo, devolver_estoque: !!dto.devolver_estoque,
        itens: JSON.stringify(itens), criado_por: autor.id,
      }).returningAll().executeTakeFirstOrThrow();
      if (dto.valor_centavos === disponivel) {
        await trx.updateTable('pedidos').set({ situacao_pagamento: 'estornado' }).where('id', '=', pedidoId).execute();
      }
      const valor = (dto.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await trx.insertInto('pedido_eventos').values({ pedido_id: pedidoId, tipo: 'reembolso', usuario_id: autor.id, descricao: `Reembolso de ${valor}: ${dto.motivo}` }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'pedido.reembolsar', entidade: 'pedido', entidadeId: pedidoId, depois: r, ip }, trx);
      return r;
    });
  }

  // ---------------- transações ----------------
  listarTransacoes() {
    return this.db.selectFrom('pagamentos as pg')
      .innerJoin('parcelas as pa', 'pa.id', 'pg.parcela_id')
      .innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .leftJoin('pedidos as p', 'p.id', 'c.pedido_id')
      .leftJoin('numerarios as nu', 'nu.id', 'c.numerario_id')
      .leftJoin('ordens_importacao as o', 'o.id', 'nu.ordem_id')
      .leftJoin('empresas as e', (j) => j.on(sql<boolean>`e.id = coalesce(p.empresa_id, o.empresa_id)`))
      .select(['pg.id', 'pg.pago_em', 'pg.valor_centavos', 'pg.meio', 'pg.id_evento_gateway', 'pa.numero as parcela', 'c.meio as cobranca_meio', 'c.gateway',
        'c.pedido_id', 'nu.ordem_id', 'e.razao_social'])
      .orderBy('pg.pago_em', 'desc').limit(5000).execute();
  }

  /** Vendas de um pedido (para a página do pedido): nota, envios e reembolsos. */
  async doPedido(pedidoId: number) {
    const [notas, envios, reembolsos] = await Promise.all([
      this.db.selectFrom('notas_fiscais').selectAll().where('pedido_id', '=', pedidoId).orderBy('emitida_em', 'desc').execute(),
      this.db.selectFrom('envios').selectAll().where('pedido_id', '=', pedidoId).orderBy('enviado_em', 'desc').execute(),
      this.db.selectFrom('reembolsos').selectAll().where('pedido_id', '=', pedidoId).orderBy('criado_em', 'desc').execute(),
    ]);
    return { notas, envios, reembolsos };
  }
}
