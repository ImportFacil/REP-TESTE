<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Webkul\B2BSuite\Helpers\CompanyCatalog;
use Webkul\B2BSuite\Repositories\CompanyCatalogRepository;
use Webkul\Category\Repositories\CategoryRepository;
use Webkul\Product\Repositories\ProductRepository;

/**
 * Demonstração ImportFácil no Bagisto + B2B Suite.
 *
 * Lê o catálogo exportado do protótipo (demo-bagisto/catalogo-importfacil.json) e cria:
 * - as categorias e subcategorias;
 * - os produtos (preço de tabela, estoque, destaque, especificações e foto ou ilustração);
 * - uma empresa de demonstração por tipo de cliente, com catálogo próprio (só as categorias
 *   daquele tipo, com o desconto do tipo) e linha de crédito;
 * - a página inicial (banners, faixa de avisos, carrosséis e rodapé) e as configurações da loja.
 *
 * Uso: php artisan importfacil:demo catalogo.json pasta-imagens pasta-marca
 */
class ImportfacilDemo extends Command
{
    protected $signature = 'importfacil:demo {catalogo} {imagens} {marca}';

    protected $description = 'Carrega o catálogo e a configuração de demonstração da ImportFácil';

    /** Senha das contas de demonstração (só para esta demo; não usar em produção). */
    const SENHA_DEMO = 'demo1234';

    const DOMINIO_DEMO = 'demo.importfacil.com.br';

    /** Uma empresa fictícia por tipo de cliente. */
    const EMPRESAS = [
        'cooperativa' => ['Cooperativa Vale Verde', 'Marina', 'Alves', 'Rio Verde', 'GO', '75901-000'],
        'distribuidora' => ['Distribuidora Norte Sul', 'Rogério', 'Pacheco', 'Uberlândia', 'MG', '38400-000'],
        'revendedor' => ['Revenda Bom Campo', 'Cláudia', 'Nunes', 'Varginha', 'MG', '37010-000'],
        'construtora' => ['Construtora Alicerce', 'Paulo', 'Mendes', 'Belo Horizonte', 'MG', '30110-000'],
        'hospital' => ['Hospital Bom Pastor', 'Helena', 'Souza', 'Juiz de Fora', 'MG', '36010-000'],
    ];

    protected string $locale = 'pt_BR';

    public function handle(CategoryRepository $categorias, ProductRepository $produtos): int
    {
        $d = json_decode(file_get_contents($this->argument('catalogo')), true);
        $dirImg = rtrim($this->argument('imagens'), '/');
        $dirMarca = rtrim($this->argument('marca'), '/');

        app()->setLocale($this->locale);

        $this->components->info('Loja, idioma, moeda e frete');
        $this->configurarLoja($dirMarca);

        $this->components->info('Categorias');
        [$catIds, $subIds] = $this->criarCategorias($categorias, $d['categorias']);

        $this->components->info('Produtos ('.count($d['produtos']).')');
        $prodIds = $this->criarProdutos($produtos, $d['produtos'], $catIds, $subIds, $dirImg);

        $this->components->info('Empresas, catálogos por tipo de cliente e crédito');
        $this->criarEmpresas($d, $prodIds);

        $this->components->info('Página inicial');
        $this->paginaInicial($d, $catIds, $dirMarca);

        DB::table('core_config')->updateOrInsert(
            ['code' => 'importfacil.demo.instalado', 'channel_code' => null, 'locale_code' => null],
            ['value' => now()->toDateTimeString(), 'created_at' => now(), 'updated_at' => now()]
        );

        $this->components->info('Pronto.');

        return self::SUCCESS;
    }

    /* ------------------------------------------------------------------ Loja */

    protected function config(string $code, $value, ?string $channel = 'default', ?string $locale = null): void
    {
        DB::table('core_config')->updateOrInsert(
            ['code' => $code, 'channel_code' => $channel, 'locale_code' => $locale],
            ['value' => $value, 'created_at' => now(), 'updated_at' => now()]
        );
    }

    protected function configurarLoja(string $dirMarca): void
    {
        $logo = Storage::disk('public')->putFileAs('channel/1', new \Illuminate\Http\File($dirMarca.'/logo.png'), 'logo.png');
        $fav = Storage::disk('public')->putFileAs('channel/1', new \Illuminate\Http\File($dirMarca.'/favicon.png'), 'favicon.png');

        DB::table('channels')->where('id', 1)->update(['logo' => $logo, 'favicon' => $fav, 'timezone' => 'America/Sao_Paulo']);

        DB::table('channel_translations')->where('channel_id', 1)->update([
            'name' => 'ImportFácil',
            'description' => 'Loja B2B de importação: preço por tipo de cliente, importação sob encomenda e pagamento no Pix, boleto ou cartão.',
            'home_seo' => json_encode([
                'meta_title' => 'ImportFácil — loja B2B de importação',
                'meta_description' => 'Compre direto da importadora, com preço de empresa.',
                'meta_keywords' => 'importação, B2B, cooperativa, distribuidora, revenda, construtora, hospital',
            ], JSON_UNESCAPED_UNICODE),
        ]);

        // frete grátis em todos os pedidos (como no protótipo); sem taxa fixa
        $this->config('sales.carriers.free.active', 1);
        $this->config('sales.carriers.free.title', 'Frete grátis', 'default', $this->locale);
        $this->config('sales.carriers.free.description', 'Frete CIF grátis em todos os pedidos', 'default', $this->locale);
        $this->config('sales.carriers.flatrate.active', 0);

        // B2B: suíte e crédito da empresa ligados
        $this->config('b2b.general.settings.active', 1);
        $this->config('b2b.credit.settings.active', 1);

        $this->config('general.general.locale_options.weight_unit', 'kgs');
    }

    /* ------------------------------------------------------------ Categorias */

    protected function criarCategorias(CategoryRepository $repo, array $cats): array
    {
        $atributos = DB::table('attributes')->whereIn('code', ['price'])->pluck('id')->all();
        $catIds = [];
        $subIds = [];

        foreach ($cats as $c) {
            $slug = Str::slug($c['nome']);
            $publico = $c['perfis'] ? 'Para '.implode(', ', array_map(fn ($k) => mb_strtolower($k), $c['perfis'])) : 'Para todos os tipos de cliente';

            $cat = $repo->create([
                'locale' => 'all',
                'name' => $c['nome'],
                'slug' => $slug,
                'description' => '<p>'.e($c['nome']).' — '.e($publico).'.</p>',
                'meta_title' => $c['nome'].' | ImportFácil',
                'meta_description' => '',
                'meta_keywords' => '',
                'status' => 1,
                'position' => $c['posicao'],
                'display_mode' => 'products_and_description',
                'parent_id' => 1,
                'attributes' => $atributos,
            ]);
            $catIds[$c['id']] = $cat->id;

            foreach ($c['subcategorias'] as $i => $sub) {
                $s = $repo->create([
                    'locale' => 'all',
                    'name' => $sub,
                    'slug' => $slug.'-'.Str::slug($sub),
                    'description' => '<p>'.e($sub).'</p>',
                    'meta_title' => $sub.' | ImportFácil',
                    'meta_description' => '',
                    'meta_keywords' => '',
                    'status' => 1,
                    'position' => $i + 1,
                    'display_mode' => 'products_and_description',
                    'parent_id' => $cat->id,
                    'attributes' => $atributos,
                ]);
                $subIds[$c['id'].'|'.$sub] = $s->id;
            }
        }

        return [$catIds, $subIds];
    }

    /* -------------------------------------------------------------- Produtos */

    protected function criarProdutos(ProductRepository $repo, array $prods, array $catIds, array $subIds, string $dirImg): array
    {
        $ids = [];
        $barra = $this->output->createProgressBar(count($prods));

        foreach ($prods as $p) {
            $sku = Str::slug($p['codigo']).'-'.$p['id'];

            $produto = $repo->create(['type' => 'simple', 'attribute_family_id' => 1, 'sku' => $sku]);

            $cats = array_values(array_filter([
                $catIds[$p['categoria']] ?? null,
                $p['subcategoria'] ? ($subIds[$p['categoria'].'|'.$p['subcategoria']] ?? null) : null,
            ]));

            $venda = 'Venda por '.$p['unidade'].($p['multiplo'] > 1 ? ', em múltiplos de '.$p['multiplo'] : '').'.';
            $curta = $p['marca'].' · código '.$p['codigo'].'. '.$venda
                .($p['sobOrcamento'] ? ' Item sob orçamento: peça a cotação pelo carrinho.' : '')
                .($p['importado'] ? ' Linha de importação: recebimento em 45 dias.' : '');

            $specs = '';
            if ($p['especificacoes']) {
                $specs = '<table><tbody>'.implode('', array_map(
                    fn ($s) => '<tr><th style="text-align:left;padding:4px 12px 4px 0">'.e($s[0]).'</th><td>'.e($s[1]).'</td></tr>',
                    $p['especificacoes']
                )).'</tbody></table>';
            }

            $imagem = null;
            foreach (['.jpg', '.png'] as $ext) {
                $arq = $dirImg.'/'.$p['id'].$ext;
                if (is_file($arq)) {
                    $imagem = new UploadedFile($arq, $p['id'].$ext, $ext === '.jpg' ? 'image/jpeg' : 'image/png', null, true);
                    break;
                }
            }

            $repo->update([
                'channel' => 'default',
                'locale' => $this->locale,
                'sku' => $sku,
                'product_number' => $p['codigo'],
                'name' => $p['nome'],
                'url_key' => Str::slug($p['nome'].'-'.$p['codigo']),
                'short_description' => '<p>'.e($curta).'</p>',
                'description' => '<p>'.e($p['descricao']).'</p>'.$specs
                    .($p['fotoIlustrativa'] ? '<p><small>Imagem ilustrativa.</small></p>' : ''),
                'meta_title' => $p['nome'],
                'meta_description' => Str::limit(strip_tags($p['descricao']), 150),
                'meta_keywords' => $p['marca'],
                'price' => $p['precoTabela'],
                'weight' => 1,
                'status' => 1,
                'visible_individually' => 1,
                'featured' => $p['destaque'] ? 1 : 0,
                'new' => $p['importado'] ? 1 : 0,
                'guest_checkout' => 0,
                'manage_stock' => 1,
                'channels' => [1],
                'categories' => $cats,
                'inventories' => [1 => (int) $p['estoque']],
                'images' => $imagem ? ['files' => [$imagem]] : [],
            ], $produto->id);

            $ids[$p['id']] = $produto->id;
            $barra->advance();
        }

        $barra->finish();
        $this->newLine();

        return $ids;
    }

    /* ---------------------------------------------- Empresas (B2B Suite) */

    protected function criarEmpresas(array $d, array $prodIds): void
    {
        $agora = now()->toDateTimeString();
        $senha = Hash::make(self::SENHA_DEMO);
        $grupoGeral = DB::table('customer_groups')->where('code', 'general')->value('id');
        $adminId = DB::table('admins')->orderBy('id')->value('id');
        $atributos = DB::table('b2b_company_attributes')->pluck('id', 'code');
        $helper = app(CompanyCatalog::class);
        $catalogos = app(CompanyCatalogRepository::class);
        $catPerfis = collect($d['categorias'])->mapWithKeys(fn ($c) => [$c['id'] => $c['perfis']]);

        foreach ($d['perfis'] as $n => $perfil) {
            [$razao, $nome, $sobrenome, $cidade, $uf, $cep] = self::EMPRESAS[$perfil['codigo']];
            $email = $perfil['codigo'].'@'.self::DOMINIO_DEMO;

            $empresaId = DB::table('customers')->insertGetId([
                'first_name' => $nome,
                'last_name' => $sobrenome,
                'email' => $email,
                'type' => 'company',
                'phone' => '+55 32 4000-12'.str_pad((string) (10 + $n), 2, '0', STR_PAD_LEFT),
                'status' => 1,
                'password' => $senha,
                'api_token' => Str::random(80),
                'customer_group_id' => $grupoGeral,
                'sales_rep_id' => $adminId,
                'channel_id' => 1,
                'is_verified' => 1,
                'subscribed_to_news_letter' => 0,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);

            $papelId = DB::table('b2b_company_roles')->insertGetId([
                'name' => 'Administrador',
                'description' => 'Acesso a todas as funções da empresa.',
                'permission_type' => 'all',
                'permissions' => null,
                'customer_id' => $empresaId,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);
            DB::table('b2b_company_roles')->insert([
                'name' => 'Comprador',
                'description' => 'Pede cotações, faz pedido rápido e listas de compra.',
                'permission_type' => 'custom',
                'permissions' => json_encode(['quotes', 'quotes.view', 'purchase_orders', 'purchase_orders.view', 'requisitions', 'requisitions.create', 'quick_orders']),
                'customer_id' => $empresaId,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);
            DB::table('customers')->where('id', $empresaId)->update(['company_role_id' => $papelId]);
            DB::table('b2b_customer_companies')->insert(['customer_id' => $empresaId, 'company_id' => $empresaId]);

            $perfilEmpresa = [
                'first_name' => $nome, 'last_name' => $sobrenome, 'email' => $email, 'phone' => '+55 32 4000-12'.str_pad((string) (10 + $n), 2, '0', STR_PAD_LEFT),
                'business_name' => $razao.' (demonstração)', 'website_url' => 'https://'.self::DOMINIO_DEMO,
                'vat_tax_id' => '00.000.000/0001-'.str_pad((string) $empresaId, 2, '0', STR_PAD_LEFT),
                'address' => 'Endereço de demonstração', 'city' => $cidade, 'country' => 'BR', 'state' => $uf, 'postcode' => $cep,
            ];
            DB::table('b2b_company_flat')->insert(array_merge(
                array_intersect_key($perfilEmpresa, array_flip(['first_name', 'last_name', 'email', 'phone', 'business_name', 'website_url', 'vat_tax_id', 'address', 'city', 'country', 'state', 'postcode'])),
                ['customer_id' => $empresaId, 'locale' => $this->locale, 'channel' => 'default', 'created_at' => $agora, 'updated_at' => $agora]
            ));
            foreach ($perfilEmpresa as $code => $valor) {
                if (empty($atributos[$code])) {
                    continue;
                }
                DB::table('b2b_company_attribute_values')->insert([
                    'locale' => $this->locale,
                    'channel' => 'default',
                    'text_value' => $valor,
                    'customer_id' => $empresaId,
                    'company_attribute_id' => $atributos[$code],
                    'unique_id' => implode('|', ['default', $this->locale, $empresaId, $atributos[$code]]),
                ]);
            }

            // crédito: 2× o pedido mínimo do tipo (a política "faixa A" do protótipo)
            $limite = 2 * (float) $perfil['pedidoMinimo'];
            $creditoId = DB::table('b2b_company_credits')->insertGetId([
                'company_id' => $empresaId,
                'credit_currency_code' => 'BRL',
                'credit_limit' => $limite,
                'outstanding_balance' => 0,
                'allow_exceed_limit' => 0,
                'status' => 1,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);
            DB::table('b2b_company_credit_transactions')->insert([
                'company_credit_id' => $creditoId,
                'operation' => 'allocated',
                'amount' => $limite,
                'outstanding_balance_after' => 0,
                'available_credit_after' => $limite,
                'credit_limit_after' => $limite,
                'reference' => null,
                'comment' => 'Linha de crédito inicial (demonstração).',
                'actor_type' => 'admin',
                'actor_id' => $adminId,
                'created_at' => $agora,
                'updated_at' => $agora,
            ]);

            // catálogo da empresa: só as categorias do tipo de cliente, com o desconto do tipo
            $produtosDoTipo = collect($d['produtos'])
                ->filter(function ($p) use ($catPerfis, $perfil) {
                    $perfis = $catPerfis[$p['categoria']] ?? null;

                    return ! $perfis || in_array($perfil['codigo'], $perfis, true);
                })
                ->map(fn ($p) => $prodIds[$p['id']] ?? null)
                ->filter()->values()->all();

            $catalogo = $catalogos->create([
                'name' => 'Catálogo '.$perfil['nome'],
                'description' => $perfil['texto'].' Desconto de '.$perfil['desconto'].'% sobre o preço de tabela.',
                'status' => 1,
                'created_by' => $adminId,
            ]);
            $helper->syncProducts($catalogo, $produtosDoTipo);
            $helper->deriveCategories($catalogo);
            $helper->setPrices($catalogo, collect($produtosDoTipo)->mapWithKeys(fn ($id) => [$id => ['type' => 'discount', 'value' => $perfil['desconto']]])->all());
            $helper->assignCompanies($catalogo->fresh(), [$empresaId]);

            $this->line(sprintf('  %-14s %-32s %4d produtos  -%d%%  crédito %s  login %s', $perfil['nome'], $razao, count($produtosDoTipo), $perfil['desconto'], number_format($limite, 2, ',', '.'), $email));
        }
    }

    /* -------------------------------------------------------- Página inicial */

    protected function paginaInicial(array $d, array $catIds, string $dirMarca): void
    {
        DB::table('theme_section_translations')->whereIn('section_id', DB::table('theme_sections')->where('channel_id', 1)->pluck('id'))->delete();
        DB::table('theme_sections')->where('channel_id', 1)->delete();

        $tema = DB::table('channels')->where('id', 1)->value('theme') ?: 'default';
        $banners = function (int $secao) use ($dirMarca, $tema) {
            $l = [];
            foreach ([1, 2, 3] as $n) {
                $l[] = [
                    'title' => ['Compre direto da importadora', 'Importação sob encomenda', 'Pague como preferir'][$n - 1],
                    'link' => '',
                    'image' => Storage::disk('public')->putFileAs("themes/$tema/sections/$secao", new \Illuminate\Http\File($dirMarca."/banner-$n.png"), "banner-$n.png"),
                ];
            }

            return ['images' => $l];
        };

        $secoes = [
            ['image_carousel', 'Banners', $banners],
            ['static_content', 'Faixa de avisos', [
                'html' => '<div class="if-faixa"><span>Venda exclusiva para pessoa jurídica</span><span>Frete grátis em todos os pedidos</span><span>Pix com 3% de desconto</span><span>Boleto 30/60/90/120 após a aprovação de crédito</span></div>',
                'css' => '.if-faixa{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 28px;background:#1D4ED8;color:#fff;font-size:15px;padding:12px 16px;text-align:center}.if-faixa span{white-space:nowrap}@media (max-width:640px){.if-faixa{font-size:13px;gap:4px 16px}}',
            ]],
            ['category_carousel', 'Categorias', ['filters' => ['parent_id' => 1, 'sort' => 'asc', 'limit' => 12]]],
            ['product_carousel', 'Destaques', ['title' => 'Destaques', 'filters' => ['featured' => 1, 'sort' => 'name-asc', 'limit' => 12]]],
            ['product_carousel', 'Linha de importação', ['title' => 'Linha de importação · recebimento em 45 dias', 'filters' => ['new' => 1, 'sort' => 'name-asc', 'limit' => 12]]],
            ['static_content', 'Tipos de cliente', [
                'html' => '<div class="if-tipos"><h2>Preço e catálogo feitos para o seu tipo de empresa</h2><div class="if-grade">'
                    .implode('', array_map(fn ($p) => '<div><b>'.e($p['nome']).'</b><p>'.e($p['texto']).'</p><small>Pedido mínimo R$ '.number_format($p['pedidoMinimo'], 0, ',', '.').' · '.$p['desconto'].'% de desconto</small></div>', $d['perfis']))
                    .'</div></div>',
                'css' => '.if-tipos{max-width:1200px;margin:48px auto;padding:0 16px}.if-tipos h2{font-size:28px;margin:0 0 20px;font-weight:600}.if-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}.if-grade div{border:1px solid #e5e7eb;border-radius:16px;padding:18px}.if-grade b{font-size:18px}.if-grade p{color:#52525b;margin:8px 0;font-size:14px}.if-grade small{font-size:13px;color:#18181b}',
            ]],
            ['services_content', 'Serviços', ['services' => [
                ['title' => 'Frete grátis', 'description' => 'Em todos os pedidos, a partir do pedido mínimo do seu tipo de cliente.', 'service_icon' => 'icon-truck'],
                ['title' => 'Pix com 3% de desconto', 'description' => 'Pedido confirmado assim que o banco avisa o pagamento.', 'service_icon' => 'icon-dollar-sign'],
                ['title' => 'Boleto e crédito da empresa', 'description' => 'Em até 4 parcelas, depois da aprovação de crédito.', 'service_icon' => 'icon-product'],
                ['title' => 'Atendimento comercial', 'description' => 'Cotação, pedido rápido por código e acompanhamento da importação.', 'service_icon' => 'icon-support'],
            ]]],
            ['footer_links', 'Rodapé', [
                'column_1' => [
                    ['url' => 'page/about-us', 'title' => 'Sobre a ImportFácil', 'sort_order' => 1],
                    ['url' => 'contact-us', 'title' => 'Fale com o comercial', 'sort_order' => 2],
                    ['url' => 'page/customer-service', 'title' => 'Atendimento', 'sort_order' => 3],
                ],
                'column_2' => [
                    ['url' => 'page/privacy-policy', 'title' => 'Política de privacidade', 'sort_order' => 1],
                    ['url' => 'page/terms-of-use', 'title' => 'Termos de uso', 'sort_order' => 2],
                    ['url' => 'page/shipping-policy', 'title' => 'Política de entrega', 'sort_order' => 3],
                ],
            ]],
        ];

        foreach ($secoes as $i => [$tipo, $nome, $opcoes]) {
            $id = DB::table('theme_sections')->insertGetId([
                'type' => $tipo,
                'name' => $nome,
                'sort_order' => $i + 1,
                'status' => 1,
                'channel_id' => 1,
                'theme_code' => $tema,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('theme_section_translations')->insert([
                'section_id' => $id,
                'locale' => $this->locale,
                'options' => json_encode(is_callable($opcoes) ? $opcoes($id) : $opcoes, JSON_UNESCAPED_UNICODE),
            ]);
        }
    }
}
