<?php

namespace ImportFacil\Loja\Listeners;

use ImportFacil\Loja\Support\Regras;

/**
 * Antes de somar o carrinho (evento checkout.cart.validate.items.before, o primeiro do collectTotals, antes das
 * regras de desconto), ajusta cada item ao múltiplo de venda do produto (ex.: filtro vendido de 12 em 12):
 * arredonda para cima e, se faltar estoque, para baixo. É a regra do protótipo, agora no servidor.
 */
class MultiploDeVenda
{
    public function handle($carrinho): void
    {
        if (! $carrinho || ! $carrinho->items) {
            return;
        }

        foreach ($carrinho->items as $item) {
            $multiplo = Regras::multiplo((int) $item->product_id);

            if ($multiplo <= 1 || $item->quantity % $multiplo === 0) {
                continue;
            }

            $nova = (int) (ceil($item->quantity / $multiplo) * $multiplo);
            $estoque = (int) ($item->product?->getTypeInstance()?->totalQuantity() ?? $nova);

            if ($estoque > 0 && $nova > $estoque) {
                $nova = max($multiplo, (int) (floor($estoque / $multiplo) * $multiplo));
            }

            $item->quantity = $nova;
            // os totais do item seguem a nova quantidade (o Bagisto só os recalcula quando o preço muda)
            $item->base_total = $item->base_price * $nova;
            $item->base_total_incl_tax = ($item->base_price_incl_tax ?: $item->base_price) * $nova;
            $item->total = $item->price * $nova;
            $item->total_incl_tax = ($item->price_incl_tax ?: $item->price) * $nova;
            $item->total_weight = (float) $item->weight * $nova;
            $item->base_total_weight = (float) $item->weight * $nova;
            $item->save();

            session()->flash('info', sprintf('%s é vendido em múltiplos de %d %s: a quantidade foi ajustada para %d.',
                $item->name, $multiplo, Regras::unidade((int) $item->product_id), $nova));
        }
    }
}
