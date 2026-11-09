<x-shop::layouts.account>
    <x-slot:title>Financeiro</x-slot>

    <div class="max-md:hidden">
        <x-shop::layouts.account.navigation />
    </div>

    <div class="mx-4 flex-auto max-md:mx-6 max-sm:mx-4">
        <div class="mb-8 flex items-center max-sm:mb-5">
            <a class="grid md:hidden" href="{{ route('shop.customers.account.profile.index') }}"><span class="icon-arrow-left text-2xl"></span></a>
            <h2 class="text-2xl font-medium max-sm:text-base ltr:ml-2.5 md:ltr:ml-0">Financeiro</h2>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="rounded-xl border border-zinc-200 bg-white p-5">
                <span class="text-xs uppercase tracking-wide text-zinc-400">Em aberto</span>
                <p class="mt-1.5 text-xl font-semibold text-zinc-800">{{ core()->formatBasePrice($aberto) }}</p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-5">
                <span class="text-xs uppercase tracking-wide text-zinc-400">Vencido</span>
                <p class="mt-1.5 text-xl font-semibold {{ $vencido > 0 ? 'text-red-600' : 'text-zinc-800' }}">{{ core()->formatBasePrice($vencido) }}</p>
            </div>
        </div>

        <p class="mt-4 text-sm text-zinc-500">
            @if ($tipo) Tipo de cliente: {{ $tipo->nome }}. @endif
            @if ($faixa) Faixa de crédito {{ $faixa }}: boleto em até {{ \ImportFacil\Loja\Support\Regras::FAIXAS[$faixa]['max_boleto'] }}× (30/60/90/120 dias). @endif
            Pix com 3% de desconto; cartão em até 12×.
        </p>

        <div class="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table class="w-full text-left text-sm">
                <thead class="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr><th class="px-4 py-3">Pedido</th><th class="px-4 py-3">Parcela</th><th class="px-4 py-3">Forma</th><th class="px-4 py-3">Vencimento</th><th class="px-4 py-3">Valor</th><th class="px-4 py-3">Situação</th></tr>
                </thead>
                <tbody>
                    @forelse ($parcelas as $p)
                        <tr class="border-t border-zinc-200">
                            <td class="px-4 py-3">#{{ $p->increment_id }}</td>
                            <td class="px-4 py-3">{{ $p->numero }}/{{ $p->de }}</td>
                            <td class="px-4 py-3">{{ $p->forma }}</td>
                            <td class="px-4 py-3">{{ \Carbon\Carbon::parse($p->vencimento)->format('d/m/Y') }}</td>
                            <td class="px-4 py-3">{{ core()->formatBasePrice((float) $p->valor) }}</td>
                            <td class="px-4 py-3"><span class="{{ $p->situacao === 'Pago' ? 'label-active' : ($p->situacao === 'Vencido' ? 'label-canceled' : 'label-pending') }}">{{ $p->situacao }}</span></td>
                        </tr>
                    @empty
                        <tr><td colspan="6" class="px-4 py-6 text-center text-zinc-500">Nenhuma cobrança ainda. Elas aparecem aqui quando um pedido é feito.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</x-shop::layouts.account>
