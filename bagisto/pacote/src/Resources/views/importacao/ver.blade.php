<x-shop::layouts.account>
    <x-slot:title>Ordem {{ $ordem->numero }}</x-slot>

    <div class="max-md:hidden"><x-shop::layouts.account.navigation /></div>

    <div class="mx-4 flex-auto max-md:mx-6 max-sm:mx-4">
        @include('importfacil::estilo')
        @include('importfacil::importacao._conta', ['titulo' => 'Ordem '.$ordem->numero, 'voltar' => route('importfacil.importacao.index')])

        <div class="if" v-pre>
            <p class="if-sub">
                {{ $nomeEmpresa }} · {{ \Carbon\Carbon::parse($ordem->created_at)->format('d/m/Y') }} ·
                previsão de recebimento {{ \Carbon\Carbon::parse($ordem->recebimento_previsto)->format('d/m/Y') }}
            </p>
            @if (session('success'))<div class="if-aviso ok">{{ session('success') }}</div>@endif

            <div class="if-card">
                <h2>Andamento na importação</h2>
                @include('importfacil::importacao._andamento')
            </div>

            <div class="if-card">@include('importfacil::importacao._cobrancas')</div>

            <div class="if-card">
                <h2>Itens</h2>
                @include('importfacil::importacao._itens', ['ncm' => true])
            </div>

            <div class="if-card">
                <h2>Condições</h2>
                <div class="if-linha"><span>Incoterm</span><b>{{ $ordem->incoterm }}</b></div>
                <div class="if-linha"><span>Moeda de faturamento</span><b>{{ $ordem->moeda }}</b></div>
                @if ($ordem->po_cliente)<div class="if-linha"><span>Seu pedido de compra</span><b>{{ $ordem->po_cliente }}</b></div>@endif
                <div class="if-linha"><span>Aprovação</span><b>{{ $ordem->responsavel }} · {{ $ordem->cargo }}</b></div>
                <div class="if-linha"><span>Exigências</span><span>{{ $ordem->exigencias }}</span></div>
                @if ($ordem->observacoes)<div class="if-linha"><span>Observações</span><span>{{ $ordem->observacoes }}</span></div>@endif
            </div>
        </div>
    </div>
</x-shop::layouts.account>
