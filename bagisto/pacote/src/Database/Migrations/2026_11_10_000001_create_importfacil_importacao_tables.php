<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // tabela NCM vigente (Receita Federal / Siscomex), a mesma que o protótipo usa
        Schema::create('importfacil_ncm', function (Blueprint $t) {
            $t->string('codigo', 8)->primary();
            $t->text('descricao');
        });

        // ordens de importação: sob encomenda ou por conta e ordem
        Schema::create('importfacil_ordens_importacao', function (Blueprint $t) {
            $t->id();
            $t->string('numero')->nullable()->unique();
            $t->unsignedInteger('company_id')->nullable()->index();
            $t->unsignedInteger('customer_id')->nullable()->index();
            $t->string('tipo')->nullable();
            $t->string('modalidade', 20)->default('encomenda'); // encomenda | contaordem
            $t->string('forma_pagamento', 20);                   // Boleto | Pix | Cartão
            $t->string('incoterm')->nullable();
            $t->string('moeda')->nullable();
            $t->string('po_cliente')->nullable();
            $t->string('responsavel');
            $t->string('cargo');
            $t->text('observacoes')->nullable();
            $t->text('exigencias')->nullable();
            $t->string('status');
            $t->decimal('total', 14, 2)->default(0);
            $t->date('recebimento_previsto')->nullable();
            $t->unsignedInteger('nfe_numero')->nullable();
            $t->dateTime('faturada_em')->nullable();
            $t->json('prestacao')->nullable();
            $t->timestamps();
        });

        Schema::create('importfacil_ordens_importacao_itens', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('ordem_id')->index();
            $t->unsignedInteger('product_id')->nullable();
            $t->string('sku')->nullable();
            $t->string('nome');
            $t->string('unidade', 20)->nullable();
            $t->string('ncm', 8)->nullable();
            $t->unsignedInteger('quantidade');
            $t->decimal('preco', 14, 2);
            $t->decimal('total', 14, 2);
        });

        Schema::create('importfacil_ordens_importacao_historico', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('ordem_id')->index();
            $t->string('status');
            $t->string('por')->nullable();
            $t->text('nota')->nullable();
            $t->timestamp('created_at')->nullable();
        });

        // parcelas também de ordens de importação (numerário da conta e ordem, venda e taxa de serviço)
        Schema::table('importfacil_parcelas', function (Blueprint $t) {
            $t->unsignedInteger('order_id')->nullable()->change();
            $t->unsignedBigInteger('ordem_importacao_id')->nullable()->index()->after('order_id');
            $t->string('etapa', 20)->nullable()->after('forma'); // cambio | tributos | servico | venda
            $t->string('rotulo')->nullable()->after('etapa');
        });
    }

    public function down(): void
    {
        Schema::table('importfacil_parcelas', function (Blueprint $t) {
            $t->dropColumn(['ordem_importacao_id', 'etapa', 'rotulo']);
        });
        Schema::dropIfExists('importfacil_ordens_importacao_historico');
        Schema::dropIfExists('importfacil_ordens_importacao_itens');
        Schema::dropIfExists('importfacil_ordens_importacao');
        Schema::dropIfExists('importfacil_ncm');
    }
};
