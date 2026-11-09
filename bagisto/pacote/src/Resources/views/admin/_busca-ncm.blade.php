{{-- Sugestões da tabela NCM enquanto digita (campos .if-ncm com list="if-ncm-lista"). --}}
@pushOnce('scripts', 'importfacil-busca-ncm')
<script>
(function () {
    var url = @json(route('admin.importfacil.ncm.buscar')), espera = null;
    document.addEventListener('input', function (e) {
        var campo = e.target;
        if (!campo.classList || !campo.classList.contains('if-ncm')) return;
        var q = campo.value.trim();
        clearTimeout(espera);
        if (q.replace(/\D/g, '').length < 2 && q.length < 3) return;
        espera = setTimeout(function () {
            fetch(url + '?q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } })
                .then(function (r) { return r.ok ? r.json() : []; })
                .then(function (lista) {
                    var dl = document.getElementById(campo.getAttribute('list'));
                    if (!dl) return;
                    dl.innerHTML = '';
                    lista.forEach(function (n) {
                        var o = document.createElement('option');
                        o.value = n.codigo; o.label = n.descricao.slice(0, 120);
                        dl.appendChild(o);
                    });
                }).catch(function () {});
        }, 250);
    });
})();
</script>
@endPushOnce
