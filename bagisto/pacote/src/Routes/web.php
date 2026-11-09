<?php

use Illuminate\Support\Facades\Route;
use ImportFacil\Loja\Http\Controllers\AppController;
use ImportFacil\Loja\Http\Controllers\FinanceiroController;

// app instalável (PWA)
Route::get('manifest.webmanifest', [AppController::class, 'manifesto'])->name('importfacil.manifesto');
Route::get('sw.js', [AppController::class, 'serviceWorker'])->name('importfacil.sw');

Route::middleware(['web', 'theme', 'locale', 'currency'])->group(function () {
    Route::get('app', [AppController::class, 'instalar'])->name('importfacil.app');
    Route::get('offline', [AppController::class, 'offline'])->name('importfacil.offline');

    Route::middleware(['customer'])->prefix('customer/account')->group(function () {
        Route::get('financeiro', [FinanceiroController::class, 'index'])->name('importfacil.financeiro');
    });
});
