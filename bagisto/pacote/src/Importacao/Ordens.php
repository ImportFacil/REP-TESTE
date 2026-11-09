<?php

namespace ImportFacil\Loja\Importacao;

use Illuminate\Support\Facades\DB;
use ImportFacil\Loja\Support\Parcelas;
use ImportFacil\Loja\Support\Regras;
use RuntimeException;

/**
 * Ordens de importação, com as regras do protótipo (index.html, "ORDEM DE COMPRA"):
 *
 * - Sob encomenda: a ImportFácil compra, importa e vende. A cobrança sai na entrega, com a nota de venda,
 *   na forma escolhida (boleto pelo crédito da empresa, Pix ou cartão).
 * - Por conta e ordem (só empresas liberadas pela equipe): o cliente paga o numerário por Pix antes de cada etapa
 *   (mercadoria antes do câmbio; tributos e despesas antes da DUIMP) e a ImportFácil cobra só a taxa de serviço.
 *   A ImportFácil nunca adianta dinheiro próprio: a ordem não avança sem o numerário pago.
 */
class Ordens
{
    const ETAPAS = ['Enviada à importação', 'Recebida pelo setor', 'Em processo de importação', 'Em trânsito', 'Entregue'];

    const INCOTERMS = [
        'CIF — frete e seguro até o destino (padrão)',
        'FOB — embarque por conta do comprador',
        'EXW — retirada na fábrica',
        'DAP — entregue no local, sem impostos de importação',
    ];

    const MOEDAS = ['Reais (BRL)', 'Dólar (USD) — câmbio do dia do faturamento'];

    public static function modalidadeTexto(string $m): string
    {
        return $m === 'contaordem' ? 'Por conta e ordem' : 'Sob encomenda';
    }

    /** Numerário e taxa de serviço da conta e ordem, a partir do total da mercadoria. */
    public static function valoresContaOrdem(float $total): array
    {
        return [
            'merc' => round($total, 2),
            'trib' => round($total * Regras::CO_TRIB_PCT / 100, 2),
            'serv' => round($total * Regras::CO_SERV_PCT / 100, 2),
        ];
    }

    /** Formas de pagamento que a empresa pode escolher, com o motivo quando o boleto não está liberado. */
    public static function formas(?int $empresaId, float $total, string $modalidade): array
    {
        $base = $modalidade === 'contaordem' ? self::valoresContaOrdem($total)['serv'] : $total;
        $boleto = null;
        $max = Regras::maxBoletos($empresaId);
        if ($max < 1) {
            $boleto = 'A faixa de crédito da empresa não permite boleto.';
        } else {
            $disp = Regras::creditoDisponivel($empresaId);
            if ($disp === null || $disp < $base) {
                $boleto = 'Crédito disponível insuficiente para o boleto ('.core()->formatBasePrice(max(0, (float) $disp)).').';
            }
        }

        return [
            'Boleto' => ['texto' => 'Boleto 30/60/90/120 dias (crédito da empresa, até '.max(1, $max).'×)', 'bloqueio' => $boleto],
            'Pix' => ['texto' => 'Pix', 'bloqueio' => null],
            'Cartão' => ['texto' => 'Cartão de crédito em até 12×', 'bloqueio' => null],
        ];
    }

    /**
     * Cria a ordem a partir dos itens escolhidos pelo cliente (preço do tipo de cliente, quantidade no múltiplo).
     *
     * @param  array  $itens  lista de [product_id, sku, nome, unidade, quantidade, preco]
     */
    public static function criar($cliente, array $itens, array $dados): object
    {
        $empresa = Regras::empresaId($cliente);
        $modalidade = ($dados['modalidade'] ?? '') === 'contaordem' && Regras::contaEOrdem($empresa) ? 'contaordem' : 'encomenda';
        $total = round(array_sum(array_map(fn ($i) => $i['quantidade'] * $i['preco'], $itens)), 2);

        if (! $itens || $total <= 0) {
            throw new RuntimeException('Escolha ao menos um item.');
        }

        $forma = $dados['forma_pagamento'] ?? '';
        $formas = self::formas($empresa, $total, $modalidade);
        if (! isset($formas[$forma])) {
            throw new RuntimeException('Escolha a forma de pagamento.');
        }
        if ($formas[$forma]['bloqueio']) {
            throw new RuntimeException($formas[$forma]['bloqueio'].' Escolha Pix ou cartão.');
        }

        return DB::transaction(function () use ($cliente, $empresa, $modalidade, $itens, $dados, $total, $forma) {
            $agora = now();
            $id = DB::table('importfacil_ordens_importacao')->insertGetId([
                'company_id' => $empresa,
                'customer_id' => $cliente->id,
                'tipo' => Regras::tipoDoCliente($cliente)?->codigo,
                'modalidade' => $modalidade,
                'forma_pagamento' => $forma,
                'incoterm' => in_array($dados['incoterm'] ?? '', self::INCOTERMS, true) ? $dados['incoterm'] : self::INCOTERMS[0],
                'moeda' => in_array($dados['moeda'] ?? '', self::MOEDAS, true) ? $dados['moeda'] : self::MOEDAS[0],
                'po_cliente' => mb_substr(trim((string) ($dados['po_cliente'] ?? '')), 0, 60) ?: null,
                'responsavel' => mb_substr(trim((string) $dados['responsavel']), 0, 120),
                'cargo' => mb_substr(trim((string) $dados['cargo']), 0, 80),
                'observacoes' => mb_substr(trim((string) ($dados['observacoes'] ?? '')), 0, 2000) ?: null,
                'exigencias' => 'Classificação fiscal (NCM) e licenças de importação conferidas pelo Setor de Importação',
                'status' => self::ETAPAS[0],
                'total' => $total,
                'recebimento_previsto' => $agora->copy()->addDays(Regras::PRAZO_IMPORTACAO)->toDateString(),
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);
            DB::table('importfacil_ordens_importacao')->where('id', $id)->update(['numero' => 'OI-'.(5000 + $id)]);

            foreach ($itens as $i) {
                DB::table('importfacil_ordens_importacao_itens')->insert([
                    'ordem_id' => $id,
                    'product_id' => $i['product_id'] ?? null,
                    'sku' => $i['sku'] ?? null,
                    'nome' => $i['nome'],
                    'unidade' => $i['unidade'] ?? 'un',
                    'quantidade' => $i['quantidade'],
                    'preco' => round($i['preco'], 2),
                    'total' => round($i['quantidade'] * $i['preco'], 2),
                ]);
            }

            self::historico($id, self::ETAPAS[0], $dados['responsavel'].' ('.$dados['cargo'].')', 'Compra autorizada pelo cliente (aceite eletrônico).');

            if ($modalidade === 'contaordem') {
                self::numerario($id, 'cambio', self::valoresContaOrdem($total)['merc'], 'Numerário da mercadoria (câmbio)');
            }

            return self::buscar($id);
        });
    }

    public static function buscar(int $id): ?object
    {
        $o = DB::table('importfacil_ordens_importacao')->where('id', $id)->first();
        if (! $o) {
            return null;
        }
        $o->itens = DB::table('importfacil_ordens_importacao_itens')->where('ordem_id', $id)->orderBy('id')->get();
        $o->historico = DB::table('importfacil_ordens_importacao_historico')->where('ordem_id', $id)->orderBy('id')->get();
        $o->parcelas = DB::table('importfacil_parcelas')->where('ordem_importacao_id', $id)->orderBy('id')->get();
        $o->prestacao = $o->prestacao ? json_decode($o->prestacao, true) : null;
        $o->bloqueio = self::bloqueio($o);
        $o->proxima = self::ETAPAS[array_search($o->status, self::ETAPAS, true) + 1] ?? null;

        return $o;
    }

    protected static function historico(int $id, string $status, ?string $por, ?string $nota = null): void
    {
        DB::table('importfacil_ordens_importacao_historico')->insert([
            'ordem_id' => $id, 'status' => $status, 'por' => $por, 'nota' => $nota, 'created_at' => now(),
        ]);
    }

    /** Cobrança Pix do numerário (conta e ordem), uma por etapa. */
    protected static function numerario(int $id, string $etapa, float $valor, string $rotulo): void
    {
        if (DB::table('importfacil_parcelas')->where('ordem_importacao_id', $id)->where('etapa', $etapa)->exists()) {
            return;
        }
        $o = DB::table('importfacil_ordens_importacao')->where('id', $id)->first();
        $agora = now();
        DB::table('importfacil_parcelas')->insert([
            'order_id' => null, 'ordem_importacao_id' => $id, 'company_id' => $o->company_id, 'customer_id' => $o->customer_id,
            'numero' => 1, 'de' => 1, 'forma' => 'Pix · numerário', 'etapa' => $etapa, 'rotulo' => $rotulo,
            'valor' => round($valor, 2), 'vencimento' => $agora->copy()->addDay()->toDateString(), 'pago_em' => null,
            'created_at' => $agora, 'updated_at' => $agora,
        ]);
    }

    protected static function numerarioPago(object $o, string $etapa): bool
    {
        return DB::table('importfacil_parcelas')->where('ordem_importacao_id', $o->id)->where('etapa', $etapa)->whereNotNull('pago_em')->exists();
    }

    /** O que impede a ordem de avançar (só na conta e ordem). */
    public static function bloqueio(object $o): ?string
    {
        $i = array_search($o->status, self::ETAPAS, true);
        $prox = self::ETAPAS[$i + 1] ?? null;
        if ($o->modalidade !== 'contaordem' || ! $prox) {
            return null;
        }
        if ($prox === 'Em processo de importação' && ! self::numerarioPago($o, 'cambio')) {
            return 'Aguardando o numerário da mercadoria para fechar o câmbio';
        }
        if ($prox === 'Entregue' && ! self::numerarioPago($o, 'tributos')) {
            return 'Aguardando o numerário de tributos para registrar a DUIMP';
        }

        return null;
    }

    /** Avança para a próxima etapa; na entrega, fatura. */
    public static function avancar(int $id, string $por): object
    {
        return DB::transaction(function () use ($id, $por) {
            $o = DB::table('importfacil_ordens_importacao')->where('id', $id)->lockForUpdate()->first();
            if (! $o) {
                throw new RuntimeException('Ordem não encontrada.');
            }
            $i = array_search($o->status, self::ETAPAS, true);
            $prox = self::ETAPAS[$i + 1] ?? null;
            if (! $prox) {
                throw new RuntimeException('A ordem já foi entregue.');
            }
            if ($b = self::bloqueio($o)) {
                throw new RuntimeException($b.'.');
            }

            DB::table('importfacil_ordens_importacao')->where('id', $id)->update(['status' => $prox, 'updated_at' => now()]);
            self::historico($id, $prox, $por);

            if ($o->modalidade === 'contaordem' && $prox === 'Em trânsito') {
                self::numerario($id, 'tributos', self::valoresContaOrdem((float) $o->total)['trib'], 'Numerário de tributos e despesas');
            }
            if ($prox === 'Entregue') {
                self::faturar($id);
            }

            return self::buscar($id);
        });
    }

    /** O banco confirmou o Pix do numerário (simulado até a integração com o Asaas). */
    public static function confirmarNumerario(int $id, string $etapa, string $por): void
    {
        $n = DB::table('importfacil_parcelas')->where('ordem_importacao_id', $id)->where('etapa', $etapa)->whereNull('pago_em')
            ->update(['pago_em' => now(), 'updated_at' => now()]);
        if ($n) {
            self::historico($id, DB::table('importfacil_ordens_importacao')->where('id', $id)->value('status'), $por,
                $etapa === 'cambio' ? 'Pix do numerário da mercadoria confirmado.' : 'Pix do numerário de tributos confirmado.');
        }
    }

    /**
     * Entrega = faturamento. Encomenda: nota de venda e cobrança do total na forma escolhida.
     * Conta e ordem: notas de saída e de serviço, cobrança só da taxa de serviço e prestação de contas do numerário.
     */
    protected static function faturar(int $id): void
    {
        $o = DB::table('importfacil_ordens_importacao')->where('id', $id)->first();
        if ($o->faturada_em) {
            return;
        }
        $co = $o->modalidade === 'contaordem';
        $v = self::valoresContaOrdem((float) $o->total);
        $nfe = (int) DB::table('importfacil_ordens_importacao')->max('nfe_numero') ?: 1000;

        Parcelas::gerar($o->forma_pagamento, $co ? $v['serv'] : (float) $o->total, [
            'ordem_importacao_id' => $id, 'company_id' => $o->company_id, 'customer_id' => $o->customer_id,
            'etapa' => $co ? 'servico' : 'venda', 'rotulo' => $co ? 'Taxa de serviço' : 'Venda '.$o->numero,
        ]);

        $prestacao = null;
        if ($co) {
            $recebido = (float) DB::table('importfacil_parcelas')->where('ordem_importacao_id', $id)
                ->whereIn('etapa', ['cambio', 'tributos'])->whereNotNull('pago_em')->sum('valor');
            $gasto = $v['merc'] + $v['trib'];
            $prestacao = ['recebido' => $recebido, 'gasto' => $gasto, 'saldo' => round($recebido - $gasto, 2)];
        }

        DB::table('importfacil_ordens_importacao')->where('id', $id)->update([
            'nfe_numero' => $nfe + 1, 'faturada_em' => now(), 'updated_at' => now(),
            'prestacao' => $prestacao ? json_encode($prestacao) : null,
        ]);
    }

    /** Classificação fiscal conferida pelo Setor de Importação: NCM de cada item (8 dígitos da tabela vigente). */
    public static function definirNcm(int $id, array $ncms): array
    {
        $invalidos = [];
        foreach ($ncms as $itemId => $ncm) {
            $c = preg_replace('/\D/', '', (string) $ncm);
            if ($c !== '' && ! Ncm::existe($c)) {
                $invalidos[] = $ncm;

                continue;
            }
            DB::table('importfacil_ordens_importacao_itens')->where('ordem_id', $id)->where('id', (int) $itemId)->update(['ncm' => $c ?: null]);
        }

        return $invalidos;
    }
}
