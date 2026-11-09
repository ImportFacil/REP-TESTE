{{-- Moldura da conta da empresa: menu lateral e título. Uso: @include('importfacil::importacao._conta', ['titulo' => ..., 'voltar' => url]) dentro de x-shop::layouts.account --}}
<div class="mb-8 flex items-center max-sm:mb-5">
    <a class="grid md:hidden" href="{{ $voltar ?? route('shop.customers.account.profile.index') }}" aria-label="Voltar"><span class="icon-arrow-left text-2xl"></span></a>
    <h2 class="text-2xl font-medium max-sm:text-base ltr:ml-2.5 md:ltr:ml-0">{{ $titulo }}</h2>
</div>
