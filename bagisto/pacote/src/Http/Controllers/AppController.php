<?php

namespace ImportFacil\Loja\Http\Controllers;

use Illuminate\Routing\Controller;

class AppController extends Controller
{
    /** Manifesto do app instalável: nome, ícones do globo e abertura em tela cheia. */
    public function manifesto()
    {
        return response()->json([
            'name' => 'ImportFácil — Loja B2B',
            'short_name' => 'ImportFácil',
            'description' => 'Loja B2B da ImportFácil: preço por tipo de cliente, pedido rápido, cotação e crédito da empresa.',
            'lang' => 'pt-BR',
            'id' => '/?app=bagisto',
            'start_url' => '/?app=bagisto',
            'scope' => '/',
            'display' => 'standalone',
            'background_color' => '#ffffff',
            'theme_color' => '#1D4ED8',
            'icons' => [
                ['src' => '/importfacil/icone-192.png', 'sizes' => '192x192', 'type' => 'image/png'],
                ['src' => '/importfacil/icone-512.png', 'sizes' => '512x512', 'type' => 'image/png'],
                ['src' => '/importfacil/icone-mascaravel.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
            'shortcuts' => [
                ['name' => 'Pedido rápido', 'url' => '/customer/account/quick-orders'],
                ['name' => 'Meus pedidos', 'url' => '/customer/account/orders'],
                ['name' => 'Financeiro', 'url' => '/customer/account/financeiro'],
            ],
        ], 200, ['Content-Type' => 'application/manifest+json']);
    }

    /** Service worker na raiz do site (escopo "/"): guarda o essencial e mostra a página offline sem internet. */
    public function serviceWorker()
    {
        return response(file_get_contents(dirname(__DIR__, 3).'/public/sw.js'), 200, [
            'Content-Type' => 'application/javascript; charset=utf-8',
            'Service-Worker-Allowed' => '/',
            'Cache-Control' => 'no-cache',
        ]);
    }

    /** Página "Baixar o app": QR code do endereço atual e passo a passo para Android e iPhone. */
    public function instalar()
    {
        // endereço público da loja (no Codespaces, o iniciar.sh põe o do Codespace em APP_URL)
        $url = rtrim(config('app.url') ?: url('/'), '/').'/?app=bagisto';
        $qr = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')->size(260)->margin(1)->errorCorrection('M')->generate($url);

        return view('importfacil::app.instalar', ['url' => $url, 'qr' => $qr]);
    }

    public function offline()
    {
        return view('importfacil::app.offline');
    }
}
