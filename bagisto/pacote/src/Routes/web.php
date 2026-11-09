<?php

use Illuminate\Support\Facades\Route;
use ImportFacil\Loja\Http\Controllers\Admin\CalculadoraController;
use ImportFacil\Loja\Http\Controllers\Admin\ImportacaoController as AdminImportacao;
use ImportFacil\Loja\Http\Controllers\AppController;
use ImportFacil\Loja\Http\Controllers\FinanceiroController;
use ImportFacil\Loja\Http\Controllers\ImportacaoController;
use Webkul\Core\Http\Middleware\NoCacheMiddleware;

// app instalável (PWA)
Route::get('manifest.webmanifest', [AppController::class, 'manifesto'])->name('importfacil.manifesto');
Route::get('sw.js', [AppController::class, 'serviceWorker'])->name('importfacil.sw');

Route::middleware(['web', 'theme', 'locale', 'currency'])->group(function () {
    Route::get('app', [AppController::class, 'instalar'])->name('importfacil.app');
    Route::get('offline', [AppController::class, 'offline'])->name('importfacil.offline');

    Route::middleware(['customer'])->prefix('customer/account')->group(function () {
        Route::get('financeiro', [FinanceiroController::class, 'index'])->name('importfacil.financeiro');

        // ordens de importação do cliente
        Route::get('importacao', [ImportacaoController::class, 'index'])->name('importfacil.importacao.index');
        Route::get('importacao/nova', [ImportacaoController::class, 'nova'])->name('importfacil.importacao.nova');
        Route::post('importacao', [ImportacaoController::class, 'criar'])->name('importfacil.importacao.criar');
        Route::get('importacao/{id}', [ImportacaoController::class, 'ver'])->whereNumber('id')->name('importfacil.importacao.ver');
    });
});

// Painel da equipe → Importação
Route::middleware(['web', 'admin', NoCacheMiddleware::class])->prefix(config('app.admin_url').'/importacao')->group(function () {
    Route::get('ordens', [AdminImportacao::class, 'index'])->name('admin.importfacil.importacao.index');
    Route::get('ordens/{id}', [AdminImportacao::class, 'ver'])->whereNumber('id')->name('admin.importfacil.importacao.ver');
    Route::post('ordens/{id}/avancar', [AdminImportacao::class, 'avancar'])->whereNumber('id')->name('admin.importfacil.importacao.avancar');
    Route::post('ordens/{id}/numerario', [AdminImportacao::class, 'numerario'])->whereNumber('id')->name('admin.importfacil.importacao.numerario');
    Route::post('ordens/{id}/ncm', [AdminImportacao::class, 'ncm'])->whereNumber('id')->name('admin.importfacil.importacao.ncm');

    Route::get('empresas', [AdminImportacao::class, 'empresas'])->name('admin.importfacil.empresas');
    Route::post('empresas/{id}', [AdminImportacao::class, 'salvarEmpresa'])->whereNumber('id')->name('admin.importfacil.empresas.salvar');

    Route::get('calculadora', [CalculadoraController::class, 'index'])->name('admin.importfacil.calculadora');
    Route::post('calculadora', [CalculadoraController::class, 'calcular'])->name('admin.importfacil.calculadora.calcular');
    Route::get('ncm', [CalculadoraController::class, 'ncm'])->name('admin.importfacil.ncm');
    Route::get('ncm/buscar', [CalculadoraController::class, 'ncmBuscar'])->name('admin.importfacil.ncm.buscar');
});
