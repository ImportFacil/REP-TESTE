<x-shop::layouts.account>
    <x-slot:title>Importação</x-slot>

    <div class="max-md:hidden"><x-shop::layouts.account.navigation /></div>

    <div class="mx-4 flex-auto max-md:mx-6 max-sm:mx-4">
        @include('importfacil::estilo')
        @include('importfacil::importacao._conta', ['titulo' => 'Importação'])

        <div class="if" v-pre>
            <p class="if-sub">
                Encomende itens da linha de importação com recebimento em {{ \ImportFacil\Loja\Support\Regras::PRAZO_IMPORTACAO }} dias.
                {{ $contaOrdem ? 'Sua empresa pode importar sob encomenda ou por conta e ordem.' : 'Sua empresa importa sob encomenda: a ImportFácil compra, importa e vende a você.' }}
            </p>
            <div class="if-acoes">
                <a class="if-btn" href="{{ route('importfacil.importacao.nova') }}">Nova ordem com os itens do carrinho</a>
                <a class="if-btn sec" href="{{ url('/') }}">Escolher itens na loja</a>
            </div>

            <div class="if-rolar" style="margin-top:20px">
                <table class="if-tabela">
                    <thead><tr><th>Ordem</th><th>Data</th><th>Modalidade</th><th class="n">Total</th><th>Previsão</th><th>Andamento</th></tr></thead>
                    <tbody>
                        @forelse ($ordens as $o)
                            <tr>
                                <td><a class="if-link" href="{{ route('importfacil.importacao.ver', $o->id) }}">{{ $o->numero }}</a></td>
                                <td>{{ \Carbon\Carbon::parse($o->created_at)->format('d/m/Y') }}</td>
                                <td>{{ \ImportFacil\Loja\Importacao\Ordens::modalidadeTexto($o->modalidade) }}</td>
                                <td class="n">{{ core()->formatBasePrice((float) $o->total) }}</td>
                                <td>{{ $o->recebimento_previsto ? \Carbon\Carbon::parse($o->recebimento_previsto)->format('d/m/Y') : '—' }}</td>
                                <td><span class="if-selo {{ $o->status === 'Entregue' ? 'ok' : '' }}">{{ $o->status }}</span></td>
                            </tr>
                        @empty
                            <tr><td colspan="6" class="if-muted" style="text-align:center;padding:24px">Nenhuma ordem de importação ainda. Monte o carrinho com os itens e toque em "Encomendar pela importação".</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</x-shop::layouts.account>
