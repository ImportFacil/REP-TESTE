{{-- Itens da ordem. Espera $ordem; $ncm = true mostra a coluna NCM. --}}
<div class="if-rolar">
    <table class="if-tabela">
        <thead><tr><th>Produto</th>@if ($ncm ?? false)<th>NCM</th>@endif<th class="n">Qtd.</th><th class="n">Preço</th><th class="n">Total</th></tr></thead>
        <tbody>
            @foreach ($ordem->itens as $i)
                <tr>
                    <td>{{ $i->nome }}<br><small class="if-muted">{{ $i->sku }}</small></td>
                    @if ($ncm ?? false)<td>{{ $i->ncm ? \ImportFacil\Loja\Importacao\Ncm::formatar($i->ncm) : 'A classificar' }}</td>@endif
                    <td class="n">{{ $i->quantidade }} {{ $i->unidade }}</td>
                    <td class="n">{{ core()->formatBasePrice((float) $i->preco) }}</td>
                    <td class="n">{{ core()->formatBasePrice((float) $i->total) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
</div>
