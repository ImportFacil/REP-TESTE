<x-admin::layouts>
    <x-slot:title>Empresas: faixa e conta e ordem</x-slot>
    @include('importfacil::estilo')
    @php $F = \ImportFacil\Loja\Support\Regras::FAIXAS; @endphp

    <div class="if" v-pre>
        <h1>Empresas: faixa de crédito e conta e ordem</h1>
        <p class="if-sub">A faixa define quantos boletos a empresa pode usar (A 4×, B 2×, C só Pix e cartão). Conta e ordem fica liberada só para quem a equipe aprovar (no protótipo, clientes grandes, faixa A). O limite de crédito é ajustado em B2B → Crédito da empresa.</p>
        @include('importfacil::admin._avisos')

        <div class="if-rolar" style="margin-top:16px">
            <table class="if-tabela">
                <thead><tr><th>Empresa</th><th>Tipo</th><th class="n">Crédito disponível</th><th class="n">Ordens</th><th>Faixa</th><th>Conta e ordem</th><th></th></tr></thead>
                <tbody>
                    @foreach ($empresas as $e)
                        <tr>
                            <td>{{ $e->nome }}<br><small class="if-muted">{{ $e->email }}</small></td>
                            <td>{{ $e->tipo ? ucfirst($e->tipo) : '—' }}</td>
                            <td class="n">{{ $e->credit_limit !== null ? core()->formatBasePrice((float) $e->credit_limit - (float) $e->outstanding_balance) : '—' }}</td>
                            <td class="n">{{ $e->ordens }}</td>
                            <td colspan="3">
                                <form method="POST" action="{{ route('admin.importfacil.empresas.salvar', $e->id) }}" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0">
                                    @csrf
                                    <select name="faixa" style="width:auto" aria-label="Faixa de {{ $e->nome }}">
                                        @foreach ($F as $k => $f)<option value="{{ $k }}" {{ ($e->faixa ?? 'A') === $k ? 'selected' : '' }}>{{ $k }} · {{ $f['max_boleto'] ? 'boleto até '.$f['max_boleto'].'×' : 'sem boleto' }}</option>@endforeach
                                    </select>
                                    <label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:400"><input type="checkbox" name="conta_e_ordem" value="1" {{ $e->conta_e_ordem ? 'checked' : '' }}> Liberar conta e ordem</label>
                                    <button class="if-btn sec" type="submit" style="padding:4px 12px">Salvar</button>
                                </form>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>
</x-admin::layouts>
