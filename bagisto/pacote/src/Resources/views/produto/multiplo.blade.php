@php
    $importfacilMultiplo = \ImportFacil\Loja\Support\Regras::multiplo((int) $product->id);
    $importfacilUnidade = \ImportFacil\Loja\Support\Regras::unidade((int) $product->id);
    $importfacilTipo = \ImportFacil\Loja\Support\Regras::tipoDoCliente();
@endphp
<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:14px">
    <span style="background:#F4F4F5;border-radius:999px;padding:4px 12px">Venda por {{ $importfacilUnidade }}{{ $importfacilMultiplo > 1 ? ', em múltiplos de '.$importfacilMultiplo : '' }}</span>
    @if ($importfacilTipo)
        <span style="background:#E8EEFC;color:#1E3A8A;border-radius:999px;padding:4px 12px">Preço {{ $importfacilTipo->nome }}: −{{ rtrim(rtrim(number_format($importfacilTipo->desconto, 2, ',', ''), '0'), ',') }}% · pedido mínimo {{ core()->formatPrice((float) $importfacilTipo->pedido_minimo) }}</span>
        @if ($product->new)
            <a href="{{ route('importfacil.importacao.nova', ['produto' => $product->id, 'qtd' => $importfacilMultiplo]) }}" style="background:#1D4ED8;color:#fff;border-radius:999px;padding:4px 12px;text-decoration:none">Encomendar pela importação · {{ \ImportFacil\Loja\Support\Regras::PRAZO_IMPORTACAO }} dias</a>
        @endif
    @else
        <a href="{{ route('shop.customer.session.index') }}" style="background:#FEF3C7;color:#92400E;border-radius:999px;padding:4px 12px;text-decoration:none">Entre com a conta da empresa para ver o seu preço</a>
    @endif
</div>
