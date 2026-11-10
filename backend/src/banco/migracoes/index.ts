import type { Migration } from 'kysely';
import * as m0001 from './0001_inicial';
import * as m0002 from './0002_venda_credito_importacao';
import * as m0003 from './0003_painel_vendas_catalogo';
import * as m0004 from './0004_clientes_marketing_conteudo';
import * as m0005 from './0005_relatorios_configuracoes';
import * as m0006 from './0006_loja';
import * as m0007 from './0007_b2b';

/**
 * Lista de migrações, em ordem. Cada nova migração ganha um arquivo
 * `NNNN_descricao.ts` e uma linha aqui. Migrações já aplicadas nunca mudam.
 */
export const MIGRACOES: Record<string, Migration> = {
  '0001_inicial': m0001,
  '0002_venda_credito_importacao': m0002,
  '0003_painel_vendas_catalogo': m0003,
  '0004_clientes_marketing_conteudo': m0004,
  '0005_relatorios_configuracoes': m0005,
  '0006_loja': m0006,
  '0007_b2b': m0007,
};
