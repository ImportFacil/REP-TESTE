<?php

namespace ImportFacil\Loja\Providers;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use ImportFacil\Loja\Console\CarregarNcm;
use ImportFacil\Loja\Listeners\GerarParcelas;
use ImportFacil\Loja\Listeners\MultiploDeVenda;

/**
 * Regras da ImportFácil sobre o Bagisto + B2B Suite. Nada aqui consulta o banco ao iniciar,
 * então o provedor pode ficar registrado antes da instalação do Bagisto.
 */
class ImportFacilServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(dirname(__DIR__).'/Config/payment-methods.php', 'payment_methods');
        $this->mergeConfigFrom(dirname(__DIR__).'/Config/acl.php', 'acl');

        // pedido mínimo por tipo de cliente
        $this->app->singleton(\Webkul\Checkout\Cart::class, \ImportFacil\Loja\Checkout\Cart::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(dirname(__DIR__).'/Database/Migrations');
        $this->loadViewsFrom(dirname(__DIR__).'/Resources/views', 'importfacil');
        $this->loadRoutesFrom(dirname(__DIR__).'/Routes/web.php');
        $this->mergeConfigFrom(dirname(__DIR__).'/Config/menu.php', 'menu.customer');
        $this->mergeConfigFrom(dirname(__DIR__).'/Config/admin-menu.php', 'menu.admin');

        if ($this->app->runningInConsole()) {
            $this->commands([CarregarNcm::class]);
        }

        Event::listen('checkout.cart.validate.items.before', [MultiploDeVenda::class, 'handle']);
        Event::listen('checkout.order.save.after', [GerarParcelas::class, 'handle']);

        Event::listen('bagisto.shop.layout.head.after', fn ($e) => $e->addTemplate('importfacil::pwa.head'));
        Event::listen('bagisto.shop.products.price.after', fn ($e) => $e->addTemplate('importfacil::produto.multiplo'));
        Event::listen('bagisto.shop.checkout.cart.breadcrumbs.after', fn ($e) => $e->addTemplate('importfacil::carrinho.importacao'));
    }
}
