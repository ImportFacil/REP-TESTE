<?php

namespace ImportFacil\Loja\Http\Controllers;

use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Route;

/**
 * "Todas as páginas": o índice do app, com tudo o que foi construído num lugar só:
 * a loja, a conta da empresa, o Painel da equipe e as telas do protótipo (simulação, em /prototipo).
 */
class PaginasController extends Controller
{
    public function index()
    {
        return view('importfacil::paginas.index', ['secoes' => $this->secoes()]);
    }

    /** Endereço relativo de uma rota (funciona em qualquer endereço: localhost, Codespaces, AWS); null se não existir. */
    private function rota(string $nome, array $parametros = []): ?string
    {
        return Route::has($nome) ? route($nome, $parametros, false) : null;
    }

    private function categorias(): array
    {
        try {
            $raiz = core()->getCurrentChannel()->root_category_id;
            $arvore = app(\Webkul\Category\Repositories\CategoryRepository::class)->getVisibleCategoryTree($raiz);

            return collect($arvore)->map(fn ($c) => [$c->name, '/'.$c->slug, 'Categoria'])->values()->all();
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function secoes(): array
    {
        $p = fn (string $tela) => '/prototipo/#'.$tela;

        $secoes = [
            [
                'titulo' => 'Loja',
                'texto' => 'A loja de verdade (Bagisto). Os preços por tipo de cliente aparecem depois de entrar como empresa.',
                'acesso' => 'livre',
                'itens' => [
                    ['Início', $this->rota('shop.home.index') ?? '/', 'Vitrine, destaques e linha de importação'],
                    ['Buscar produtos', '/search?query=', 'Busca no catálogo de 446 produtos'],
                    ['Carrinho', $this->rota('shop.checkout.cart.index'), 'Pedido mínimo, múltiplo de venda e importação'],
                    ['Comparar produtos', $this->rota('shop.compare.index'), 'Lado a lado'],
                    ['Instalar o app', $this->rota('importfacil.app'), 'QR code e passo a passo'],
                    ['Entrar', $this->rota('shop.customer.session.index'), 'Login da empresa'],
                    ['Cadastrar empresa', $this->rota('shop.customers.register.index'), 'Novo cliente'],
                ],
            ],
            [
                'titulo' => 'Categorias',
                'texto' => 'Todas as categorias do catálogo.',
                'acesso' => 'livre',
                'itens' => $this->categorias(),
            ],
            [
                'titulo' => 'Minha empresa',
                'texto' => 'Área do cliente. Entre como empresa para abrir (ex.: cooperativa@demo.importfacil.com.br, senha demo1234).',
                'acesso' => 'empresa',
                'itens' => [
                    ['Minha conta', $this->rota('shop.customers.account.profile.index'), 'Dados de acesso'],
                    ['Pedidos', $this->rota('shop.customers.account.orders.index'), 'Acompanhamento dos pedidos'],
                    ['Pedido rápido', $this->rota('shop.customers.account.quick_orders.index'), 'Vários códigos de uma vez'],
                    ['Cotações', $this->rota('shop.customers.account.quotes.index'), 'Pedir e negociar preço'],
                    ['Ordens de compra', $this->rota('shop.customers.account.purchase_orders.index'), 'Ordens de compra da empresa'],
                    ['Listas de compra', $this->rota('shop.customers.account.requisitions.index'), 'Requisições internas'],
                    ['Importação', $this->rota('importfacil.importacao.index'), 'Ordens sob encomenda e por conta e ordem'],
                    ['Nova ordem de importação', $this->rota('importfacil.importacao.nova'), 'Pedir uma importação'],
                    ['Financeiro', $this->rota('importfacil.financeiro'), 'Boletos, Pix, numerário e vencimentos'],
                    ['Crédito da empresa', $this->rota('shop.customers.account.credit.index'), 'Limite e uso do crédito'],
                    ['Perfil da empresa', $this->rota('shop.customers.account.company_profile.index'), 'CNPJ e dados da empresa'],
                    ['Usuários da empresa', $this->rota('shop.customers.account.users.index'), 'Quem compra pela empresa'],
                    ['Perfis de acesso', $this->rota('shop.customers.account.roles.index'), 'O que cada usuário pode fazer'],
                    ['Endereços', $this->rota('shop.customers.account.addresses.index'), 'Entrega e cobrança'],
                    ['Favoritos', $this->rota('shop.customers.account.wishlist.index'), 'Produtos guardados'],
                ],
            ],
            [
                'titulo' => 'Painel da equipe',
                'texto' => 'Área interna da ImportFácil. Entre com o login da equipe (teste: admin@example.com, senha admin123).',
                'acesso' => 'equipe',
                'itens' => [
                    ['Visão geral', $this->rota('admin.dashboard.index'), 'Vendas e números do dia'],
                    ['Pedidos', $this->rota('admin.sales.orders.index'), 'Todos os pedidos'],
                    ['Produtos (catálogo)', $this->rota('admin.catalog.products.index'), 'Criar, editar preço, estoque e destaque'],
                    ['Categorias', $this->rota('admin.catalog.categories.index'), 'Árvore de categorias'],
                    ['Clientes', $this->rota('admin.customers.customers.index'), 'Contas dos clientes'],
                    ['Empresas', $this->rota('admin.b2b.companies.index'), 'Empresas clientes (B2B)'],
                    ['Catálogos por tipo de cliente', $this->rota('admin.b2b.company_catalogs.index'), 'Produtos e desconto de cada tipo'],
                    ['Crédito das empresas', $this->rota('admin.b2b.company_credits.index'), 'Limites de crédito'],
                    ['Faixa e conta e ordem', $this->rota('admin.importfacil.empresas'), 'Faixa A/B/C e liberação de conta e ordem'],
                    ['Cotações', $this->rota('admin.b2b.quotes.index'), 'Responder cotações'],
                    ['Ordens de compra', $this->rota('admin.b2b.purchase_orders.index'), 'Ordens de compra das empresas'],
                    ['Ordens de importação', $this->rota('admin.importfacil.importacao.index'), 'Etapas, numerário e NCM'],
                    ['Calculadora de importação', $this->rota('admin.importfacil.calculadora'), 'Custo de importação por item'],
                    ['Tabela NCM', $this->rota('admin.importfacil.ncm'), 'Busca na NCM vigente'],
                    ['Regras de desconto', $this->rota('admin.marketing.promotions.cart_rules.index'), 'Pix 3% e promoções'],
                ],
            ],
            [
                'titulo' => 'Protótipo (simulação)',
                'texto' => 'Todas as telas desenhadas no protótipo. Funcionam neste aparelho, com dados de exemplo. Na primeira vez, entre com qualquer e-mail e senha de 6 letras e escolha o tipo de cliente.',
                'acesso' => 'simulacao',
                'itens' => [
                    ['Início', $p('home'), 'Vitrine com preço por tipo de cliente'],
                    ['Categorias', $p('categorias'), 'Todas as categorias'],
                    ['Buscar', $p('busca'), 'Busca com filtros'],
                    ['Favoritos', $p('favoritos'), 'Produtos guardados'],
                    ['Carrinho', $p('carrinho'), 'Carrinho e fechamento do pedido'],
                    ['Pedidos', $p('pedidos'), 'Acompanhamento do pedido'],
                    ['Meus orçamentos', $p('orcamentos'), 'Orçamentos com ficha técnica e PDF'],
                    ['Ordens de compra', $p('ordens'), 'Ordens de importação'],
                    ['Financeiro', $p('financeiro'), 'Parcelas, boletos e Pix'],
                    ['Cadastro da empresa', $p('meucadastro'), 'Situação do cadastro'],
                    ['Novo cadastro', $p('cadastro'), 'Cadastro em etapas com documentos'],
                    ['Fale com o comercial', $p('contato'), 'Contato com a equipe'],
                    ['Tipos de cliente', $p('tabela'), 'Descontos e pedido mínimo'],
                    ['Conta', $p('conta'), 'Preferências e acessibilidade'],
                    ['Imagens do catálogo', $p('imagens'), 'Fotos dos produtos'],
                    ['Revisar fotos', $p('revisar'), 'Revisão das fotos'],
                    ['Painel da equipe: Visão geral', $p('equipe/geral'), 'Indicadores e gráficos'],
                    ['Painel da equipe: Catálogo', $p('equipe/catalogo'), 'Buscar, criar, editar e excluir produtos'],
                    ['Painel da equipe: Crédito', $p('equipe/cadastros'), 'Análise de cadastro e crédito'],
                    ['Painel da equipe: Pedidos', $p('equipe/pedidos'), 'Pedidos dos clientes'],
                    ['Painel da equipe: Recebíveis', $p('equipe/recebiveis'), 'Parcelas a receber e atrasos'],
                    ['Painel da equipe: Condições', $p('equipe/condicoes'), 'Política de pagamento'],
                    ['Painel da equipe: Calculadora', $p('equipe/calc'), 'Calculadora de importação'],
                ],
            ],
        ];

        foreach ($secoes as &$s) {
            $s['itens'] = array_values(array_filter($s['itens'], fn ($i) => ! empty($i[1])));
        }

        return array_values(array_filter($secoes, fn ($s) => count($s['itens']) > 0));
    }
}
