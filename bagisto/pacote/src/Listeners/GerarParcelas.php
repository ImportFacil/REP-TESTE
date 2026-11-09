<?php

namespace ImportFacil\Loja\Listeners;

use Illuminate\Support\Facades\DB;
use ImportFacil\Loja\Support\Regras;

/**
 * Quando o pedido é salvo, registra o que a empresa vai pagar:
 * - boleto pelo crédito da empresa (paybycredit): parcelas em 30/60/90/120 dias, até o máximo da faixa (A 4×, B 2×);
 * - Pix: uma cobrança que vence em 24 h;
 * - cartão: uma cobrança já paga (simulada até a integração com o Asaas).
 */
class GerarParcelas
{
    public function handle($pedido): void
    {
        $metodo = $pedido->payment?->method;
        $total = round((float) $pedido->base_grand_total, 2);
        $empresa = Regras::empresaId($pedido->customer);
        $agora = now();
        $linhas = [];

        if ($metodo === 'paybycredit') {
            $n = max(1, Regras::maxBoletos($empresa));
            $base = floor($total / $n * 100) / 100;
            for ($i = 1; $i <= $n; $i++) {
                $linhas[] = [
                    'numero' => $i, 'de' => $n, 'forma' => 'Boleto',
                    'valor' => $i === $n ? round($total - $base * ($n - 1), 2) : $base,
                    'vencimento' => $agora->copy()->addDays(Regras::PRAZOS[$i - 1])->toDateString(),
                    'pago_em' => null,
                ];
            }
        } elseif ($metodo === 'importfacil_pix') {
            $linhas[] = ['numero' => 1, 'de' => 1, 'forma' => 'Pix', 'valor' => $total, 'vencimento' => $agora->copy()->addDay()->toDateString(), 'pago_em' => null];
        } elseif ($metodo === 'importfacil_cartao') {
            $linhas[] = ['numero' => 1, 'de' => 1, 'forma' => 'Cartão', 'valor' => $total, 'vencimento' => $agora->toDateString(), 'pago_em' => $agora];
        } else {
            return;
        }

        foreach ($linhas as $l) {
            DB::table('importfacil_parcelas')->insert($l + [
                'order_id' => $pedido->id,
                'company_id' => $empresa,
                'customer_id' => $pedido->customer_id,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);
        }
    }
}
