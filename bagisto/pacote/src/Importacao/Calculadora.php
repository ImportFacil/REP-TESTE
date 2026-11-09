<?php

namespace ImportFacil\Loja\Importacao;

/**
 * Calculadora de importação: o mesmo cálculo do protótipo (função calcImport do index.html), em PHP.
 *
 * Baseada na planilha "FINAL IMPORT COSTS DRONES" (contêiner 20' e 40'), com as correções do protótipo:
 * frete e seguro contados uma vez só, estadia no custo por item, capatazia no valor aduaneiro,
 * AFRMM como % do frete e Taxa Siscomex calculada pelo número de adições.
 * Os custos cobrados antes da chegada ao Brasil são informados em dólar.
 */
class Calculadora
{
    /** Despesas em R$, rateadas pelo valor FOB de cada item: [campo, rótulo]. */
    const DESPESAS = [
        ['outros', 'Taxas do armador e do terminal (ISPS, handling etc.)'],
        ['desDI', 'Desembaraço da DI/DUIMP (despachante)'],
        ['dta', 'Desembaraço da DTA'],
        ['transp', 'Transporte rodoviário'],
        ['estadia', 'Estadia'],
        ['arm1', 'Armazenagem 1'],
        ['arm2', 'Armazenagem 2 (EADI)'],
        ['demurrage', 'Demurrage'],
    ];

    /** Descrição, NCM, FOB unit. US$, qtd 20', peso 20' (kg), qtd 40', peso 40', preço de mercado no Brasil. */
    const DRONES = [
        ['DJI Agras T100', '8806.99.00', 36000, 2, 170, 5, 425, 130000],
        ['DJI Agras T70P', '8806.94.00', 20000, 3, 180, 6, 360, 85000],
        ['DJI Agras T55', '8806.94.00', 17000, 3, 165, 6, 330, 82000],
        ['DJI Agras T25P', '8806.94.00', 16500, 8, 500, 20, 1250, 54000],
        ['DJI Agras T50', '8806.94.00', 11000, 6, 220, 15, 550, 0],
        ['DJI Agras T25', '8806.94.00', 10500, 6, 220, 15, 550, 0],
        ['DJI Agras T20P', '8806.94.00', 14500, 4, 230, 10, 580, 0],
        ['DJI Agras T40', '8806.94.00', 9500, 6, 210, 15, 525, 0],
        ['DJI Mavic 3M', '8806.92.00', 4500, 10, 20, 18, 36, 0],
    ];

    /** Custos no exterior (US$); va = entra no valor aduaneiro (base dos tributos). */
    const EXTERIOR = [
        ['rot' => 'Frete interno na origem (até o porto ou aeroporto de embarque)', 'usd' => 0, 'va' => true],
        ['rot' => 'Taxas na origem (THC, BL, documentação, despacho de exportação)', 'usd' => 0, 'va' => true],
        ['rot' => 'Inspeção ou certificação na origem', 'usd' => 0, 'va' => false],
        ['rot' => 'Comissão do agente de compras no exterior', 'usd' => 0, 'va' => false],
        ['rot' => 'Outras despesas no exterior', 'usd' => 0, 'va' => true],
    ];

    /** Cenário padrão: contêiner de 20' ou de 40' com os drones da planilha. */
    public static function padrao(string $conteiner = '20'): array
    {
        $c40 = $conteiner === '40';

        return [
            'modelo' => $c40 ? '40' : '20',
            'cambioDI' => 5.45, 'cambioFrete' => 5.45, 'cambioPag' => 5.45,
            'freteUSD' => 3300, 'seguroPct' => 0.6, 'seguroUSD' => 0,
            'exterior' => self::EXTERIOR,
            'capatazia' => 3500, 'siscomexAuto' => true, 'siscomex' => 154.23, 'afrmmPct' => 8,
            'desp' => ['outros' => 13000, 'desDI' => 1621, 'dta' => 688, 'transp' => 9000, 'estadia' => 5000, 'arm1' => 3000, 'arm2' => 3500, 'demurrage' => 0],
            'lucroReal' => true, 'icmsImp' => 0, 'finimp' => 11, 'icmsVenda' => 12, 'piscofVenda' => 9.25, 'margem' => 21,
            'itens' => array_map(fn ($d) => [
                'desc' => $d[0], 'ncm' => $d[1], 'fob' => $d[2],
                'qtd' => $c40 ? $d[5] : $d[3], 'peso' => $c40 ? $d[6] : $d[4],
                'ii' => 0, 'ipi' => 6.5, 'pis' => 2.1, 'cofins' => 9.65, 'mercado' => $d[7],
            ], self::DRONES),
        ];
    }

    /** Cálculo em branco, com um item. */
    public static function vazio(): array
    {
        $s = self::padrao('20');
        $s['modelo'] = 'vazio';
        $s['itens'] = [self::itemNovo()];

        return $s;
    }

    public static function itemNovo(array $dados = []): array
    {
        return $dados + ['desc' => '', 'ncm' => '', 'fob' => 0, 'qtd' => 1, 'peso' => 0, 'ii' => 0, 'ipi' => 0, 'pis' => 2.1, 'cofins' => 9.65, 'mercado' => 0];
    }

    /** Taxa Siscomex (Portaria ME nº 4.131/2021): R$ 115,67 por declaração + valor por adição, por faixa. */
    public static function siscomexTaxa(int $adicoes): float
    {
        $faixas = [[2, 38.56], [5, 30.85], [10, 23.14], [20, 15.42], [50, 7.71], [PHP_INT_MAX, 3.86]];
        $total = 115.67;
        $n = 0;
        for ($a = 1; $a <= $adicoes; $a++) {
            while ($a > $faixas[$n][0]) {
                $n++;
            }
            $total += $faixas[$n][1];
        }

        return round($total, 2);
    }

    /** Cálculo puro: recebe o cenário e devolve os totais e o resultado de cada item. */
    public static function calcular(array $s): array
    {
        $N = fn ($v) => is_numeric($v) && is_finite((float) $v) ? (float) $v : 0.0;
        $pct = fn ($v) => $N($v) / 100;
        $desp = $s['desp'] ?? [];

        $itens = array_values(array_filter($s['itens'] ?? [], fn ($i) => $N($i['qtd'] ?? 0) > 0));
        $fobTot = array_sum(array_map(fn ($i) => $N($i['qtd']) * $N($i['fob'] ?? 0), $itens)) * $N($s['cambioDI'] ?? 0);
        $pesoTot = array_sum(array_map(fn ($i) => $N($i['peso'] ?? 0), $itens));
        $qtdTot = array_sum(array_map(fn ($i) => $N($i['qtd']), $itens));
        $adicoes = count(array_unique(array_map(fn ($i) => implode('|', [trim((string) ($i['ncm'] ?? '')), self::numJs($N($i['ii'] ?? 0)), self::numJs($N($i['ipi'] ?? 0))]), $itens)));
        $siscomex = ! empty($s['siscomexAuto']) ? ($adicoes ? self::siscomexTaxa($adicoes) : 0) : $N($s['siscomex'] ?? 0);
        $freteR = $N($s['freteUSD'] ?? 0) * $N($s['cambioFrete'] ?? 0);
        $afrmm = $freteR * $pct($s['afrmmPct'] ?? 0);
        $despRateio = array_sum(array_map(fn ($d) => $N($desp[$d[0]] ?? 0), self::DESPESAS));
        $ext = array_map(fn ($x) => ['rot' => $x['rot'] ?? '', 'usd' => $N($x['usd'] ?? 0), 'va' => ! empty($x['va']), 'brl' => $N($x['usd'] ?? 0) * $N($s['cambioDI'] ?? 0)], $s['exterior'] ?? []);
        $extVA = array_sum(array_map(fn ($x) => $x['va'] ? $x['brl'] : 0, $ext));
        $extFora = array_sum(array_map(fn ($x) => $x['va'] ? 0 : $x['brl'], $ext));
        $seguroFixo = $N($s['seguroUSD'] ?? 0) > 0 ? $N($s['seguroUSD']) * $N($s['cambioDI'] ?? 0) : null;
        $icmsImp = min($pct($s['icmsImp'] ?? 0), 0.95);

        $chaves = ['fobUSD', 'fob', 'frete', 'seguro', 'origemVA', 'origemFora', 'capatazia', 'va', 'ii', 'ipi', 'pis', 'cofins', 'icms', 'afrmm', 'siscomex', 'desp', 'varCamb', 'desembolso', 'creditos', 'liquido'];
        $T = array_fill_keys($chaves, 0.0);

        $linhas = [];
        foreach ($s['itens'] ?? [] as $i) {
            $q = $N($i['qtd'] ?? 0);
            if ($q <= 0) {
                $linhas[] = null;

                continue;
            }
            $fobUSD = $q * $N($i['fob'] ?? 0);
            $fob = $fobUSD * $N($s['cambioDI'] ?? 0);
            $shFob = $fobTot ? $fob / $fobTot : 0;
            $shPeso = $pesoTot ? $N($i['peso'] ?? 0) / $pesoTot : $shFob;
            $frete = $freteR * $shPeso;
            $seguro = $seguroFixo !== null ? $seguroFixo * $shFob : ($fob + $frete) * $pct($s['seguroPct'] ?? 0);
            $origemVA = $extVA * $shFob;
            $origemFora = $extFora * $shFob;
            $capatazia = $N($s['capatazia'] ?? 0) * $shFob;
            $va = $fob + $frete + $seguro + $origemVA + $capatazia;
            $ii = $va * $pct($i['ii'] ?? 0);
            $ipi = ($va + $ii) * $pct($i['ipi'] ?? 0);
            $pis = $va * $pct($i['pis'] ?? 0);
            $cofins = $va * $pct($i['cofins'] ?? 0);
            $af = $afrmm * $shPeso;
            $sc = $qtdTot ? $siscomex * $q / $qtdTot : 0;
            $icms = ($va + $ii + $ipi + $pis + $cofins + $af + $sc) / (1 - $icmsImp) * $icmsImp;
            $dp = $despRateio * $shFob;
            $varCamb = $fobUSD * ($N($s['cambioPag'] ?? 0) - $N($s['cambioDI'] ?? 0));
            $desembolso = $va + $ii + $ipi + $pis + $cofins + $icms + $af + $sc + $dp + $origemFora + $varCamb;
            $creditos = $ipi + $icms + (! empty($s['lucroReal']) ? ($pis + $cofins) : 0);
            $liquido = $desembolso - $creditos;
            $r = compact('fobUSD', 'fob', 'frete', 'seguro', 'origemVA', 'origemFora', 'capatazia', 'va', 'ii', 'ipi', 'pis', 'cofins', 'icms') + ['afrmm' => $af, 'siscomex' => $sc, 'desp' => $dp] + compact('varCamb', 'desembolso', 'creditos', 'liquido');
            foreach ($chaves as $k) {
                $T[$k] += $r[$k];
            }

            $liqU = $liquido / $q;
            $finU = $liqU * $pct($s['finimp'] ?? 0);
            $totU = $liqU + $finU;
            $dedVenda = $pct($s['icmsVenda'] ?? 0) + $pct($s['piscofVenda'] ?? 0);
            $pvSemIPI = $totU / (1 - $pct($s['margem'] ?? 0)) / (1 - $dedVenda);
            $pv = $pvSemIPI * (1 + $pct($i['ipi'] ?? 0));
            $merc = $N($i['mercado'] ?? 0);
            $rlMerc = $merc ? $merc / (1 + $pct($i['ipi'] ?? 0)) * (1 - $dedVenda) : 0;

            $linhas[] = $r + [
                'desc' => (string) ($i['desc'] ?? ''), 'ncm' => (string) ($i['ncm'] ?? ''),
                'qtd' => $q, 'desembolsoU' => $desembolso / $q, 'liqU' => $liqU, 'finU' => $finU, 'totU' => $totU, 'pv' => $pv,
                'merc' => $merc,
                'margemMerc' => $merc ? ($rlMerc - $totU) / $rlMerc : null,
                'fobMax' => $merc ? $N($i['fob'] ?? 0) * $rlMerc * (1 - $pct($s['margem'] ?? 0)) / $totU : null,
            ];
        }

        $cDI = $N($s['cambioDI'] ?? 0) ?: 1;
        $exterior = [
            'fobUSD' => $T['fobUSD'], 'freteUSD' => $N($s['freteUSD'] ?? 0),
            'seguroUSD' => $seguroFixo !== null ? $N($s['seguroUSD']) : $T['seguro'] / $cDI,
            'itens' => $ext, 'origemUSD' => array_sum(array_column($ext, 'usd')),
        ];
        $exterior['totalUSD'] = $exterior['fobUSD'] + $exterior['freteUSD'] + $exterior['seguroUSD'] + $exterior['origemUSD'];

        return [
            'T' => $T, 'linhas' => $linhas, 'adicoes' => $adicoes, 'siscomex' => $siscomex,
            'pesoTot' => $pesoTot, 'qtdTot' => $qtdTot, 'exterior' => $exterior,
            'fatorDesembolso' => $T['fob'] ? $T['desembolso'] / $T['fob'] : 0,
            'fatorLiquido' => $T['fob'] ? $T['liquido'] / $T['fob'] : 0,
        ];
    }

    /** Normaliza o cenário vindo do formulário (números com vírgula ou ponto, caixas de seleção). */
    public static function doFormulario(array $f): array
    {
        $num = function ($v) {
            if (is_string($v)) {
                $v = trim($v);
                if (str_contains($v, ',')) {
                    $v = str_replace(['.', ','], ['', '.'], $v);
                }
            }

            return is_numeric($v) ? (float) $v : 0.0;
        };

        $s = self::padrao('20');
        foreach (['cambioDI', 'cambioFrete', 'cambioPag', 'freteUSD', 'seguroPct', 'seguroUSD', 'capatazia', 'siscomex', 'afrmmPct', 'icmsImp', 'finimp', 'icmsVenda', 'piscofVenda', 'margem'] as $k) {
            if (array_key_exists($k, $f)) {
                $s[$k] = $num($f[$k]);
            }
        }
        $s['modelo'] = (string) ($f['modelo'] ?? 'personalizado');
        $s['siscomexAuto'] = ! empty($f['siscomexAuto']);
        $s['lucroReal'] = ! empty($f['lucroReal']);
        foreach (self::DESPESAS as [$k]) {
            $s['desp'][$k] = $num($f['desp'][$k] ?? 0);
        }
        foreach (self::EXTERIOR as $n => $x) {
            $s['exterior'][$n]['usd'] = $num($f['exterior'][$n] ?? 0);
        }
        $s['itens'] = [];
        foreach (array_values($f['itens'] ?? []) as $i) {
            if (! empty($i['remover'])) {
                continue;
            }
            $s['itens'][] = [
                'desc' => mb_substr(trim((string) ($i['desc'] ?? '')), 0, 160),
                'ncm' => mb_substr(trim((string) ($i['ncm'] ?? '')), 0, 12),
                'fob' => $num($i['fob'] ?? 0), 'qtd' => $num($i['qtd'] ?? 0), 'peso' => $num($i['peso'] ?? 0),
                'ii' => $num($i['ii'] ?? 0), 'ipi' => $num($i['ipi'] ?? 0), 'pis' => $num($i['pis'] ?? 0),
                'cofins' => $num($i['cofins'] ?? 0), 'mercado' => $num($i['mercado'] ?? 0),
            ];
        }

        return $s;
    }

    /** Número como o JavaScript o escreve numa chave de texto (6.5 → "6.5", 0 → "0"), para contar as adições igual ao protótipo. */
    protected static function numJs(float $v): string
    {
        return $v == floor($v) && abs($v) < 1e15 ? (string) (int) $v : rtrim(rtrim(sprintf('%.12F', $v), '0'), '.');
    }
}
