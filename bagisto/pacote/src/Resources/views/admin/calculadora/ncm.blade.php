<x-admin::layouts>
    <x-slot:title>Tabela NCM</x-slot>
    @include('importfacil::estilo')

    <div class="if" v-pre>
        <h1>Tabela NCM</h1>
        <p class="if-sub">{{ number_format($total, 0, ',', '.') }} códigos de 8 dígitos · {{ $vigencia ?: 'tabela não carregada' }}. Fonte: Receita Federal / Portal Único Siscomex, atualizada toda semana pelo workflow "Tabela NCM".</p>

        <form method="GET" class="if-acoes" role="search">
            <input type="search" name="q" value="{{ $q }}" placeholder="Código (ex.: 8806) ou palavras (ex.: drone pulverizador)" aria-label="Buscar NCM" style="max-width:520px">
            <button class="if-btn" type="submit">Buscar</button>
        </form>

        @if ($q !== '')
            <div class="if-rolar" style="margin-top:14px">
                <table class="if-tabela">
                    <thead><tr><th style="width:120px">NCM</th><th>Descrição</th></tr></thead>
                    <tbody>
                        @forelse ($resultados as $r)
                            <tr><td><b>{{ $r['codigo'] }}</b></td><td>{{ $r['descricao'] }}</td></tr>
                        @empty
                            <tr><td colspan="2" class="if-muted" style="text-align:center;padding:20px">Nada encontrado para "{{ $q }}".</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        @endif
    </div>
</x-admin::layouts>
