<?php

return [
    'importfacil_pix' => [
        'class' => \ImportFacil\Loja\Payment\Pix::class,
        'code' => 'importfacil_pix',
        'title' => 'Pix · 3% de desconto',
        'description' => 'Pague no Pix e ganhe 3% de desconto no pedido.',
        'active' => true,
        'generate_invoice' => false,
        'sort' => 1,
    ],
    'importfacil_cartao' => [
        'class' => \ImportFacil\Loja\Payment\Cartao::class,
        'code' => 'importfacil_cartao',
        'title' => 'Cartão de crédito em até 12×',
        'description' => 'Sem juros até 10×; 11× e 12× com 1,99% a.m.',
        'active' => true,
        'generate_invoice' => true,
        'sort' => 3,
    ],
];
