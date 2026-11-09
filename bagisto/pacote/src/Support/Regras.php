<?php

namespace ImportFacil\Loja\Support;

use Illuminate\Support\Facades\DB;

/**
 * Consultas às regras da ImportFácil (tipos de cliente, empresas, faixas de crédito e múltiplos de venda).
 * Tudo é lido do banco: as tabelas importfacil_* e os atributos multiplo_venda / unidade_venda dos produtos.
 */
class Regras
{
    /** Faixas de crédito da política do protótipo: fator do limite e número máximo de boletos. */
    const FAIXAS = [
        'A' => ['fator' => 1.0, 'max_boleto' => 4, 'texto' => 'Sem restrições, mais de 3 anos de CNPJ'],
        'B' => ['fator' => 0.5, 'max_boleto' => 2, 'texto' => 'Histórico curto ou restrições já resolvidas'],
        'C' => ['fator' => 0.0, 'max_boleto' => 0, 'texto' => 'Protestos, negativações ou documentos incompletos'],
    ];

    const PRAZOS = [30, 60, 90, 120];

    protected static array $multiplos = [];

    /** Tipo de cliente (cooperativa, distribuidora…) do grupo de clientes, ou null. */
    public static function tipoDoGrupo(?int $grupoId): ?object
    {
        if (! $grupoId) {
            return null;
        }

        return DB::table('importfacil_tipos_cliente')->where('customer_group_id', $grupoId)->first();
    }

    /** Tipo de cliente do cliente logado. */
    public static function tipoDoCliente($cliente = null): ?object
    {
        $cliente ??= auth()->guard('customer')->user();

        return $cliente ? self::tipoDoGrupo((int) $cliente->customer_group_id) : null;
    }

    /** Empresa (B2B Suite) do cliente: a própria conta da empresa ou a empresa do usuário. */
    public static function empresaId($cliente = null): ?int
    {
        $cliente ??= auth()->guard('customer')->user();

        if (! $cliente) {
            return null;
        }

        if (($cliente->type ?? null) === 'company') {
            return (int) $cliente->id;
        }

        $id = DB::table('b2b_customer_companies')->where('customer_id', $cliente->id)->value('company_id');

        return $id ? (int) $id : null;
    }

    /** Dados de crédito da ImportFácil para a empresa (faixa, conta e ordem). */
    public static function empresa(?int $empresaId): ?object
    {
        return $empresaId ? DB::table('importfacil_empresas')->where('company_id', $empresaId)->first() : null;
    }

    public static function maxBoletos(?int $empresaId): int
    {
        $e = self::empresa($empresaId);

        return $e ? (self::FAIXAS[$e->faixa]['max_boleto'] ?? 0) : 0;
    }

    /** Múltiplo de venda do produto (atributo multiplo_venda); 1 quando não informado. */
    public static function multiplo(int $produtoId): int
    {
        if (! array_key_exists($produtoId, self::$multiplos)) {
            $atributo = DB::table('attributes')->where('code', 'multiplo_venda')->value('id');
            $valor = $atributo
                ? DB::table('product_attribute_values')->where('product_id', $produtoId)->where('attribute_id', $atributo)->value('text_value')
                : null;
            self::$multiplos[$produtoId] = max(1, (int) $valor);
        }

        return self::$multiplos[$produtoId];
    }

    public static function unidade(int $produtoId): string
    {
        $atributo = DB::table('attributes')->where('code', 'unidade_venda')->value('id');
        $valor = $atributo
            ? DB::table('product_attribute_values')->where('product_id', $produtoId)->where('attribute_id', $atributo)->value('text_value')
            : null;

        return $valor ?: 'un';
    }
}
