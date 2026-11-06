// Baixa a tabela oficial da NCM (Siscomex / Receita Federal) e gera prototipo-ncm.json,
// usado pela busca de NCM da calculadora de importação (Painel da equipe).
// Formato gerado: { atualizadoEm, ato, fonte, total, n: [[codigoSóDígitos, descrição], ...] }
// com todos os níveis (capítulo, posição, subposições e itens), para montar a descrição completa no navegador.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const URL_NCM = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';
const SAIDA = process.argv[2] || 'prototipo-ncm.json';

async function baixar() {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const r = await fetch(URL_NCM, { headers: { 'User-Agent': 'ImportFacil-tabela-ncm/1.0', Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // a Receita às vezes entrega em latin1; tenta utf-8 e corrige se aparecer caractere inválido
      const buf = Buffer.from(await r.arrayBuffer());
      let txt = buf.toString('utf8');
      if (txt.includes('�')) txt = buf.toString('latin1');
      return JSON.parse(txt.replace(/^﻿/, ''));
    } catch (e) {
      ultimoErro = e;
      console.error(`Tentativa ${tentativa} falhou: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 5000 * tentativa));
    }
  }
  throw ultimoErro;
}

const dados = await baixar();
const lista = dados.Nomenclaturas || dados.nomenclaturas;
if (!Array.isArray(lista) || lista.length < 9000) throw new Error('Tabela inesperada: ' + (lista ? lista.length : 'sem Nomenclaturas'));

const hoje = new Date().toISOString().slice(0, 10);
const vigente = (x) => {
  const fim = x.Data_Fim || x.data_fim;
  if (!fim) return true;
  const [d, m, a] = String(fim).split('/');
  return !a || `${a}-${m}-${d}` >= hoje;
};
const nos = lista
  .filter(vigente)
  .map((x) => [String(x.Codigo || x.codigo).replace(/\D/g, ''), String(x.Descricao || x.descricao).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()])
  .filter(([c]) => c.length >= 2)
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[0].length - b[0].length));

const folhas = nos.filter(([c]) => c.length === 8).length;
const novo = {
  atualizadoEm: dados.Data_Ultima_Atualizacao_NCM || hoje,
  ato: dados.Ato || '',
  fonte: 'Receita Federal / Portal Único Siscomex — tabela NCM vigente',
  total: folhas,
  n: nos,
};
const antigo = existsSync(SAIDA) ? readFileSync(SAIDA, 'utf8') : '';
const json = JSON.stringify(novo);
if (antigo && JSON.stringify(JSON.parse(antigo).n) === JSON.stringify(novo.n)) {
  console.log(`Sem mudanças na NCM (${folhas} códigos).`);
} else {
  writeFileSync(SAIDA, json);
  console.log(`Tabela NCM gravada: ${folhas} códigos de 8 dígitos, ${nos.length} níveis, atualizada em ${novo.atualizadoEm}.`);
}
