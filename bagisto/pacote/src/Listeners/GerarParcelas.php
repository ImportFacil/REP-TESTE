<?php

namespace ImportFacil\Loja\Listeners;

use ImportFacil\Loja\Support\Parcelas;
use ImportFacil\Loja\Support\Regras;

/**
 * Quando o pedido da loja é salvo, registra o que a empresa vai pagar
 * (boleto pelo crédito em até 4×, Pix ou cartão; veja Support/Parcelas).
 */
class GerarParcelas
{
    public function handle($pedido): void
    {
        $forma = Parcelas::formaDoMetodo($pedido->payment?->method);

        if (! $forma) {
            return;
        }

        Parcelas::gerar($forma, (float) $pedido->base_grand_total, [
            'order_id' => $pedido->id,
            'company_id' => Regras::empresaId($pedido->customer),
            'customer_id' => $pedido->customer_id,
            'etapa' => 'venda',
        ]);
    }
}
