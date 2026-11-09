<?php

namespace ImportFacil\Loja\Payment;

use Webkul\Payment\Payment\Payment;

/** Cartão de crédito em até 12× (sem juros até 10×). Aprovação simulada até a integração com o Asaas. */
class Cartao extends Payment
{
    protected $code = 'importfacil_cartao';

    public function getRedirectUrl() {}

    public function getImage()
    {
        return '/importfacil/cartao.svg';
    }

    public function getAdditionalDetails()
    {
        return [
            'title' => 'Parcelamento',
            'value' => 'Em até 12×: sem juros até 10×; 11× e 12× com juros de 1,99% ao mês.',
        ];
    }
}
