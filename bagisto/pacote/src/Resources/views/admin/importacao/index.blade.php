<x-admin::layouts>
    <x-slot:title>Ordens de importação</x-slot>
    @include('importfacil::estilo')

    <div class="if" v-pre>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
            <div>
                <h1>Ordens de importação</h1>
                <p class="if-sub">Pedidas pelas empresas na loja. Sob encomenda, a cobrança sai na entrega; por conta e ordem, a ordem só avança com o numerário pago.</p>
            </div>
            <div class="if-acoes" style="margin:0">
                <a class="if-btn sec" href="{{ route('admin.importfacil.calculadora') }}">Calculadora</a>
                <a class="if-btn sec" href="{{ route('admin.importfacil.empresas') }}">Empresas e conta e ordem</a>
            </div>
        </div>
        @include('importfacil::admin._avisos')

        <div class="if-grade" style="margin-top:16px">
            <div class="if-card if-kpi" style="margin:0"><span>Ordens em andamento</span><b>{{ $resumo['abertas'] }}</b></div>
            <div class="if-card if-kpi" style="margin:0"><span>Valor em andamento</span><b>{{ core()->formatBasePrice($resumo['valor']) }}</b></div>
            <div class="if-card if-kpi" style="margin:0"><span>Numerário a receber (Pix)</span><b>{{ core()->formatBasePrice((float) $resumo['aguardando']) }}</b></div>
        </div>

        <form method="GET" class="if-acoes" style="margin-top:16px">
            <label for="if-st" style="margin:0">Andamento</label>
            <select id="if-st" name="status" style="width:auto" onchange="this.form.submit()">
                <option value="">Todos</option>
                @foreach (\ImportFacil\Loja\Importacao\Ordens::ETAPAS as $e)<option {{ $status === $e ? 'selected' : '' }}>{{ $e }}</option>@endforeach
            </select>
        </form>

        <div class="if-rolar" style="margin-top:12px">
            <table class="if-tabela">
                <thead><tr><th>Ordem</th><th>Empresa</th><th>Data</th><th>Modalidade</th><th>Pagamento</th><th class="n">Total</th><th>Andamento</th></tr></thead>
                <tbody>
                    @forelse ($ordens as $o)
                        <tr>
                            <td><a class="if-link" href="{{ route('admin.importfacil.importacao.ver', $o->id) }}">{{ $o->numero }}</a></td>
                            <td>{{ $o->empresa }}</td>
                            <td>{{ \Carbon\Carbon::parse($o->created_at)->format('d/m/Y') }}</td>
                            <td>{{ \ImportFacil\Loja\Importacao\Ordens::modalidadeTexto($o->modalidade) }}</td>
                            <td>{{ $o->forma_pagamento }}</td>
                            <td class="n">{{ core()->formatBasePrice((float) $o->total) }}</td>
                            <td><span class="if-selo {{ $o->status === 'Entregue' ? 'ok' : ($o->bloqueio ? 'alerta' : '') }}">{{ $o->status }}</span>@if ($o->bloqueio)<br><small class="if-muted">{{ $o->bloqueio }}</small>@endif</td>
                        </tr>
                    @empty
                        <tr><td colspan="7" class="if-muted" style="text-align:center;padding:24px">Nenhuma ordem de importação{{ $status ? ' neste andamento' : '' }}.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</x-admin::layouts>
