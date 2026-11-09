<?php

namespace ImportFacil\Loja\Http\Controllers\Admin;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use ImportFacil\Loja\Importacao\Ncm;
use ImportFacil\Loja\Importacao\Ordens;
use ImportFacil\Loja\Support\Regras;
use RuntimeException;

/** Painel → Importação: ordens de importação, numerário, NCM dos itens e liberação de conta e ordem por empresa. */
class ImportacaoController extends Controller
{
    public function index(Request $request)
    {
        $status = $request->input('status');
        $ordens = DB::table('importfacil_ordens_importacao')
            ->when($status, fn ($q) => $q->where('status', $status))
            ->orderByDesc('id')->limit(200)->get();
        foreach ($ordens as $o) {
            $o->empresa = Regras::nomeEmpresa($o->company_id);
            $o->bloqueio = Ordens::bloqueio($o);
        }

        $abertas = DB::table('importfacil_ordens_importacao')->where('status', '!=', 'Entregue');

        return view('importfacil::admin.importacao.index', [
            'ordens' => $ordens,
            'status' => $status,
            'resumo' => [
                'abertas' => (clone $abertas)->count(),
                'valor' => (float) (clone $abertas)->sum('total'),
                'aguardando' => DB::table('importfacil_parcelas')->whereNotNull('ordem_importacao_id')->whereIn('etapa', ['cambio', 'tributos'])->whereNull('pago_em')->sum('valor'),
            ],
        ]);
    }

    public function ver(int $id)
    {
        $ordem = Ordens::buscar($id);
        abort_unless($ordem, 404);
        foreach ($ordem->itens as $i) {
            $i->ncm_descricao = $i->ncm ? Ncm::caminho($i->ncm) : null;
        }

        return view('importfacil::admin.importacao.ver', [
            'ordem' => $ordem,
            'empresa' => Regras::nomeEmpresa($ordem->company_id),
            'co' => Ordens::valoresContaOrdem((float) $ordem->total),
            'cliente' => DB::table('customers')->where('id', $ordem->customer_id)->first(['first_name', 'last_name', 'email', 'phone']),
        ]);
    }

    public function avancar(int $id)
    {
        try {
            $o = Ordens::avancar($id, $this->quem());
            session()->flash('success', $o->numero.': '.$o->status.($o->status === 'Entregue' ? ' · faturada' : ''));
        } catch (RuntimeException $e) {
            session()->flash('error', $e->getMessage());
        }

        return redirect()->route('admin.importfacil.importacao.ver', $id);
    }

    public function numerario(Request $request, int $id)
    {
        $etapa = $request->validate(['etapa' => 'required|in:cambio,tributos'])['etapa'];
        Ordens::confirmarNumerario($id, $etapa, $this->quem());
        session()->flash('success', 'Pix do numerário confirmado.');

        return redirect()->route('admin.importfacil.importacao.ver', $id);
    }

    public function ncm(Request $request, int $id)
    {
        $invalidos = Ordens::definirNcm($id, (array) $request->input('ncm', []));
        $invalidos
            ? session()->flash('error', 'NCM fora da tabela vigente: '.implode(', ', $invalidos).'. Use um código de 8 dígitos.')
            : session()->flash('success', 'Classificação fiscal (NCM) salva.');

        return redirect()->route('admin.importfacil.importacao.ver', $id);
    }

    /** Empresas: faixa de crédito e liberação de conta e ordem (decisão da equipe). */
    public function empresas()
    {
        $empresas = DB::table('customers as c')
            ->leftJoin('importfacil_empresas as e', 'e.company_id', '=', 'c.id')
            ->leftJoin('b2b_company_credits as k', 'k.company_id', '=', 'c.id')
            ->where('c.type', 'company')
            ->orderBy('c.id')
            ->get(['c.id', 'c.email', 'e.tipo', 'e.faixa', 'e.conta_e_ordem', 'k.credit_limit', 'k.outstanding_balance']);
        foreach ($empresas as $e) {
            $e->nome = Regras::nomeEmpresa($e->id);
            $e->ordens = DB::table('importfacil_ordens_importacao')->where('company_id', $e->id)->count();
        }

        return view('importfacil::admin.importacao.empresas', ['empresas' => $empresas]);
    }

    public function salvarEmpresa(Request $request, int $id)
    {
        $d = $request->validate(['faixa' => 'required|in:A,B,C']);
        DB::table('importfacil_empresas')->updateOrInsert(
            ['company_id' => $id],
            ['faixa' => $d['faixa'], 'conta_e_ordem' => $request->boolean('conta_e_ordem'), 'updated_at' => now()]
        );
        session()->flash('success', 'Empresa atualizada: faixa '.$d['faixa'].($request->boolean('conta_e_ordem') ? ', conta e ordem liberada.' : ', só sob encomenda.'));

        return redirect()->route('admin.importfacil.empresas');
    }

    protected function quem(): string
    {
        $u = auth()->guard('admin')->user();

        return 'Setor de Importação'.($u ? ' · '.$u->name : '');
    }
}
