<?php

namespace ImportFacil\Loja\Console;

use Illuminate\Console\Command;
use ImportFacil\Loja\Importacao\Ncm;

class CarregarNcm extends Command
{
    protected $signature = 'importfacil:ncm {arquivo : ncm.json no formato do protótipo}';

    protected $description = 'Carrega a tabela NCM vigente (Receita / Siscomex) para a calculadora e as ordens de importação';

    public function handle(): int
    {
        $r = Ncm::carregar($this->argument('arquivo'));
        \Illuminate\Support\Facades\DB::table('core_config')->updateOrInsert(
            ['code' => 'importfacil.ncm.vigencia', 'channel_code' => null, 'locale_code' => null],
            ['value' => trim(($r['vigencia'] ?? '').' · '.($r['ato'] ?? ''), ' ·'), 'updated_at' => now(), 'created_at' => now()]
        );
        $this->info("Tabela NCM: {$r['total']} códigos ({$r['vigencia']}).");

        return self::SUCCESS;
    }
}
