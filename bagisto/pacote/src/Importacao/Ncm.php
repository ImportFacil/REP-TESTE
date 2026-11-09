<?php

namespace ImportFacil\Loja\Importacao;

use Illuminate\Support\Facades\DB;

/**
 * Tabela NCM vigente (Receita Federal / Portal Único Siscomex), a mesma do protótipo (prototipo-ncm.json),
 * atualizada toda semana pelo workflow "Tabela NCM".
 */
class Ncm
{
    public static function formatar(?string $c): string
    {
        $c = preg_replace('/\D/', '', (string) $c);

        return strlen($c) === 8 ? substr($c, 0, 4).'.'.substr($c, 4, 2).'.'.substr($c, 6) : $c;
    }

    /** Só códigos completos (8 dígitos) valem para a classificação de um item. */
    public static function existe(string $codigo): bool
    {
        $c = preg_replace('/\D/', '', $codigo);

        return strlen($c) === 8 && DB::table('importfacil_ncm')->where('codigo', $c)->exists();
    }

    public static function descricao(?string $codigo): ?string
    {
        $c = preg_replace('/\D/', '', (string) $codigo);

        return strlen($c) === 8 ? DB::table('importfacil_ncm')->where('codigo', $c)->value('descricao') : null;
    }

    /** Busca por código (prefixo) ou por palavras da descrição; devolve só códigos de 8 dígitos. */
    public static function buscar(string $termo, int $limite = 30): array
    {
        $termo = trim($termo);
        $digitos = preg_replace('/\D/', '', $termo);
        $q = DB::table('importfacil_ncm')->whereRaw('LENGTH(codigo) = 8');

        if ($digitos !== '' && preg_match('/^[\d.\s-]+$/', $termo)) {
            $q->where('codigo', 'like', $digitos.'%');
        } else {
            // as palavras podem estar no código de cima (posição, subposição): "veículos aéreos" acha os 8806.xx.xx
            $palavras = array_filter(preg_split('/\s+/', mb_strtolower($termo)));
            if (! $palavras) {
                return [];
            }
            $achados = DB::table('importfacil_ncm');
            foreach ($palavras as $palavra) {
                $achados->where('descricao', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $palavra).'%');
            }
            $prefixos = $achados->orderBy('codigo')->limit(60)->pluck('codigo')->all();
            if (! $prefixos) {
                return [];
            }
            $q->where(function ($w) use ($prefixos) {
                foreach ($prefixos as $p) {
                    $w->orWhere('codigo', 'like', $p.'%');
                }
            });
        }

        return $q->orderBy('codigo')->limit($limite)->get()
            ->map(fn ($r) => ['codigo' => self::formatar($r->codigo), 'descricao' => self::caminho($r->codigo)])
            ->all();
    }

    /** Descrição com a posição de cima (ex.: "Veículos aéreos não tripulados › -- De peso máximo… › Outros"). */
    public static function caminho(string $codigo): string
    {
        $pais = [substr($codigo, 0, 4), substr($codigo, 0, 5), substr($codigo, 0, 6), substr($codigo, 0, 7), $codigo];
        $d = DB::table('importfacil_ncm')->whereIn('codigo', array_unique($pais))->orderByRaw('LENGTH(codigo)')->pluck('descricao')->all();

        return implode(' › ', array_map(fn ($t) => trim(ltrim(trim($t), '- ')), $d));
    }

    /** Carrega o arquivo do protótipo ({"n": [[codigo, descricao], ...]}); devolve quantos códigos. */
    public static function carregar(string $arquivo): array
    {
        $d = json_decode(file_get_contents($arquivo), true);
        $linhas = $d['n'] ?? [];

        DB::transaction(function () use ($linhas) {
            DB::table('importfacil_ncm')->delete();
            foreach (array_chunk($linhas, 1000) as $bloco) {
                DB::table('importfacil_ncm')->insert(array_map(fn ($l) => ['codigo' => (string) $l[0], 'descricao' => (string) $l[1]], $bloco));
            }
        });

        return ['total' => count($linhas), 'vigencia' => $d['atualizadoEm'] ?? null, 'ato' => $d['ato'] ?? null];
    }
}
