<?php

// permissões do Painel para papéis personalizados (o administrador com "todas" já tem acesso)
return [
    ['key' => 'importacao', 'name' => 'Importação', 'route' => 'admin.importfacil.importacao.index', 'sort' => 6],
    ['key' => 'importacao.ordens', 'name' => 'Ordens de importação', 'sort' => 1, 'route' => [
        'admin.importfacil.importacao.index', 'admin.importfacil.importacao.ver', 'admin.importfacil.importacao.avancar',
        'admin.importfacil.importacao.numerario', 'admin.importfacil.importacao.ncm',
    ]],
    ['key' => 'importacao.calculadora', 'name' => 'Calculadora de importação', 'sort' => 2, 'route' => [
        'admin.importfacil.calculadora', 'admin.importfacil.calculadora.calcular', 'admin.importfacil.ncm.buscar',
    ]],
    ['key' => 'importacao.ncm', 'name' => 'Tabela NCM', 'route' => 'admin.importfacil.ncm', 'sort' => 3],
    ['key' => 'importacao.empresas', 'name' => 'Empresas: faixa e conta e ordem', 'sort' => 4, 'route' => [
        'admin.importfacil.empresas', 'admin.importfacil.empresas.salvar',
    ]],
];
