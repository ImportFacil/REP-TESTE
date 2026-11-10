/**
 * Documentos do cadastro de crédito (documento de arquitetura, "Política de crédito").
 */
export const DOCUMENTOS = {
  ficha_cadastral: 'Ficha cadastral assinada, com autorização de consulta a bureaus de crédito',
  cartao_cnpj: 'Cartão CNPJ e inscrição estadual ativa',
  contrato_social: 'Contrato social e última alteração (ou estatuto e ata de eleição da diretoria)',
  documentos_socios: 'Documento com foto e CPF dos sócios ou administradores',
  comprovante_endereco: 'Comprovante de endereço da empresa',
  faturamento_12m: 'Faturamento dos últimos 12 meses, assinado pelo contador',
  referencias: 'Três referências comerciais e uma bancária',
  balanco_dre: 'Balanço e DRE do último exercício',
  estatuto_ocb: 'Estatuto, ata da diretoria e registro na OCB',
  inscricao_estadual: 'Comprovação de inscrição estadual ativa (Sintegra)',
  crea_cau: 'Registro no CREA ou CAU do responsável técnico',
  cnes_licenca: 'CNES e licença sanitária',
  radar: 'Habilitação no RADAR (Siscomex)',
  contrato_modalidade: 'Contrato de encomenda ou de conta e ordem',
  outro: 'Outro documento',
} as const;

export type TipoDocumento = keyof typeof DOCUMENTOS;

const COMUNS: TipoDocumento[] = [
  'ficha_cadastral', 'cartao_cnpj', 'contrato_social', 'documentos_socios', 'comprovante_endereco', 'faturamento_12m', 'referencias',
];
const POR_TIPO: Record<string, TipoDocumento[]> = {
  cooperativa: ['estatuto_ocb'],
  distribuidora: ['inscricao_estadual'],
  revendedor: ['inscricao_estadual'],
  construtora: ['crea_cau'],
  hospital: ['cnes_licenca'],
};
/** Acima deste limite solicitado, pede balanço e DRE. */
export const LIMITE_EXIGE_BALANCO_CENTAVOS = 10_000_000;

export function documentosExigidos(tipoCliente: string, limiteSolicitado: number | null): TipoDocumento[] {
  return [
    ...COMUNS,
    ...(POR_TIPO[tipoCliente] ?? []),
    ...((limiteSolicitado ?? 0) > LIMITE_EXIGE_BALANCO_CENTAVOS ? (['balanco_dre'] as TipoDocumento[]) : []),
  ];
}
