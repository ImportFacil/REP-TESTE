import { sql } from 'kysely';
import type { Banco } from '../banco/banco.module';

/** Família de cada categoria (os produtos novos sem família entram na da sua categoria). */
export const FAMILIA_POR_CATEGORIA: Array<[string, (categoria: string) => boolean]> = [
  ['ferramentas_eletrica', (c) => ['d-ferr', 'd-eletr', 'r-ferr', 'r-luz', 'r-auto', 'c-ene'].includes(c)],
  ['construcao_casa', (c) => ['d-hidr', 'd-fix', 'd-util', 'r-casa', 'r-tint', 'c-eq', 'c-and', 'c-hid'].includes(c)],
  ['epi', (c) => ['epis', 'c-epi', 'roupas'].includes(c)],
  ['hospitalar', (c) => c.startsWith('h-')],
  ['agro', (c) => !/^.-/.test(c)],
];

/** Nomes das especificações que viram cada atributo (a primeira que aparecer no produto). */
export const ATRIBUTO_POR_ESPECIFICACAO: Record<string, string[]> = {
  linha: ['Linha'], material: ['Material'], potencia: ['Potência'], tensao: ['Tensão', 'Alimentação'],
  capacidade: ['Capacidade', 'Volume', 'Carga'], medidas: ['Medida', 'Comprimento', 'Largura', 'Tamanho', 'Diâmetro'],
  garantia: ['Garantia'], norma: ['Norma', 'CA', 'Segurança', 'Proteção'], registro_anvisa: ['Registro ANVISA'],
  esterilidade: ['Esterilidade'], embalagem: ['Caixa', 'Pacote', 'Embalagem', 'Unidade'], uso: ['Uso', 'Aplicação', 'Compatibilidade'],
};

/** Põe família e valores de atributos nos produtos que ainda não têm família (catálogo recém-carregado). */
export async function classificarProdutosSemFamilia(db: Banco): Promise<number> {
  const familias = await db.selectFrom('familias_atributos').select(['id', 'codigo']).execute();
  const produtos = await db.selectFrom('produtos').select(['id', 'categoria_id', 'especificacoes', 'atributos']).where('familia_id', 'is', null).execute();
  for (const p of produtos) {
    const codigo = FAMILIA_POR_CATEGORIA.find(([, regra]) => regra(p.categoria_id))?.[0];
    const familia = familias.find((f) => f.codigo === codigo);
    const valores: Record<string, string> = { ...(p.atributos ?? {}) };
    for (const [atributo, nomes] of Object.entries(ATRIBUTO_POR_ESPECIFICACAO)) {
      if (valores[atributo]) continue;
      const e = (p.especificacoes ?? []).find((x) => nomes.includes(x.nome));
      if (e) valores[atributo] = e.valor;
    }
    await db.updateTable('produtos').set({ familia_id: familia?.id ?? null, atributos: sql`${JSON.stringify(valores)}::jsonb` }).where('id', '=', p.id).execute();
  }
  return produtos.length;
}
