<?php

namespace ImportFacil\Loja\Payment;

use Webkul\Payment\Payment\Payment;

/** Pix com 3% de desconto (o desconto é a regra de carrinho "Pix 3%"). Simulado até a integração com o Asaas. */
class Pix extends Payment
{
    protected $code = 'importfacil_pix';

    public function getRedirectUrl() {}

    public function getImage()
    {
        return url('importfacil/pix.svg');
    }

    public function getAdditionalDetails()
    {
        return [
            'title' => 'Como pagar',
            'value' => 'Depois de concluir o pedido, o código Pix (copia e cola) vale por 24 horas. O pedido é confirmado assim que o banco avisa o pagamento.',
        ];
    }
}
