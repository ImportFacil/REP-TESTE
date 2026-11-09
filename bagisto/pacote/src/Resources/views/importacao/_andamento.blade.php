{{-- Linha do tempo da ordem de importação (cliente e Painel). Espera $ordem. --}}
@php
    $etapas = \ImportFacil\Loja\Importacao\Ordens::ETAPAS;
    $atual = array_search($ordem->status, $etapas, true);
@endphp
<ol class="if-tl">
    @foreach ($etapas as $n => $etapa)
        @php $h = $ordem->historico->where('status', $etapa)->first(); @endphp
        <li class="{{ $n < $atual || ($n === $atual && $etapa === 'Entregue') ? 'feito' : ($n === $atual ? 'agora' : '') }}">
            <b>{{ $etapa }}</b>
            @if ($h)<small>{{ \Carbon\Carbon::parse($h->created_at)->format('d/m/Y H:i') }}{{ $h->por ? ' · '.$h->por : '' }}</small>@endif
        </li>
    @endforeach
</ol>
@php $notas = $ordem->historico->whereNotNull('nota'); @endphp
@if ($notas->count())
    <div style="margin-top:4px">
        @foreach ($notas as $h)
            <div class="if-muted" style="font-size:13px">{{ \Carbon\Carbon::parse($h->created_at)->format('d/m H:i') }} · {{ $h->nota }}</div>
        @endforeach
    </div>
@endif
