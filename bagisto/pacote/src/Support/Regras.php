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

    /** Importação: prazo de recebimento e valores da conta e ordem (% da mercadoria), como na política do protótipo. */
    const PRAZO_IMPORTACAO = 45;

    const CO_TRIB_PCT = 40;

    const CO_SERV_PCT = 3;

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

    /** Razão social da empresa (perfil da B2B Suite) ou o nome da conta. */
    public static function nomeEmpresa(?int $empresaId): string
    {
        if (! $empresaId) {
            return '—';
        }
        $nome = DB::table('b2b_company_flat')->where('customer_id', $empresaId)->value('business_name');
        if (! $nome) {
            $c = DB::table('customers')->where('id', $empresaId)->first(['first_name', 'last_name']);
            $nome = $c ? trim($c->first_name.' '.$c->last_name) : '—';
        }

        return trim(str_replace('(demonstração)', '', $nome));
    }

    /** Crédito disponível da empresa na B2B Suite (limite − saldo devedor), ou null sem linha de crédito. */
    public static function creditoDisponivel(?int $empresaId): ?float
    {
        $c = $empresaId ? DB::table('b2b_company_credits')->where('company_id', $empresaId)->where('status', 1)->first() : null;

        return $c ? (float) $c->credit_limit - (float) $c->outstanding_balance : null;
    }

    /** A empresa pode importar por conta e ordem (decisão da equipe; no protótipo, clientes faixa A). */
    public static function contaEOrdem(?int $empresaId): bool
    {
        return (bool) (self::empresa($empresaId)->conta_e_ordem ?? false);
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
