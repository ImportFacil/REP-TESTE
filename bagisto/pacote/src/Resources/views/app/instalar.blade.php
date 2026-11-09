<x-shop::layouts>
    <x-slot:title>Baixar o app ImportFácil</x-slot>

    <div style="max-width:980px;margin:32px auto;padding:0 16px">
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:8px">
            <img src="{{ url('importfacil/icone-192.png') }}" alt="" width="64" height="64" style="border-radius:16px;border:1px solid #E4E4E7">
            <div>
                <h1 style="font-size:28px;font-weight:600;margin:0">App ImportFácil no celular</h1>
                <p style="margin:4px 0 0;color:#52525B">A loja inteira, com o ícone do globo na tela inicial. Instala pelo navegador, sem loja de aplicativos.</p>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;margin-top:24px">
            <div style="border:1px solid #E4E4E7;border-radius:16px;padding:20px;text-align:center">
                <div id="importfacil-qr" style="display:inline-block;background:#fff;padding:10px;border-radius:12px">{!! $qr !!}</div>
                <p style="margin:12px 0 4px;font-weight:600">Aponte a câmera do celular para o QR code</p>
                <p style="margin:0;color:#52525B;font-size:14px;word-break:break-all">{{ $url }}</p>
                <button id="importfacil-instalar" type="button" class="primary-button" style="margin-top:16px;display:none">Instalar o app agora</button>
            </div>

            <div style="border:1px solid #E4E4E7;border-radius:16px;padding:20px">
                <h2 style="font-size:18px;font-weight:600;margin:0 0 8px">Android (Chrome)</h2>
                <ol style="margin:0 0 16px;padding-left:20px;color:#3F3F46;line-height:1.7">
                    <li>Abra o link ou o QR code no Chrome.</li>
                    <li>Toque em <b>Instalar app</b> (ou no menu ⋮ → <b>Adicionar à tela inicial</b>).</li>
                </ol>
                <h2 style="font-size:18px;font-weight:600;margin:0 0 8px">iPhone (Safari)</h2>
                <ol style="margin:0;padding-left:20px;color:#3F3F46;line-height:1.7">
                    <li>Abra o link ou o QR code no Safari.</li>
                    <li>Toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</li>
                </ol>
                <p style="margin:16px 0 0;font-size:14px;color:#71717A">Já tinha o app antigo do protótipo? Ele é outro app: os dois podem ficar no celular.</p>
            </div>
        </div>
    </div>

    @pushOnce('scripts')
        <script>
            (function () {
                var b = document.getElementById('importfacil-instalar');
                function mostrar() { if (window.importfacilInstalar) b.style.display = 'inline-block'; }
                document.addEventListener('importfacil:instalavel', mostrar); mostrar();
                b.addEventListener('click', function () { window.importfacilInstalar && window.importfacilInstalar.prompt(); });
            })();
        </script>
    @endPushOnce
</x-shop::layouts>
