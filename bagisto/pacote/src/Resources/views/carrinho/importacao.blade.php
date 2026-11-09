{{-- Carrinho: caminho para encomendar os itens pela importação (empresas logadas). --}}
@if (auth()->guard('customer')->check() && \Webkul\Checkout\Facades\Cart::getCart()?->items?->count())
    <div v-pre style="margin-top:20px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border:1px solid #C7D7FB;background:#F2F6FF;border-radius:12px;padding:12px 16px">
        <div style="font-size:14px;color:#1E3A8A"><b>Linha de importação · recebimento em {{ \ImportFacil\Loja\Support\Regras::PRAZO_IMPORTACAO }} dias.</b>
            Encomende os itens deste carrinho pelo Setor de Importação, sob encomenda{{ \ImportFacil\Loja\Support\Regras::contaEOrdem(\ImportFacil\Loja\Support\Regras::empresaId()) ? ' ou por conta e ordem' : '' }}.</div>
        <a href="{{ route('importfacil.importacao.nova') }}" style="background:#1D4ED8;color:#fff;border-radius:8px;padding:8px 14px;font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap">Encomendar pela importação</a>
    </div>
@endif
