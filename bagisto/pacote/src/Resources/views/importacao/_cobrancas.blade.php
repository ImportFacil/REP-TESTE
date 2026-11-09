{{-- Modalidade, numerário, cobranças e prestação de contas da ordem (cliente e Painel). Espera $ordem, $co; $painel = true no Painel. --}}
@php $contaOrdem = $ordem->modalidade === 'contaordem'; $painel = $painel ?? false; @endphp
<h2>{{ \ImportFacil\Loja\Importacao\Ordens::modalidadeTexto($ordem->modalidade) }}</h2>
@if ($contaOrdem)
    <p class="if-muted">O cliente compra em seu nome e paga o numerário por Pix antes de cada etapa. A ImportFácil cobra só o serviço.</p>
    <div class="if-linha"><span>Numerário da mercadoria (antes do câmbio)</span><b>{{ core()->formatBasePrice($co['merc']) }}</b></div>
    <div class="if-linha"><span>Numerário de tributos e despesas (estimado, antes da DUIMP)</span><b>{{ core()->formatBasePrice($co['trib']) }}</b></div>
    <div class="if-linha"><span>Taxa de serviço · {{ $ordem->forma_pagamento }}</span><b>{{ core()->formatBasePrice($co['serv']) }}</b></div>
    @if ($ordem->bloqueio)
        <div class="if-aviso"><b>{{ $ordem->bloqueio }}.</b> A ordem avança assim que o banco confirmar o Pix.</div>
    @endif
@else
    <p class="if-muted">A ImportFácil compra, importa e vende. A cobrança sai na entrega, com a nota de venda.</p>
    <div class="if-linha"><span>Pagamento</span><b>{{ $ordem->forma_pagamento }}</b></div>
    <div class="if-linha"><span>Total</span><b>{{ core()->formatBasePrice((float) $ordem->total) }}</b></div>
@endif
@if ($ordem->nfe_numero)
    <div class="if-linha"><span>{{ $contaOrdem ? 'Notas de saída e de serviço' : 'NF-e de venda' }}</span><b>nº {{ $ordem->nfe_numero }} · {{ \Carbon\Carbon::parse($ordem->faturada_em)->format('d/m/Y') }}</b></div>
@endif

@if ($ordem->parcelas->count())
    <div class="if-rolar" style="margin-top:12px">
        <table class="if-tabela">
            <thead><tr><th>Cobrança</th><th>Forma</th><th>Vencimento</th><th class="n">Valor</th><th>Situação</th>@if ($painel)<th></th>@endif</tr></thead>
            <tbody>
                @foreach ($ordem->parcelas as $p)
                    <tr>
                        <td>{{ $p->rotulo ?: 'Parcela '.$p->numero.'/'.$p->de }}</td>
                        <td>{{ $p->forma }}</td>
                        <td>{{ \Carbon\Carbon::parse($p->vencimento)->format('d/m/Y') }}</td>
                        <td class="n">{{ core()->formatBasePrice((float) $p->valor) }}</td>
                        <td><span class="if-selo {{ $p->pago_em ? 'ok' : 'alerta' }}">{{ $p->pago_em ? 'Pago' : 'A pagar' }}</span></td>
                        @if ($painel)
                            <td>
                                @if (! $p->pago_em && in_array($p->etapa, ['cambio', 'tributos'], true))
                                    <form method="POST" action="{{ route('admin.importfacil.importacao.numerario', $ordem->id) }}" style="margin:0">
                                        @csrf<input type="hidden" name="etapa" value="{{ $p->etapa }}">
                                        <button class="if-btn sec" type="submit" style="padding:4px 10px">Confirmar Pix recebido</button>
                                    </form>
                                @endif
                            </td>
                        @endif
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
    @if (! $painel && $ordem->parcelas->whereNull('pago_em')->where('forma', 'Pix · numerário')->count())
        <p class="if-muted" style="margin-top:8px">O código Pix (copia e cola) do numerário vale por 24 horas. Pix simulado nesta versão: a confirmação é feita pelo Setor de Importação.</p>
    @endif
@endif

@if ($ordem->prestacao)
    <h2 style="margin-top:14px">Prestação de contas</h2>
    <div class="if-linha"><span>Numerário recebido</span><b>{{ core()->formatBasePrice($ordem->prestacao['recebido']) }}</b></div>
    <div class="if-linha"><span>Gasto na importação</span><b>{{ core()->formatBasePrice($ordem->prestacao['gasto']) }}</b></div>
    <div class="if-linha"><span>{{ $ordem->prestacao['saldo'] >= 0 ? 'Saldo a devolver' : 'Saldo a cobrar' }}</span><b>{{ core()->formatBasePrice(abs($ordem->prestacao['saldo'])) }}</b></div>
    <p class="if-muted">Nesta versão, o gasto real é igual à estimativa.</p>
@endif
