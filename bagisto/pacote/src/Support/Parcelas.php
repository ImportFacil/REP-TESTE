<?php

namespace ImportFacil\Loja\Support;

use Illuminate\Support\Facades\DB;

/**
 * Gera o que a empresa vai pagar (tabela importfacil_parcelas), para pedidos da loja e ordens de importação:
 * - boleto pelo crédito da empresa: parcelas em 30/60/90/120 dias, até o máximo da faixa (A 4×, B 2×);
 * - Pix: uma cobrança que vence em 24 h;
 * - cartão: uma cobrança já paga (simulada até a integração com o Asaas).
 */
class Parcelas
{
    /** @param  array  $ref  order_id ou ordem_importacao_id, company_id, customer_id, etapa e rótulo */
    public static function gerar(string $forma, float $total, array $ref): void
    {
        $total = round($total, 2);
        $agora = now();
        $linhas = [];

        if ($forma === 'Boleto') {
            $n = max(1, Regras::maxBoletos($ref['company_id'] ?? null));
            $base = floor($total / $n * 100) / 100;
            for ($i = 1; $i <= $n; $i++) {
                $linhas[] = [
                    'numero' => $i, 'de' => $n, 'forma' => 'Boleto',
                    'valor' => $i === $n ? round($total - $base * ($n - 1), 2) : $base,
                    'vencimento' => $agora->copy()->addDays(Regras::PRAZOS[$i - 1])->toDateString(),
                    'pago_em' => null,
                ];
            }
        } elseif ($forma === 'Pix') {
            $linhas[] = ['numero' => 1, 'de' => 1, 'forma' => 'Pix', 'valor' => $total, 'vencimento' => $agora->copy()->addDay()->toDateString(), 'pago_em' => null];
        } elseif ($forma === 'Cartão') {
            $linhas[] = ['numero' => 1, 'de' => 1, 'forma' => 'Cartão', 'valor' => $total, 'vencimento' => $agora->toDateString(), 'pago_em' => $agora];
        } else {
            return;
        }

        foreach ($linhas as $l) {
            DB::table('importfacil_parcelas')->insert($l + [
                'order_id' => $ref['order_id'] ?? null,
                'ordem_importacao_id' => $ref['ordem_importacao_id'] ?? null,
                'company_id' => $ref['company_id'] ?? null,
                'customer_id' => $ref['customer_id'] ?? null,
                'etapa' => $ref['etapa'] ?? null,
                'rotulo' => isset($ref['rotulo']) ? $ref['rotulo'].($l['de'] > 1 ? ' '.$l['numero'].'/'.$l['de'] : '') : null,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);
        }
    }

    /** Forma de pagamento (Boleto, Pix, Cartão) a partir do código do Bagisto. */
    public static function formaDoMetodo(?string $metodo): ?string
    {
        return ['paybycredit' => 'Boleto', 'importfacil_pix' => 'Pix', 'importfacil_cartao' => 'Cartão'][$metodo] ?? null;
    }
}
