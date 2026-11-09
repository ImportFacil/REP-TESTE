<?php

namespace ImportFacil\Loja\Http\Controllers\Admin;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use ImportFacil\Loja\Importacao\Calculadora;
use ImportFacil\Loja\Importacao\Ncm;
use ImportFacil\Loja\Importacao\Ordens;

/** Painel → Importação → Calculadora e tabela NCM. */
class CalculadoraController extends Controller
{
    /** ?modelo=20|40|vazio, ou ?ordem=ID para começar com os itens de uma ordem de importação. */
    public function index(Request $request)
    {
        $modelo = $request->input('modelo', '20');
        $s = $modelo === 'vazio' ? Calculadora::vazio() : Calculadora::padrao($modelo === '40' ? '40' : '20');
        $ordem = null;

        if ($request->filled('ordem') && ($ordem = Ordens::buscar((int) $request->input('ordem')))) {
            $s = Calculadora::vazio();
            $s['modelo'] = 'ordem';
            $s['itens'] = $ordem->itens->map(fn ($i) => Calculadora::itemNovo([
                'desc' => $i->nome.($i->sku ? ' ('.$i->sku.')' : ''), 'ncm' => Ncm::formatar($i->ncm), 'qtd' => $i->quantidade,
            ]))->all();
        }

        return $this->tela($s, $ordem);
    }

    public function calcular(Request $request)
    {
        $s = Calculadora::doFormulario($request->except('_token'));
        if ($request->input('acao') === 'adicionar') {
            $s['itens'][] = Calculadora::itemNovo();
        }
        if (! $s['itens']) {
            $s['itens'][] = Calculadora::itemNovo();
        }

        return $this->tela($s, $request->filled('ordem') ? Ordens::buscar((int) $request->input('ordem')) : null);
    }

    protected function tela(array $s, ?object $ordem)
    {
        $ncm = [];
        foreach ($s['itens'] as $n => $i) {
            $c = preg_replace('/\D/', '', $i['ncm']);
            $ncm[$n] = $c === '' ? null : (strlen($c) === 8 && ($d = Ncm::caminho($c)) ? ['ok' => true, 'texto' => $d] : ['ok' => false, 'texto' => 'Não está na tabela NCM vigente (use 8 dígitos)']);
        }

        return view('importfacil::admin.calculadora.index', [
            's' => $s,
            'r' => Calculadora::calcular($s),
            'ncm' => $ncm,
            'ordem' => $ordem,
            'vigencia' => DB::table('core_config')->where('code', 'importfacil.ncm.vigencia')->value('value'),
        ]);
    }

    /** Busca na tabela NCM (JSON), usada pela calculadora e pela tela da ordem. */
    public function ncmBuscar(Request $request)
    {
        return response()->json(Ncm::buscar((string) $request->input('q', ''), 30));
    }

    public function ncm(Request $request)
    {
        $q = trim((string) $request->input('q', ''));

        return view('importfacil::admin.calculadora.ncm', [
            'q' => $q,
            'resultados' => mb_strlen($q) >= 2 ? Ncm::buscar($q, 100) : [],
            'total' => DB::table('importfacil_ncm')->whereRaw('LENGTH(codigo) = 8')->count(),
            'vigencia' => DB::table('core_config')->where('code', 'importfacil.ncm.vigencia')->value('value'),
        ]);
    }
}
