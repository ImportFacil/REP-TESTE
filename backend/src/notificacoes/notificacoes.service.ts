import { Inject, Injectable } from '@nestjs/common';
import { BANCO, type Banco } from '../banco/banco.module';

/**
 * Registro dos avisos (e-mail e, depois, WhatsApp). A chave é única, então rodar a régua
 * duas vezes no mesmo dia não manda o mesmo aviso de novo.
 * O envio de verdade entra quando o Amazon SES e a API do WhatsApp estiverem configurados;
 * até lá os avisos ficam "pendentes" e aparecem no Painel da equipe.
 */
@Injectable()
export class NotificacoesService {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  async registrar(n: { empresaId: string | null; destinatarios: string[]; modelo: string; chave: string; dados: Record<string, unknown> }): Promise<number> {
    if (!n.destinatarios.length) return 0;
    // Modelo desativado no Painel (Marketing → Modelos de e-mail) = esse aviso não é mandado.
    const modelo = await this.db.selectFrom('modelos_email').select('ativo').where('codigo', '=', n.modelo).executeTakeFirst();
    if (modelo && !modelo.ativo) return 0;
    const r = await this.db.insertInto('notificacoes')
      .values(n.destinatarios.map((d) => ({
        empresa_id: n.empresaId, destinatario: d, canal: 'email' as const, modelo: n.modelo, chave: `${n.chave}:${d}`, dados: JSON.stringify(n.dados),
      })))
      .onConflict((oc) => oc.column('chave').doNothing())
      .returning('id').execute();
    return r.length;
  }

  /** E-mails de quem aprova compras na empresa (recebem os avisos de cobrança). */
  async contatosFinanceiros(empresaId: string): Promise<string[]> {
    const r = await this.db.selectFrom('usuarios').select('email')
      .where('empresa_id', '=', empresaId).where('ativo', '=', true).where('papel', '=', 'aprovador').execute();
    return r.map((u) => u.email);
  }
}
