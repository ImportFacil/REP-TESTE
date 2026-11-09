<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // tipos de cliente do protótipo, ligados ao grupo de clientes do catálogo da empresa (B2B Suite)
        Schema::create('importfacil_tipos_cliente', function (Blueprint $t) {
            $t->id();
            $t->string('codigo')->unique();
            $t->string('nome');
            $t->unsignedInteger('customer_group_id')->nullable()->index();
            $t->decimal('desconto', 5, 2)->default(0);
            $t->decimal('pedido_minimo', 12, 2)->default(0);
            $t->text('texto')->nullable();
            $t->timestamps();
        });

        // decisão de crédito da ImportFácil por empresa (faixa A/B/C e conta e ordem)
        Schema::create('importfacil_empresas', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('company_id')->unique();
            $t->string('tipo')->nullable();
            $t->char('faixa', 1)->default('A');
            $t->boolean('conta_e_ordem')->default(false);
            $t->timestamps();
        });

        // o que cada pedido gera para receber: boletos, Pix e cartão
        Schema::create('importfacil_parcelas', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('order_id')->index();
            $t->unsignedInteger('company_id')->nullable()->index();
            $t->unsignedInteger('customer_id')->nullable()->index();
            $t->unsignedTinyInteger('numero');
            $t->unsignedTinyInteger('de');
            $t->string('forma');
            $t->decimal('valor', 12, 2);
            $t->date('vencimento');
            $t->dateTime('pago_em')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('importfacil_parcelas');
        Schema::dropIfExists('importfacil_empresas');
        Schema::dropIfExists('importfacil_tipos_cliente');
    }
};
