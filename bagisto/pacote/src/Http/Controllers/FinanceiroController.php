<?php

namespace ImportFacil\Loja\Http\Controllers;

use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use ImportFacil\Loja\Support\Regras;

/** Financeiro do cliente: boletos, Pix e cartão dos pedidos da empresa, com a situação de cada um. */
class FinanceiroController extends Controller
{
    public function index()
    {
        $cliente = auth()->guard('customer')->user();
        $empresa = Regras::empresaId($cliente);

        $parcelas = DB::table('importfacil_parcelas as p')
            ->leftJoin('orders as o', 'o.id', '=', 'p.order_id')
            ->leftJoin('importfacil_ordens_importacao as oi', 'oi.id', '=', 'p.ordem_importacao_id')
            ->when($empresa, fn ($q) => $q->where('p.company_id', $empresa), fn ($q) => $q->where('p.customer_id', $cliente->id))
            ->orderBy('p.vencimento')
            ->get(['p.*', 'o.increment_id', 'oi.numero as ordem_importacao', 'oi.id as ordem_importacao_id']);

        $hoje = now()->toDateString();
        foreach ($parcelas as $p) {
            $p->situacao = $p->pago_em ? 'Pago' : ($p->vencimento < $hoje ? 'Vencido' : ($p->vencimento === $hoje ? 'Vence hoje' : 'A vencer'));
        }

        $dadosEmpresa = Regras::empresa($empresa);

        return view('importfacil::financeiro.index', [
            'parcelas' => $parcelas,
            'aberto' => $parcelas->whereNull('pago_em')->sum('valor'),
            'vencido' => $parcelas->where('situacao', 'Vencido')->sum('valor'),
            'faixa' => $dadosEmpresa->faixa ?? null,
            'tipo' => Regras::tipoDoCliente($cliente),
        ]);
    }
}
