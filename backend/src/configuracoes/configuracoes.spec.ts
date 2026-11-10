import { calcularTributos, escolherRegra, ratear, type RegraImposto } from './impostos';
import { diferencas, lerCsv, lerLinhas, lerPreco } from './planilha';

const REGRAS: RegraImposto[] = [
  { id: 1, nome: 'Nacional', ncm_prefixo: null, uf: null, origem: 'nacional', aliquota_federal_bp: 1345, aliquota_estadual_bp: 1800 },
  { id: 2, nome: 'Importado', ncm_prefixo: null, uf: null, origem: 'importado', aliquota_federal_bp: 1545, aliquota_estadual_bp: 1800 },
  { id: 3, nome: 'MT', ncm_prefixo: null, uf: 'MT', origem: null, aliquota_federal_bp: 1345, aliquota_estadual_bp: 1700 },
  { id: 4, nome: 'NCM 84', ncm_prefixo: '84', uf: null, origem: null, aliquota_federal_bp: 1015, aliquota_estadual_bp: 1200 },
];

describe('impostos', () => {
  it('escolhe a regra mais específica: NCM, depois UF, depois origem', () => {
    expect(escolherRegra(REGRAS, { ncm: '8433.51.00', importado: true }, 'MT')?.id).toBe(4);
    expect(escolherRegra(REGRAS, { ncm: '3926.20.00', importado: true }, 'MT')?.id).toBe(3);
    expect(escolherRegra(REGRAS, { ncm: '39262000', importado: true }, 'SP')?.id).toBe(2);
    expect(escolherRegra(REGRAS, { ncm: null, importado: false }, null)?.id).toBe(1);
    expect(escolherRegra(REGRAS.filter((r) => r.origem !== 'nacional' && !r.uf && !r.ncm_prefixo), { ncm: null, importado: false }, null)).toBeNull();
  });

  it('rateia o valor da nota pelos itens sem perder centavo', () => {
    expect(ratear(1000, [1, 1, 1])).toEqual([333, 333, 334]);
    expect(ratear(0, [5, 5])).toEqual([0, 0]);
    expect(ratear(500, [0, 0])).toEqual([0, 0]);
  });

  it('soma os tributos por item com a regra de cada um', () => {
    const t = calcularTributos(REGRAS, [
      { ncm: '84335100', importado: false, valor_centavos: 100_000 },
      { ncm: '39262000', importado: false, valor_centavos: 100_000 },
    ], 180_000, 'SP'); // nota com desconto: 1.800,00 rateado em 900 + 900
    expect(t.federal_centavos).toBe(Math.round(90_000 * 0.1015) + Math.round(90_000 * 0.1345));
    expect(t.estadual_centavos).toBe(Math.round(90_000 * 0.12) + Math.round(90_000 * 0.18));
    expect(t.total_centavos).toBe(t.federal_centavos + t.estadual_centavos);
    expect(t.regras.map((r) => [r.id, r.base_centavos])).toEqual([[4, 90_000], [1, 90_000]]);
  });
});

describe('planilha de produtos', () => {
  it('lê ";" ou ",", aspas e BOM', () => {
    expect(lerCsv('\uFEFFcodigo;nome\r\nA1;"Luva; nitrílica"\n\n')).toEqual([['codigo', 'nome'], ['A1', 'Luva; nitrílica']]);
    expect(lerCsv('codigo,nome\nA1,"Diz ""oi"""')).toEqual([['codigo', 'nome'], ['A1', 'Diz "oi"']]);
  });

  it('entende os formatos de preço brasileiros', () => {
    expect(lerPreco('1.234,56')).toBe(123_456);
    expect(lerPreco('R$ 89,9')).toBe(8_990);
    expect(lerPreco('1234.5')).toBe(123_450);
    expect(lerPreco('1.234')).toBe(123_400);
    expect(lerPreco('abc')).toBeNull();
  });

  it('valida cada linha, aceita sinônimos no cabeçalho e aponta códigos repetidos', () => {
    const r = lerLinhas('SKU;Produto;Preço de tabela;Estoque;Múltiplo de venda;NCM;Situação;Cor\nab-1;Luva;12,50;100;10;4015.19.00;sim;azul\nAB-1;Outra;x;-1;0;123;talvez;\n;Sem código;1;1;1;;;');
    expect(r.erroGeral).toBeNull();
    expect(r.ignoradas).toEqual(['Cor']);
    expect(r.linhas[0]).toMatchObject({ linha: 2, codigo: 'AB-1', erros: [], valores: { nome: 'Luva', preco_tabela_centavos: 1250, estoque: 100, multiplo_venda: 10, ncm: '40151900', ativo: true } });
    expect(r.linhas[1].erros).toEqual(['Preço inválido: x.', 'Estoque inválido: -1.', 'Múltiplo de venda inválido: 0.', 'NCM precisa de 8 dígitos: 123.', 'Ativo deve ser sim ou não: talvez.', 'Código repetido (também na linha 2).']);
    expect(r.linhas[2].erros).toEqual(['Sem código.']);
    expect(lerLinhas('nome\nLuva').erroGeral).toMatch(/codigo/);
  });

  it('a prévia mostra só o que muda', () => {
    expect(diferencas({ nome: 'Luva', estoque: 10, ativo: true }, { nome: 'Luva', estoque: 12, ativo: true })).toEqual({ estoque: { de: 10, para: 12 } });
  });
});
