import { Inject, Injectable, Logger } from '@nestjs/common';
import { BANCO, type Banco } from '../banco/banco.module';
import { ImportacaoService } from '../importacao/importacao.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PagamentosService } from '../pagamentos/pagamentos.service';
import { diasEntre, hojeBrasil } from '../pagamentos/regras';

/** Marcos da régua de cobrança (dias em relação ao vencimento). */
const REGUA: Array<{ modelo: string; aplica: (dias: number) => boolean }> = [
  { modelo: 'lembrete_vencimento', aplica: (d) => d >= -3 && d < 0 },
  { modelo: 'vence_hoje', aplica: (d) => d === 0 },
  { modelo: 'parcela_em_atraso', aplica: (d) => d >= 1 },
  { modelo: 'aviso_negativacao', aplica: (d) => d >= 30 },
  { modelo: 'aviso_protesto', aplica: (d) => d >= 45 },
];

/**
 * Rotinas automáticas, rodadas pelo worker. Cada execução é registrada com uma referência
 * (a hora ou o dia); se dois workers tentarem ao mesmo tempo, só um roda.
 */
@Injectable()
export class RotinasService {
  private readonly log = new Logger(RotinasService.name);

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly pagamentos: PagamentosService,
    private readonly importacao: ImportacaoService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  private async umaVez(nome: string, referencia: string, rotina: () => Promise<unknown>): Promise<boolean> {
    const lote = await this.db.insertInto('rotinas_execucoes').values({ nome, referencia, concluido_em: null, resultado: null })
      .onConflict((oc) => oc.columns(['nome', 'referencia']).doNothing()).returning('nome').executeTakeFirst();
    if (!lote) return false;
    const resultado = await rotina();
    await this.db.updateTable('rotinas_execucoes').set({ concluido_em: new Date(), resultado: JSON.stringify(resultado ?? null) })
      .where('nome', '=', nome).where('referencia', '=', referencia).execute();
    this.log.log(`Rotina ${nome} (${referencia}): ${JSON.stringify(resultado)}`);
    return true;
  }

  /** Chamada a cada poucos minutos pelo worker; cada rotina roda no máximo uma vez por período. */
  async executarPendentes(agora = new Date()): Promise<void> {
    const hora = new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 13);
    const dia = hojeBrasil(agora);
    // O Pix vale 24 h: conferir a cada 15 minutos é o bastante.
    const quarto = `${hora}:${String(Math.floor(agora.getUTCMinutes() / 15) * 15).padStart(2, '0')}`;
    await this.umaVez('expirar_pix', quarto, async () => ({ expirados: await this.pagamentos.expirarPix(agora) }));
    await this.umaVez('rotina_diaria', dia, () => this.diaria(dia));
  }

  async diaria(hoje = hojeBrasil()) {
    const vencidas = await this.pagamentos.marcarVencidas(hoje);
    const orcamentos = await this.importacao.expirarOrcamentos(hoje);
    const avisos = await this.regua(hoje);
    return { parcelas_vencidas: vencidas, orcamentos_expirados: orcamentos, avisos_registrados: avisos };
  }

  /** Régua de cobrança dos boletos: lembrete, vencimento, atraso, aviso de negativação (30 dias) e de protesto (45). */
  async regua(hoje = hojeBrasil()): Promise<number> {
    const abertas = await this.db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .innerJoin('pedidos as p', 'p.id', 'c.pedido_id')
      .select(['pa.id', 'pa.numero', 'pa.valor_centavos', 'pa.vencimento', 'p.id as pedido_id', 'p.empresa_id'])
      .where('c.meio', '=', 'boleto').where('pa.situacao', 'in', ['aberta', 'vencida']).execute();
    let total = 0;
    for (const p of abertas) {
      const dias = diasEntre(p.vencimento, hoje);
      const marcos = REGUA.filter((r) => r.aplica(dias));
      if (!marcos.length) continue;
      const destinatarios = await this.notificacoes.contatosFinanceiros(p.empresa_id);
      for (const m of marcos) {
        total += await this.notificacoes.registrar({
          empresaId: p.empresa_id, destinatarios, modelo: m.modelo, chave: `parcela:${p.id}:${m.modelo}`,
          dados: { pedido: p.pedido_id, parcela: p.numero, valor_centavos: p.valor_centavos, vencimento: p.vencimento, dias },
        });
      }
    }
    return total;
  }
}
