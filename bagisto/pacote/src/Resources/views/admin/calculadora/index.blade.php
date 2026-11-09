@php
    $C = \ImportFacil\Loja\Importacao\Calculadora::class;
    $n = fn ($v, $d = 2) => number_format((float) $v, $d, ',', '.');
    $brl = fn ($v) => 'R$ '.number_format((float) $v, 2, ',', '.');
    $usd = fn ($v) => 'US$ '.number_format((float) $v, 0, ',', '.');
    $pct = fn ($v) => $v === null || ! is_finite($v) ? '—' : number_format($v * 100, 1, ',', '.').'%';
    $v = fn ($x) => rtrim(rtrim(number_format((float) $x, 4, '.', ''), '0'), '.');
    $T = $r['T'];
    $composicao = [['fob', 'FOB em reais'], ['frete', 'Frete internacional'], ['seguro', 'Seguro'], ['origemVA', 'Custos na origem (no valor aduaneiro)'], ['capatazia', 'Capatazia'], ['va', 'Valor aduaneiro'], ['ii', 'II'], ['ipi', 'IPI'], ['pis', 'PIS'], ['cofins', 'COFINS'], ['icms', 'ICMS'], ['afrmm', 'AFRMM'], ['siscomex', 'Taxa Siscomex'], ['desp', 'Despesas no Brasil'], ['origemFora', 'Custos no exterior fora do valor aduaneiro'], ['varCamb', 'Variação cambial no pagamento'], ['desembolso', 'Desembolso total'], ['creditos', 'Créditos (IPI, ICMS'.($s['lucroReal'] ? ', PIS e COFINS' : '').')'], ['liquido', 'Custo líquido']];
@endphp
<x-admin::layouts>
    <x-slot:title>Calculadora de importação</x-slot>
    @include('importfacil::estilo')

    <div class="if" v-pre>
        <h1>Calculadora de importação</h1>
        <p class="if-sub">Custo de uma importação até o estoque e preço de venda sugerido. Baseada na planilha FINAL IMPORT COSTS DRONES (contêiner 20' e 40'), com os custos no exterior em dólar. É o mesmo cálculo do protótipo, agora no servidor.</p>
        @if ($ordem)<div class="if-aviso info">Itens da ordem <a class="if-link" href="{{ route('admin.importfacil.importacao.ver', $ordem->id) }}">{{ $ordem->numero }}</a>. Informe o FOB em dólar, o peso e os tributos de cada item.</div>@endif

        <div class="if-acoes">
            <span class="if-muted">Começar de:</span>
            <a class="if-btn sec" href="{{ route('admin.importfacil.calculadora', ['modelo' => '20']) }}">Drones · contêiner 20'</a>
            <a class="if-btn sec" href="{{ route('admin.importfacil.calculadora', ['modelo' => '40']) }}">Drones · contêiner 40'</a>
            <a class="if-btn sec" href="{{ route('admin.importfacil.calculadora', ['modelo' => 'vazio']) }}">Cálculo em branco</a>
        </div>

        <form method="POST" action="{{ route('admin.importfacil.calculadora.calcular') }}" id="if-calc">
            @csrf
            <input type="hidden" name="modelo" value="{{ $s['modelo'] }}">
            @if ($ordem)<input type="hidden" name="ordem" value="{{ $ordem->id }}">@endif

            {{-- Resultado no alto, para ler sem rolar --}}
            <div class="if-grade" style="margin-top:16px">
                <div class="if-card if-kpi" style="margin:0"><span>Desembolso total</span><b>{{ $brl($T['desembolso']) }}</b><small class="if-muted">{{ $n($r['fatorDesembolso'], 3) }} × o FOB em reais</small></div>
                <div class="if-card if-kpi" style="margin:0"><span>Custo líquido (após créditos)</span><b>{{ $brl($T['liquido']) }}</b><small class="if-muted">{{ $n($r['fatorLiquido'], 3) }} × o FOB · créditos {{ $brl($T['creditos']) }}</small></div>
                <div class="if-card if-kpi" style="margin:0"><span>Pago no exterior</span><b>{{ $usd($r['exterior']['totalUSD']) }}</b><small class="if-muted">FOB {{ $usd($r['exterior']['fobUSD']) }} + frete + seguro + origem</small></div>
                <div class="if-card if-kpi" style="margin:0"><span>Adições na DUIMP</span><b>{{ $r['adicoes'] }}</b><small class="if-muted">Taxa Siscomex {{ $brl($r['siscomex']) }} · {{ $n($r['pesoTot'], 0) }} kg</small></div>
            </div>

            <div class="if-card">
                <h2>Itens</h2>
                @foreach ($s['itens'] as $ix => $it)
                    @php $l = $r['linhas'][$ix] ?? null; $nc = $ncm[$ix] ?? null; @endphp
                    <div style="border:1px solid var(--if-borda);border-radius:10px;padding:12px;margin-top:10px">
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="text" name="itens[{{ $ix }}][desc]" value="{{ $it['desc'] }}" placeholder="Descrição do produto" aria-label="Descrição do item {{ $ix + 1 }}">
                            <label style="display:flex;gap:4px;align-items:center;margin:0;font-weight:400;white-space:nowrap"><input type="checkbox" name="itens[{{ $ix }}][remover]" value="1"> Remover</label>
                        </div>
                        <div class="if-grade" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:0 10px">
                            <div><label>NCM</label><input type="text" name="itens[{{ $ix }}][ncm]" value="{{ $it['ncm'] }}" placeholder="0000.00.00" list="if-ncm-lista" class="if-ncm"></div>
                            <div><label>Quantidade</label><input type="number" step="any" min="0" name="itens[{{ $ix }}][qtd]" value="{{ $v($it['qtd']) }}"></div>
                            <div><label>FOB unitário (US$)</label><input type="number" step="any" min="0" name="itens[{{ $ix }}][fob]" value="{{ $v($it['fob']) }}"></div>
                            <div><label>Peso líquido total (kg)</label><input type="number" step="any" min="0" name="itens[{{ $ix }}][peso]" value="{{ $v($it['peso']) }}"></div>
                            <div><label>II (%)</label><input type="number" step="any" name="itens[{{ $ix }}][ii]" value="{{ $v($it['ii']) }}"></div>
                            <div><label>IPI (%)</label><input type="number" step="any" name="itens[{{ $ix }}][ipi]" value="{{ $v($it['ipi']) }}"></div>
                            <div><label>PIS (%)</label><input type="number" step="any" name="itens[{{ $ix }}][pis]" value="{{ $v($it['pis']) }}"></div>
                            <div><label>COFINS (%)</label><input type="number" step="any" name="itens[{{ $ix }}][cofins]" value="{{ $v($it['cofins']) }}"></div>
                            <div><label>Preço de mercado (R$/un)</label><input type="number" step="any" min="0" name="itens[{{ $ix }}][mercado]" value="{{ $v($it['mercado']) }}"></div>
                        </div>
                        @if ($nc)<small style="display:block;margin-top:4px;color:{{ $nc['ok'] ? 'var(--if-tinta2)' : 'var(--if-erro)' }}">{{ \Illuminate\Support\Str::limit($nc['texto'], 180) }}</small>@endif
                        @if ($l)
                            <div class="if-acoes" style="margin-top:8px;gap:6px 16px;font-size:13px">
                                <span>Custo líquido: <b>{{ $brl($l['liqU']) }}</b>/un</span>
                                <span>Com financiamento: <b>{{ $brl($l['totU']) }}</b>/un</span>
                                <span>Preço de venda sugerido: <b>{{ $brl($l['pv']) }}</b>/un</span>
                                @if ($l['merc'])<span>Margem no preço de mercado: <b style="color:{{ $l['margemMerc'] >= ((float) $s['margem'] / 100) ? 'var(--if-ok)' : 'var(--if-erro)' }}">{{ $pct($l['margemMerc']) }}</b> · FOB máximo {{ $usd($l['fobMax']) }}</span>@endif
                            </div>
                        @endif
                    </div>
                @endforeach
                <datalist id="if-ncm-lista"></datalist>
                <div class="if-acoes">
                    <button class="if-btn" type="submit">Calcular</button>
                    <button class="if-btn sec" type="submit" name="acao" value="adicionar">Adicionar item</button>
                    <span class="if-muted">Tabela NCM: {{ $vigencia ?: 'não carregada' }}</span>
                </div>
            </div>

            <div class="if-dois" style="align-items:start">
                <div class="if-card">
                    <h2>Câmbio, frete e seguro</h2>
                    <div class="if-dois">
                        <div><label>Câmbio da DI (R$/US$)</label><input type="number" step="any" name="cambioDI" value="{{ $v($s['cambioDI']) }}"></div>
                        <div><label>Câmbio do frete</label><input type="number" step="any" name="cambioFrete" value="{{ $v($s['cambioFrete']) }}"></div>
                        <div><label>Câmbio do pagamento</label><input type="number" step="any" name="cambioPag" value="{{ $v($s['cambioPag']) }}"></div>
                        <div><label>Frete internacional (US$)</label><input type="number" step="any" name="freteUSD" value="{{ $v($s['freteUSD']) }}"></div>
                        <div><label>Seguro (% de FOB + frete)</label><input type="number" step="any" name="seguroPct" value="{{ $v($s['seguroPct']) }}"></div>
                        <div><label>Seguro informado (US$, opcional)</label><input type="number" step="any" name="seguroUSD" value="{{ $v($s['seguroUSD']) }}"></div>
                    </div>
                    <h2 style="margin-top:16px">Custos no exterior (US$)</h2>
                    @foreach ($C::EXTERIOR as $k => $x)
                        <label>{{ $x['rot'] }}{{ $x['va'] ? '' : ' · fora do valor aduaneiro' }}</label>
                        <input type="number" step="any" min="0" name="exterior[{{ $k }}]" value="{{ $v($s['exterior'][$k]['usd'] ?? 0) }}">
                    @endforeach
                </div>
                <div class="if-card">
                    <h2>Despesas no Brasil (R$, rateadas pelo FOB)</h2>
                    <div class="if-dois">
                        <div><label>Capatazia (entra no valor aduaneiro)</label><input type="number" step="any" name="capatazia" value="{{ $v($s['capatazia']) }}"></div>
                        <div><label>AFRMM (% do frete)</label><input type="number" step="any" name="afrmmPct" value="{{ $v($s['afrmmPct']) }}"></div>
                        @foreach ($C::DESPESAS as [$k, $rot])
                            <div><label>{{ $rot }}</label><input type="number" step="any" name="desp[{{ $k }}]" value="{{ $v($s['desp'][$k] ?? 0) }}"></div>
                        @endforeach
                        <div><label>Taxa Siscomex manual (R$)</label><input type="number" step="any" name="siscomex" value="{{ $v($s['siscomex']) }}"></div>
                    </div>
                    <label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" name="siscomexAuto" value="1" {{ $s['siscomexAuto'] ? 'checked' : '' }}> Calcular a Taxa Siscomex pelo número de adições</label>
                    <h2 style="margin-top:16px">Tributos e venda</h2>
                    <label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" name="lucroReal" value="1" {{ $s['lucroReal'] ? 'checked' : '' }}> Empresa no Lucro Real (PIS e COFINS da importação viram crédito)</label>
                    <div class="if-dois">
                        <div><label>ICMS na importação (%)</label><input type="number" step="any" min="0" max="95" name="icmsImp" value="{{ $v($s['icmsImp']) }}"></div>
                        <div><label>Financiamento (FINIMP, % do custo)</label><input type="number" step="any" name="finimp" value="{{ $v($s['finimp']) }}"></div>
                        <div><label>ICMS na venda (%)</label><input type="number" step="any" name="icmsVenda" value="{{ $v($s['icmsVenda']) }}"></div>
                        <div><label>PIS e COFINS na venda (%)</label><input type="number" step="any" name="piscofVenda" value="{{ $v($s['piscofVenda']) }}"></div>
                        <div><label>Margem desejada (%)</label><input type="number" step="any" name="margem" value="{{ $v($s['margem']) }}"></div>
                    </div>
                    <p class="if-muted" style="margin-top:6px">ICMS na importação: 0% pressupõe diferimento por regime especial; sem ele, MG cobra 18%.</p>
                    <div class="if-acoes"><button class="if-btn" type="submit">Calcular</button></div>
                </div>
            </div>
        </form>

        <div class="if-card">
            <h2>Composição do custo</h2>
            <div class="if-rolar">
                <table class="if-tabela">
                    <tbody>
                        @foreach ($composicao as [$k, $rot])
                            <tr><td>{!! in_array($k, ['va', 'desembolso', 'liquido']) ? '<b>'.e($rot).'</b>' : e($rot) !!}</td><td class="n">{!! in_array($k, ['va', 'desembolso', 'liquido']) ? '<b>'.e($brl($T[$k])).'</b>' : e($brl($T[$k])) !!}</td></tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    @include('importfacil::admin._busca-ncm')
</x-admin::layouts>
