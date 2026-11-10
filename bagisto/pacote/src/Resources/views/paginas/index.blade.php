<x-shop::layouts>
    <x-slot:title>Todas as páginas · ImportFácil</x-slot>

    @php
        $selos = [
            'livre' => ['Aberto', '#DCFCE7', '#166534'],
            'empresa' => ['Entrar como empresa', '#DBEAFE', '#1E40AF'],
            'equipe' => ['Login da equipe', '#FEF3C7', '#92400E'],
            'simulacao' => ['Simulação', '#F3E8FF', '#6B21A8'],
        ];
        $total = collect($secoes)->sum(fn ($s) => count($s['itens']));
    @endphp

    <style>
        .if-pg{max-width:1100px;margin:24px auto 64px;padding:0 16px;color:#18181B}
        .if-pg h1{font-size:28px;font-weight:600;margin:0}
        .if-pg .sub{color:#52525B;margin:6px 0 0}
        .if-pg .busca{width:100%;margin:18px 0 6px;padding:12px 14px;border:1px solid #D4D4D8;border-radius:12px;font-size:16px}
        .if-pg .atalhos{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
        .if-pg .atalhos a{font-size:14px;padding:6px 12px;border:1px solid #D4D4D8;border-radius:999px;color:#18181B;text-decoration:none}
        .if-pg section{margin-top:28px}
        .if-pg h2{font-size:20px;font-weight:600;margin:0 0 4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .if-pg .selo{font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px}
        .if-pg .txt{color:#52525B;font-size:14px;margin:0 0 12px}
        .if-pg .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:10px}
        .if-pg .item{display:block;border:1px solid #E4E4E7;border-radius:12px;padding:12px 14px;text-decoration:none;color:#18181B;background:#fff}
        .if-pg .item:hover,.if-pg .item:focus-visible{border-color:#1D4ED8;box-shadow:0 0 0 3px #DBEAFE;outline:none}
        .if-pg .item b{display:block;font-weight:600}
        .if-pg .item span{display:block;color:#71717A;font-size:13px;margin-top:2px}
        .if-pg .vazio{display:none;color:#52525B;margin-top:20px}
    </style>

    <div class="if-pg">
        <h1>Todas as páginas</h1>
        <p class="sub">{{ $total }} páginas: a loja, a área da empresa, o Painel da equipe e as telas do protótipo.</p>

        <input class="busca" id="if-filtro" type="search" placeholder="Procurar uma página (ex.: financeiro, calculadora, pedidos)" aria-label="Procurar uma página" autocomplete="off">

        <nav class="atalhos" aria-label="Ir para a seção">
            @foreach ($secoes as $i => $s)
                <a href="#secao-{{ $i }}">{{ $s['titulo'] }}</a>
            @endforeach
        </nav>

        @foreach ($secoes as $i => $s)
            @php [$rotulo, $fundo, $cor] = $selos[$s['acesso']]; @endphp
            <section id="secao-{{ $i }}" data-secao>
                <h2>{{ $s['titulo'] }} <span class="selo" style="background:{{ $fundo }};color:{{ $cor }}">{{ $rotulo }}</span></h2>
                <p class="txt">{{ $s['texto'] }}</p>
                <div class="grade">
                    @foreach ($s['itens'] as [$nome, $url, $desc])
                        <a class="item" href="{{ $url }}" data-busca="{{ mb_strtolower($nome.' '.$desc.' '.$s['titulo']) }}">
                            <b>{{ $nome }}</b><span>{{ $desc }}</span>
                        </a>
                    @endforeach
                </div>
            </section>
        @endforeach

        <p class="vazio" id="if-vazio">Nenhuma página com esse nome.</p>
    </div>

    <script>
        (function () {
            var f = document.getElementById('if-filtro'), vazio = document.getElementById('if-vazio');
            var tira = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
            f.addEventListener('input', function () {
                var q = tira(f.value.trim()), algum = false;
                document.querySelectorAll('[data-secao]').forEach(function (sec) {
                    var n = 0;
                    sec.querySelectorAll('.item').forEach(function (a) {
                        var ok = !q || tira(a.dataset.busca).indexOf(q) >= 0;
                        a.style.display = ok ? '' : 'none'; if (ok) n++;
                    });
                    sec.style.display = n ? '' : 'none'; if (n) algum = true;
                });
                vazio.style.display = algum ? 'none' : 'block';
            });
        })();
    </script>
</x-shop::layouts>
