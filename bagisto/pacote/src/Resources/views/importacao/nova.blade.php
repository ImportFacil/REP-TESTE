@php
    $R = \ImportFacil\Loja\Support\Regras::class;
    $O = \ImportFacil\Loja\Importacao\Ordens::class;
    $mod = old('modalidade', 'encomenda');
@endphp
<x-shop::layouts.account>
    <x-slot:title>Nova ordem de importação</x-slot>

    <div class="max-md:hidden"><x-shop::layouts.account.navigation /></div>

    <div class="mx-4 flex-auto max-md:mx-6 max-sm:mx-4">
        @include('importfacil::estilo')
        @include('importfacil::importacao._conta', ['titulo' => 'Nova ordem de importação', 'voltar' => route('importfacil.importacao.index')])

        <div class="if" v-pre>
            @if ($errors->any())
                <div class="if-aviso erro" role="alert">{!! implode('<br>', array_map('e', $errors->all())) !!}</div>
            @endif

            @if (! $itens)
                <div class="if-card">
                    <h2>Nenhum item para importar</h2>
                    <p class="if-muted">Adicione ao carrinho os itens da linha de importação e volte aqui, ou use o botão "Encomendar pela importação" na página do produto.</p>
                    <div class="if-acoes"><a class="if-btn" href="{{ url('/') }}">Ir para a loja</a></div>
                </div>
            @else
            <form method="POST" action="{{ route('importfacil.importacao.criar') }}">
                @csrf
                <input type="hidden" name="origem" value="{{ $origem }}">

                <div class="if-card">
                    <h2>Itens · {{ $nomeEmpresa }}</h2>
                    <div class="if-rolar">
                        <table class="if-tabela">
                            <thead><tr><th>Produto</th><th class="n">Quantidade</th><th class="n">Preço</th><th class="n">Total</th></tr></thead>
                            <tbody>
                                @foreach ($itens as $i)
                                    <tr>
                                        <td>{{ $i['nome'] }}<br><small class="if-muted">{{ $i['sku'] }}{{ $i['multiplo'] > 1 ? ' · múltiplos de '.$i['multiplo'].' '.$i['unidade'] : '' }}</small></td>
                                        <td class="n"><input type="number" name="itens[{{ $i['product_id'] }}]" value="{{ old('itens.'.$i['product_id'], $i['quantidade']) }}" min="0" step="{{ $i['multiplo'] }}" style="width:96px;text-align:right" aria-label="Quantidade de {{ $i['nome'] }}"></td>
                                        <td class="n">{{ core()->formatBasePrice($i['preco']) }}</td>
                                        <td class="n">{{ core()->formatBasePrice($i['quantidade'] * $i['preco']) }}</td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    <div class="if-linha" style="margin-top:10px"><span>Total da mercadoria (preço do seu tipo de cliente)</span><b>{{ core()->formatBasePrice($total) }}</b></div>
                    <div class="if-linha"><span>Previsão de recebimento</span><b>{{ $previsao->format('d/m/Y') }} ({{ $R::PRAZO_IMPORTACAO }} dias)</b></div>
                    <p class="if-muted" style="margin-top:6px">A quantidade segue o múltiplo de venda. O preço final é o desta tela; para negociar antes, use "Solicitar cotação" no carrinho.</p>
                </div>

                <div class="if-card">
                    <h2>Modalidade de importação</h2>
                    <label class="if-opcao"><input type="radio" name="modalidade" value="encomenda" {{ $mod === 'encomenda' ? 'checked' : '' }}>
                        <span><b>Sob encomenda</b><small>A ImportFácil compra, importa e vende a você. A cobrança sai na entrega, com a nota de venda.</small></span></label>
                    @if ($contaOrdem)
                        <label class="if-opcao"><input type="radio" name="modalidade" value="contaordem" {{ $mod === 'contaordem' ? 'checked' : '' }}>
                            <span><b>Por conta e ordem</b><small>Você compra em seu nome e paga o numerário por Pix antes de cada etapa: mercadoria {{ core()->formatBasePrice($co['merc']) }} antes do câmbio, tributos e despesas estimados em {{ core()->formatBasePrice($co['trib']) }} antes da DUIMP. A ImportFácil cobra só a taxa de serviço, {{ core()->formatBasePrice($co['serv']) }}.</small></span></label>
                    @else
                        <p class="if-muted" style="margin-top:8px">Conta e ordem: disponível para empresas liberadas pela equipe (clientes faixa A).</p>
                    @endif
                </div>

                <div class="if-card">
                    <h2>Pagamento</h2>
                    @foreach ($formas as $f => $info)
                        @php $bloq = $info['bloqueio']; @endphp
                        <label class="if-opcao"><input type="radio" name="forma_pagamento" value="{{ $f }}" {{ old('forma_pagamento', $formas['Boleto']['bloqueio'] ? 'Pix' : 'Boleto') === $f ? 'checked' : '' }} {{ $bloq && $formasCo[$f]['bloqueio'] ? 'disabled' : '' }}>
                            <span><b>{{ $info['texto'] }}</b>@if ($bloq)<small>{{ $bloq }}</small>@endif</span></label>
                    @endforeach
                    <p class="if-muted" style="margin-top:8px">Sob encomenda, a forma vale para o total, cobrado na entrega. Por conta e ordem, vale para a taxa de serviço.</p>
                </div>

                <div class="if-card">
                    <h2>Dados para o Setor de Importação</h2>
                    <div class="if-dois">
                        <div><label for="if-resp">Responsável pela aprovação *</label><input type="text" id="if-resp" name="responsavel" value="{{ old('responsavel', trim($cliente->first_name.' '.$cliente->last_name)) }}" required></div>
                        <div><label for="if-cargo">Cargo *</label><input type="text" id="if-cargo" name="cargo" value="{{ old('cargo') }}" placeholder="Ex.: Gerente de compras" required></div>
                        <div><label for="if-inco">Incoterm (condição de entrega internacional)</label>
                            <select id="if-inco" name="incoterm">@foreach ($O::INCOTERMS as $x)<option {{ old('incoterm') === $x ? 'selected' : '' }}>{{ $x }}</option>@endforeach</select></div>
                        <div><label for="if-moeda">Moeda de faturamento</label>
                            <select id="if-moeda" name="moeda">@foreach ($O::MOEDAS as $x)<option {{ old('moeda') === $x ? 'selected' : '' }}>{{ $x }}</option>@endforeach</select></div>
                        <div><label for="if-po">Nº do seu pedido de compra (opcional)</label><input type="text" id="if-po" name="po_cliente" value="{{ old('po_cliente') }}" placeholder="Número interno, se houver"></div>
                    </div>
                    <label for="if-obs">Observações para o Setor de Importação</label>
                    <textarea id="if-obs" name="observacoes" rows="2" placeholder="Prioridade, documentos exigidos, janela de entrega…">{{ old('observacoes') }}</textarea>
                    <label class="if-opcao" style="margin-top:14px"><input type="checkbox" name="aceite" value="1" {{ old('aceite') ? 'checked' : '' }}>
                        <span>Confirmo os itens e as condições acima e <b>autorizo o fechamento da compra</b>. Esta confirmação gera uma ordem de importação enviada ao Setor de Importação.</span></label>
                    <div class="if-acoes"><button type="submit" class="if-btn">Confirmar e enviar ao Setor de Importação</button></div>
                </div>
            </form>
            @endif
        </div>
    </div>
</x-shop::layouts.account>
