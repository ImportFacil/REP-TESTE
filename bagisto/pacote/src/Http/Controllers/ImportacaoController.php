<?php

namespace ImportFacil\Loja\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use ImportFacil\Loja\Importacao\Ordens;
use ImportFacil\Loja\Support\Regras;
use RuntimeException;
use Webkul\Checkout\Facades\Cart;
use Webkul\Product\Repositories\ProductRepository;

/** Área "Importação" da conta da empresa: pedir uma ordem de importação e acompanhar o andamento. */
class ImportacaoController extends Controller
{
    public function __construct(protected ProductRepository $produtos) {}

    public function index()
    {
        $cliente = auth()->guard('customer')->user();
        $empresa = Regras::empresaId($cliente);

        $ordens = DB::table('importfacil_ordens_importacao')
            ->when($empresa, fn ($q) => $q->where('company_id', $empresa), fn ($q) => $q->where('customer_id', $cliente->id))
            ->orderByDesc('id')->get();

        return view('importfacil::importacao.index', [
            'ordens' => $ordens,
            'contaOrdem' => Regras::contaEOrdem($empresa),
        ]);
    }

    /** Formulário: itens do carrinho, ou um produto da página do produto (?produto=ID&qtd=N). */
    public function nova(Request $request)
    {
        $cliente = auth()->guard('customer')->user();
        $empresa = Regras::empresaId($cliente);
        [$itens, $origem] = $this->itensDaOrigem($request);
        $total = array_sum(array_map(fn ($i) => $i['quantidade'] * $i['preco'], $itens));

        return view('importfacil::importacao.nova', [
            'itens' => $itens,
            'origem' => $origem,
            'total' => $total,
            'cliente' => $cliente,
            'empresa' => $empresa,
            'nomeEmpresa' => Regras::nomeEmpresa($empresa),
            'contaOrdem' => Regras::contaEOrdem($empresa),
            'formas' => Ordens::formas($empresa, $total, 'encomenda'),
            'formasCo' => Ordens::formas($empresa, $total, 'contaordem'),
            'co' => Ordens::valoresContaOrdem($total),
            'previsao' => now()->addDays(Regras::PRAZO_IMPORTACAO),
        ]);
    }

    public function criar(Request $request)
    {
        $dados = $request->validate([
            'itens' => 'required|array|min:1',
            'itens.*' => 'integer|min:0|max:100000',
            'modalidade' => 'required|in:encomenda,contaordem',
            'forma_pagamento' => 'required|in:Boleto,Pix,Cartão',
            'incoterm' => 'nullable|string|max:120',
            'moeda' => 'nullable|string|max:120',
            'po_cliente' => 'nullable|string|max:60',
            'responsavel' => 'required|string|min:3|max:120',
            'cargo' => 'required|string|min:2|max:80',
            'observacoes' => 'nullable|string|max:2000',
            'aceite' => 'accepted',
            'origem' => 'nullable|in:carrinho,produto',
        ], [
            'responsavel.required' => 'Informe o nome do responsável pela aprovação.',
            'cargo.required' => 'Informe o cargo do responsável.',
            'aceite.accepted' => 'Marque a confirmação para autorizar a compra.',
            'itens.required' => 'Escolha ao menos um item.',
        ]);

        $itens = [];
        foreach ($dados['itens'] as $produtoId => $qtd) {
            if ($qtd > 0 && ($i = $this->item((int) $produtoId, (int) $qtd))) {
                $itens[] = $i;
            }
        }

        try {
            $ordem = Ordens::criar(auth()->guard('customer')->user(), $itens, $dados);
        } catch (RuntimeException $e) {
            return back()->withInput()->withErrors(['ordem' => $e->getMessage()]);
        }

        if (($dados['origem'] ?? '') === 'carrinho' && ($carrinho = Cart::getCart())) {
            Cart::removeCart($carrinho);
        }

        session()->flash('success', 'Ordem '.$ordem->numero.' enviada ao Setor de Importação.');

        return redirect()->route('importfacil.importacao.ver', $ordem->id);
    }

    public function ver(int $id)
    {
        $cliente = auth()->guard('customer')->user();
        $empresa = Regras::empresaId($cliente);
        $ordem = Ordens::buscar($id);

        abort_unless($ordem && ($empresa ? $ordem->company_id == $empresa : $ordem->customer_id == $cliente->id), 404);

        return view('importfacil::importacao.ver', [
            'ordem' => $ordem,
            'co' => Ordens::valoresContaOrdem((float) $ordem->total),
            'nomeEmpresa' => Regras::nomeEmpresa($ordem->company_id),
        ]);
    }

    /** Itens com o preço do tipo de cliente e a quantidade no múltiplo de venda. */
    protected function itensDaOrigem(Request $request): array
    {
        if ($request->filled('produto')) {
            $i = $this->item((int) $request->input('produto'), (int) $request->input('qtd', 0));

            return [$i ? [$i] : [], 'produto'];
        }

        $itens = [];
        foreach (Cart::getCart()?->items ?? [] as $ci) {
            if ($i = $this->item((int) $ci->product_id, (int) $ci->quantity)) {
                $itens[] = $i;
            }
        }

        return [$itens, 'carrinho'];
    }

    protected function item(int $produtoId, int $qtd): ?array
    {
        $p = $this->produtos->find($produtoId);
        if (! $p || ! $p->status) {
            return null;
        }
        $m = Regras::multiplo($produtoId);
        $qtd = max($m, (int) (ceil(max(1, $qtd) / $m) * $m));

        return [
            'product_id' => $p->id,
            'sku' => $p->sku,
            'nome' => $p->name,
            'unidade' => Regras::unidade($produtoId),
            'multiplo' => $m,
            'quantidade' => $qtd,
            'preco' => round((float) $p->getTypeInstance()->getFinalPrice($qtd), 2),
            'url' => $p->url_key ? url($p->url_key) : null,
        ];
    }
}
