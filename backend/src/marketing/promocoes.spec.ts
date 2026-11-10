import { renderizar, variaveisDesconhecidas, variaveisDoAviso } from './modelos';
import { descontoPromocao, melhorAutomatica, motivoInvalida, normalizarCupom, type RegraPromocao } from './promocoes';

const base: RegraPromocao = {
  id: 1, nome: 'Semana do EPI', cupom: null, tipo_desconto: 'percentual', desconto_bp: 500, desconto_centavos: null,
  tipos_cliente: null, categorias: ['epis'], subtotal_minimo_centavos: 0, inicio: null, fim: null, limite_usos: null, limite_por_empresa: null, ativo: true,
};
const itens = [{ categoria_id: 'epis', total_centavos: 100_001 }, { categoria_id: 'tratores', total_centavos: 5_000_000 }];
const ctx = { tipoCliente: 'cooperativa', hoje: '2026-11-10', subtotal: 5_100_001, itens, uso: { total: 0, daEmpresa: 0 } };

describe('promoções', () => {
  it('percentual só sobre as categorias da promoção, arredondado ao centavo', () => {
    expect(descontoPromocao(base, itens)).toBe(5_000); // 5% de 1.000,01 = 50,0005 → 50,00
    expect(descontoPromocao({ ...base, categorias: null }, itens)).toBe(255_000);
  });

  it('valor fixo nunca passa do valor dos itens elegíveis', () => {
    expect(descontoPromocao({ ...base, tipo_desconto: 'valor_fixo', desconto_centavos: 500_000 }, itens)).toBe(100_001);
  });

  it('explica por que não vale: período, tipo de cliente, mínimo, limites e itens', () => {
    expect(motivoInvalida(base, ctx)).toBeNull();
    expect(motivoInvalida({ ...base, ativo: false }, ctx)).toMatch(/não está ativa/);
    expect(motivoInvalida({ ...base, inicio: '2026-11-11' }, ctx)).toBe('A promoção começa em 11/11/2026.');
    expect(motivoInvalida({ ...base, fim: '2026-11-09' }, ctx)).toBe('A promoção terminou em 09/11/2026.');
    expect(motivoInvalida({ ...base, fim: '2026-11-10' }, ctx)).toBeNull();
    expect(motivoInvalida({ ...base, tipos_cliente: ['hospital'] }, ctx)).toMatch(/tipo de cliente/);
    expect(motivoInvalida({ ...base, subtotal_minimo_centavos: 6_000_000 }, ctx)).toMatch(/R\$\s60\.000,00/);
    expect(motivoInvalida({ ...base, limite_usos: 3 }, { ...ctx, uso: { total: 3, daEmpresa: 0 } })).toMatch(/limite de usos/);
    expect(motivoInvalida({ ...base, limite_por_empresa: 1 }, { ...ctx, uso: { total: 1, daEmpresa: 1 } })).toMatch(/já usou/);
    expect(motivoInvalida({ ...base, categorias: ['solar'] }, ctx)).toMatch(/Nenhum item/);
  });

  it('sem cupom, aplica a automática de maior desconto e ignora as de cupom', () => {
    const a = { p: { ...base, id: 1 }, desconto: 5_000, motivo: null };
    const b = { p: { ...base, id: 2 }, desconto: 9_000, motivo: null };
    const cupom = { p: { ...base, id: 3, cupom: 'BEMVINDO' }, desconto: 50_000, motivo: null };
    const invalida = { p: { ...base, id: 4 }, desconto: 90_000, motivo: 'terminou' };
    expect(melhorAutomatica([a, b, cupom, invalida])?.p.id).toBe(2);
    expect(melhorAutomatica([cupom])).toBeNull();
  });

  it('cupom ignora espaços e caixa', () => {
    expect(normalizarCupom('  bemVindo ')).toBe('BEMVINDO');
    expect(normalizarCupom('   ')).toBeNull();
  });
});

describe('modelos de e-mail', () => {
  it('formata valor e datas e troca as variáveis; a desconhecida fica visível', () => {
    const v = variaveisDoAviso({ pedido: 10042, valor_centavos: 1_248_000, vencimento: '2026-12-15', vazio: null });
    expect(v).toEqual({ pedido: '10042', valor: 'R$ 12.480,00', vencimento: '15/12/2026' });
    expect(renderizar('Pedido {{pedido}}: {{ valor }} até {{vencimento}} {{outra}}', v)).toBe('Pedido 10042: R$ 12.480,00 até 15/12/2026 {{outra}}');
  });

  it('aponta variáveis que o modelo não conhece', () => {
    expect(variaveisDesconhecidas('{{pedido}} {{pedidoo}} {{pedido}}', ['pedido'])).toEqual(['pedidoo']);
  });
});
