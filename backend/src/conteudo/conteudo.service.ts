import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';

export interface DadosPagina { slug?: string; titulo: string; resumo?: string; conteudo: string; publicada?: boolean; no_rodape?: boolean; ordem?: number }

/** "Trocas e devoluções" → "trocas-e-devolucoes". */
export function slugDe(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Conteúdo no formato do Bagisto: páginas da loja (sobre, políticas, perguntas frequentes). */
@Injectable()
export class ConteudoService {
  constructor(@Inject(BANCO) private readonly db: Banco, private readonly auditoria: AuditoriaService) {}

  /** Páginas publicadas, para o rodapé e o índice (abertas, sem login). */
  publicadas() {
    return this.db.selectFrom('paginas').select(['slug', 'titulo', 'resumo', 'no_rodape', 'ordem'])
      .where('publicada', '=', true).orderBy('ordem').orderBy('titulo').execute();
  }

  async publicada(slug: string) {
    const p = await this.db.selectFrom('paginas').select(['slug', 'titulo', 'resumo', 'conteudo', 'atualizado_em'])
      .where('slug', '=', slug).where('publicada', '=', true).executeTakeFirst();
    if (!p) throw new NotFoundException('Página não encontrada.');
    return p;
  }

  listar() {
    return this.db.selectFrom('paginas as p').leftJoin('usuarios as u', 'u.id', 'p.atualizado_por')
      .select(['p.id', 'p.slug', 'p.titulo', 'p.resumo', 'p.conteudo', 'p.publicada', 'p.no_rodape', 'p.ordem', 'p.atualizado_em', 'u.nome as atualizado_por'])
      .orderBy('p.ordem').orderBy('p.titulo').execute();
  }

  async criar(d: DadosPagina, autor: UsuarioAutenticado, ip: string | null) {
    const slug = slugDe(d.slug || d.titulo);
    if (!slug) throw new ConflictException('Informe um título com letras ou números.');
    try {
      const p = await this.db.insertInto('paginas').values({
        slug, titulo: d.titulo, resumo: d.resumo || null, conteudo: d.conteudo, publicada: d.publicada ?? false, no_rodape: d.no_rodape ?? true,
        ordem: d.ordem ?? 100, atualizado_por: autor.id,
      }).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'pagina.criar', entidade: 'pagina', entidadeId: p.id, depois: { slug, titulo: p.titulo }, ip });
      return p;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException(`Já existe uma página com o endereço "${slug}".`);
      throw e;
    }
  }

  /** O endereço (slug) não muda depois de criado: links já divulgados continuam funcionando. */
  async alterar(id: number, d: Partial<Omit<DadosPagina, 'slug'>>, autor: UsuarioAutenticado, ip: string | null) {
    const antes = await this.db.selectFrom('paginas').select(['id', 'titulo', 'publicada', 'no_rodape', 'ordem']).where('id', '=', id).executeTakeFirst();
    if (!antes) throw new NotFoundException('Página não encontrada.');
    const p = await this.db.updateTable('paginas').set({ ...d, atualizado_por: autor.id }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: autor, acao: 'pagina.alterar', entidade: 'pagina', entidadeId: id, antes, depois: { titulo: p.titulo, publicada: p.publicada, no_rodape: p.no_rodape, ordem: p.ordem }, ip });
    return p;
  }
}
