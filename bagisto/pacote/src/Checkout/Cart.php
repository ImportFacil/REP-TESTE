<?php

namespace ImportFacil\Loja\Checkout;

use ImportFacil\Loja\Support\Regras;
use Webkul\Checkout\Cart as CartBagisto;

/**
 * Carrinho do Bagisto com o pedido mínimo de cada tipo de cliente (no protótipo: Cooperativa R$ 25 mil,
 * Distribuidora R$ 30 mil, Revendedor R$ 20 mil, Construtora R$ 40 mil, Hospital R$ 60 mil).
 * Sem tipo de cliente (visitante ou cliente avulso), vale a regra padrão do Bagisto.
 */
class Cart extends CartBagisto
{
    public function haveMinimumOrderAmount(): bool
    {
        $tipo = Regras::tipoDoCliente();

        if (! $tipo) {
            return parent::haveMinimumOrderAmount();
        }

        return $this->getOrderAmount() >= (float) $tipo->pedido_minimo;
    }

    protected function minimumOrderAmountError(): array
    {
        $tipo = Regras::tipoDoCliente();

        if (! $tipo) {
            return parent::minimumOrderAmountError();
        }

        $falta = max(0, (float) $tipo->pedido_minimo - $this->getOrderAmount());

        return [
            'error_code' => 'MINIMUM_ORDER_AMOUNT',
            // a página do carrinho mostra "mensagem: valor"
            'message' => sprintf('Pedido mínimo para %s (faltam %s)', $tipo->nome, core()->formatPrice($falta)),
            'amount' => core()->formatPrice((float) $tipo->pedido_minimo),
        ];
    }
}
