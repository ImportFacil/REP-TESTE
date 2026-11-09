<x-admin::layouts>
    <x-slot:title>Ordem {{ $ordem->numero }}</x-slot>
    @include('importfacil::estilo')

    <div class="if" v-pre>
        <p><a class="if-link" href="{{ route('admin.importfacil.importacao.index') }}">← Ordens de importação</a></p>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div>
                <h1>Ordem {{ $ordem->numero }} <span class="if-selo {{ $ordem->status === 'Entregue' ? 'ok' : '' }}">{{ $ordem->status }}</span></h1>
                <p class="if-sub">{{ $empresa }} · {{ \ImportFacil\Loja\Importacao\Ordens::modalidadeTexto($ordem->modalidade) }} · {{ core()->formatBasePrice((float) $ordem->total) }} · previsão {{ \Carbon\Carbon::parse($ordem->recebimento_previsto)->format('d/m/Y') }}</p>
            </div>
            <div class="if-acoes" style="margin:0">
                <a class="if-btn sec" href="{{ route('admin.importfacil.calculadora', ['ordem' => $ordem->id]) }}">Calcular o custo desta ordem</a>
                @if ($ordem->proxima)
                    <form method="POST" action="{{ route('admin.importfacil.importacao.avancar', $ordem->id) }}" style="margin:0">
                        @csrf
                        <button class="if-btn" type="submit" {{ $ordem->bloqueio ? 'disabled' : '' }}>Avançar para: {{ $ordem->proxima }}</button>
                    </form>
                @endif
            </div>
        </div>
        @include('importfacil::admin._avisos')
        @if ($ordem->proxima === 'Entregue' && ! $ordem->bloqueio)
            <div class="if-aviso info">Ao marcar como entregue, a ordem é faturada: {{ $ordem->modalidade === 'contaordem' ? 'notas de saída e de serviço, cobrança da taxa de serviço e prestação de contas do numerário' : 'NF-e de venda e cobrança do total ('.$ordem->forma_pagamento.')' }}.</div>
        @endif

        <div class="if-dois" style="align-items:start">
            <div>
                <div class="if-card"><h2>Andamento</h2>@include('importfacil::importacao._andamento')</div>
                <div class="if-card">
                    <h2>Cliente</h2>
                    <div class="if-linha"><span>Empresa</span><b>{{ $empresa }}</b></div>
                    @if ($cliente)<div class="if-linha"><span>Usuário</span><span>{{ $cliente->first_name }} {{ $cliente->last_name }} · {{ $cliente->email }}</span></div>@endif
                    <div class="if-linha"><span>Aprovação</span><span>{{ $ordem->responsavel }} · {{ $ordem->cargo }}</span></div>
                    <div class="if-linha"><span>Incoterm</span><span>{{ $ordem->incoterm }}</span></div>
                    <div class="if-linha"><span>Moeda</span><span>{{ $ordem->moeda }}</span></div>
                    @if ($ordem->po_cliente)<div class="if-linha"><span>Pedido do cliente</span><span>{{ $ordem->po_cliente }}</span></div>@endif
                    @if ($ordem->observacoes)<div class="if-linha"><span>Observações</span><span>{{ $ordem->observacoes }}</span></div>@endif
                </div>
            </div>
            <div class="if-card">@include('importfacil::importacao._cobrancas', ['painel' => true])</div>
        </div>

        <div class="if-card">
            <h2>Itens e classificação fiscal (NCM)</h2>
            <p class="if-muted">{{ $ordem->exigencias }}. Use códigos de 8 dígitos da tabela vigente; a busca fica na <a class="if-link" href="{{ route('admin.importfacil.ncm') }}" target="_blank">Tabela NCM</a>.</p>
            <form method="POST" action="{{ route('admin.importfacil.importacao.ncm', $ordem->id) }}">
                @csrf
                <div class="if-rolar" style="margin-top:10px">
                    <table class="if-tabela">
                        <thead><tr><th>Produto</th><th style="min-width:180px">NCM</th><th class="n">Qtd.</th><th class="n">Preço</th><th class="n">Total</th></tr></thead>
                        <tbody>
                            @foreach ($ordem->itens as $i)
                                <tr>
                                    <td>{{ $i->nome }}<br><small class="if-muted">{{ $i->sku }}</small></td>
                                    <td><input type="text" name="ncm[{{ $i->id }}]" value="{{ \ImportFacil\Loja\Importacao\Ncm::formatar($i->ncm) }}" placeholder="0000.00.00" list="if-ncm-lista" class="if-ncm" aria-label="NCM de {{ $i->nome }}">
                                        @if ($i->ncm_descricao)<small class="if-muted" style="display:block;margin-top:2px">{{ \Illuminate\Support\Str::limit($i->ncm_descricao, 140) }}</small>@endif</td>
                                    <td class="n">{{ $i->quantidade }} {{ $i->unidade }}</td>
                                    <td class="n">{{ core()->formatBasePrice((float) $i->preco) }}</td>
                                    <td class="n">{{ core()->formatBasePrice((float) $i->total) }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
                <datalist id="if-ncm-lista"></datalist>
                <div class="if-acoes"><button class="if-btn" type="submit">Salvar NCM</button></div>
            </form>
        </div>
    </div>

    @include('importfacil::admin._busca-ncm')
</x-admin::layouts>
