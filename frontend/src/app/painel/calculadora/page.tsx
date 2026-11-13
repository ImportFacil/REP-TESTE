'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icone } from '@/components/painel/Icone';
import '@/components/painel/calculadora.css';
import {
  aplicarAba, buscarNcm, calcular, DESPESAS, descricaoNcm, formatarNcm, itemNovo, lerAba, MODELO_CSV, montarTabelaNcm, numeroLido, padrao,
  restaurar, resultadoCsv, vazio, type AbaLida, type EstadoCalc, type ItemCalc, type TabelaNcm,
} from '@/lib/calculadora';
import { data } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

const CHAVE = 'exportfacil:calculadora';
const BRL = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const USD = (v: number, casas = 2) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: casas });
const PCT = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const num = (v: number, casas = 2) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });

function baixar(nome: string, texto: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Campo numérico no padrão brasileiro (aceita "5,45" e "1.234,56"); recalcula enquanto digita. */
function Num({ id, rotulo, valor, mudar, dica, min }: { id: string; rotulo: ReactNode; valor: number; mudar: (v: number) => void; dica?: ReactNode; min?: number }) {
  const [texto, setTexto] = useState(() => num(valor, 6));
  const focado = useRef(false);
  useEffect(() => { if (!focado.current) setTexto(num(valor, 6)); }, [valor]);
  return (
    <label className="campo calc-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <input id={id} inputMode="decimal" autoComplete="off" value={texto}
        onFocus={() => { focado.current = true; }}
        onBlur={() => { focado.current = false; setTexto(num(valor, 6)); }}
        onChange={(e) => {
          setTexto(e.target.value);
          let v = numeroLido(e.target.value) ?? 0;
          if (min != null && v < min) v = min;
          mudar(v);
        }} />
      {dica && <small className="muted">{dica}</small>}
    </label>
  );
}

function Linha({ k, v, forte }: { k: ReactNode; v: ReactNode; forte?: boolean }) {
  return <div className={`calc-linha ${forte ? 'calc-forte' : ''}`}><span>{k}</span><span className="numero">{v}</span></div>;
}

type Sxlsx = { read: (b: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, Record<string, unknown>> }; utils: { sheet_to_json: (ws: unknown, o: object) => unknown[][] } };
let leitor: Promise<Sxlsx> | null = null;
/** Leitor de planilhas (SheetJS), carregado só quando alguém anexa uma planilha. */
function carregarLeitor(): Promise<Sxlsx> {
  const w = window as unknown as { XLSX?: Sxlsx };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  leitor ??= new Promise<Sxlsx>((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.async = true;
    s.onload = () => (w.XLSX ? ok(w.XLSX) : erro(new Error('leitor de planilhas indisponível')));
    s.onerror = () => { leitor = null; erro(new Error('sem conexão para carregar o leitor de planilhas')); };
    document.head.appendChild(s);
  });
  return leitor;
}

let tabelaNcm: Promise<TabelaNcm> | null = null;
function carregarNcm(): Promise<TabelaNcm> {
  tabelaNcm ??= fetch('/ncm.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(montarTabelaNcm)
    .catch((e) => { tabelaNcm = null; throw e; });
  return tabelaNcm;
}

/** Busca de NCM na tabela oficial, aberta dentro do cartão do item. */
function BuscaNcm({ item, usar, fechar }: { item: ItemCalc; usar: (c: string) => void; fechar: () => void }) {
  const [q, setQ] = useState(item.desc);
  const [t, setT] = useState<TabelaNcm | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { carregarNcm().then(setT, (e: Error) => setErro(e.message)); }, []);
  const r = useMemo(() => (t ? buscarNcm(t, q) : null), [t, q]);
  return (
    <div className="calc-ncm-busca" role="group" aria-label="Buscar NCM">
      <div className="linha entre"><b>Buscar NCM</b><button type="button" className="botao leve pequeno" onClick={fechar} aria-label="Fechar a busca de NCM"><Icone nome="fechar" tamanho={16} /></button></div>
      <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: drone pulverizador, furadeira, 8424" aria-label="Buscar na tabela NCM" />
      <p className="pequeno muted" style={{ margin: '6px 0' }}>
        {erro ? `Não consegui carregar a tabela NCM (${erro}).` : t ? `Tabela NCM oficial da Receita Federal (Siscomex), ${t.meta.total.toLocaleString('pt-BR')} códigos · ${t.meta.atualizadoEm}${t.meta.ato ? ` · ${t.meta.ato}` : ''}` : 'Carregando a tabela oficial…'}
      </p>
      {r?.dica && <p className="calc-nota">{r.dica}</p>}
      {r?.parcial && r.itens.length > 0 && <p className="pequeno muted">Nenhum código tem todas as palavras; mostrando os mais próximos.</p>}
      <div className="calc-ncm-lista">
        {r && r.itens.map((f) => (
          <button type="button" key={f.c} className="calc-ncm-op" onClick={() => usar(formatarNcm(f.c))}>
            <span className="calc-ncm-cod">{formatarNcm(f.c)}</span>
            <span><b>{f.d}</b><small className="muted">{[f.pos, ...f.sub.filter((s) => s !== f.d)].join(' › ')}</small></span>
          </button>
        ))}
        {t && r && !r.itens.length && <p className="pequeno muted">{q.trim() ? 'Nada encontrado. Tente outra palavra (o material ou a função do produto) ou o começo do código.' : 'Digite o nome do produto ou o começo do código.'}</p>}
        {r && r.itens.length >= 40 && <p className="pequeno muted">Mostrando os 40 primeiros. Refine a busca para ver outros.</p>}
      </div>
    </div>
  );
}

/** Importação → Calculadora de importação: custo nacionalizado por item, preço sugerido e comparação com o preço de mercado. */
export default function Calculadora() {
  const [s, setS] = useState<EstadoCalc>(() => padrao('20'));
  const [lido, setLido] = useState(false);
  const [aviso, setAviso] = useState('');
  const [abas, setAbas] = useState<{ arquivo: string; abas: Array<{ nome: string; R: AbaLida }> } | null>(null);
  const [buscaNcm, setBuscaNcm] = useState<number | null>(null);
  const [tabela, setTabela] = useState<TabelaNcm | null>(null);
  // dólar do dia: PTAX de venda do Banco Central (sem resposta, a última cotação de Configurações → Câmbio)
  const { dados: dolar } = useDados<{ data: string; taxa: number; fonte: string; origem: 'banco_central' | 'cadastro' } | null>('/equipe/configuracoes/cambio/dolar-do-dia');
  const dolarAplicado = useRef(false);

  useEffect(() => {
    try { const r = restaurar(JSON.parse(localStorage.getItem(CHAVE) ?? 'null')); if (r) setS(r); } catch { /* sem armazenamento */ }
    setLido(true);
    carregarNcm().then(setTabela, () => undefined);
  }, []);
  // Ao abrir, os três câmbios já vêm com o dólar do dia (dá para trocar depois; uma planilha anexada traz os dela).
  useEffect(() => {
    if (!lido || !dolar || dolarAplicado.current) return;
    dolarAplicado.current = true;
    setS((a) => ({ ...a, cambioDI: dolar.taxa, cambioFrete: dolar.taxa, cambioPag: dolar.taxa }));
  }, [lido, dolar]);
  useEffect(() => { if (lido) { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem armazenamento */ } } }, [s, lido]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 6000); return () => clearTimeout(t); }, [aviso]);

  const R = useMemo(() => calcular(s), [s]);
  const T = R.T;
  const X = R.exterior;
  const mudar = (p: Partial<EstadoCalc>) => setS((a) => ({ ...a, ...p }));
  const mudarItem = (ix: number, p: Partial<ItemCalc>) => setS((a) => ({ ...a, itens: a.itens.map((it, i) => (i === ix ? { ...it, ...p } : it)) }));
  const carregarModelo = (m: string, confirmar = false) => {
    if (m === 'importado') return;
    if (confirmar && !window.confirm('Voltar aos valores da planilha? Suas alterações nesta calculadora serão perdidas.')) return;
    setS(m === 'vazio' ? vazio() : padrao(m === '40' ? '40' : '20'));
    setBuscaNcm(null);
    setAviso(m === 'vazio' ? 'Calculadora em branco.' : `Valores da planilha carregados (contêiner ${m}').`);
  };
  const aplicar = (arquivo: string, a: { nome: string; R: AbaLida }) => {
    setS((atual) => aplicarAba(atual, arquivo, a.nome, a.R));
    setAbas(null);
    const nDesp = Object.keys(a.R.desp).length + (a.R.freteUSD != null ? 1 : 0);
    const nCamb = Object.keys(a.R.cambios).length;
    setAviso(`Planilha importada: ${a.R.itens.length} itens${nCamb || nDesp ? `, ${nCamb} câmbio(s) e ${nDesp} despesa(s)` : '. Câmbio e despesas mantidos como estavam'}.${a.R.avisos.length ? ` ${a.R.avisos.join(' ')}` : ''}`);
  };
  const anexar = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setAviso('Planilha muito grande (máx. 10 MB).'); return; }
    setAviso('Lendo a planilha…');
    try {
      const XL = await carregarLeitor();
      const texto = /\.(csv|txt)$/i.test(f.name);
      const wb = XL.read(await f.arrayBuffer(), { type: 'array', cellDates: false, raw: texto }); // CSV: mantém "12,5" e "6,5%" como texto
      const lidas = wb.SheetNames.map((nome) => {
        const ws = wb.Sheets[nome];
        if (!ws || !ws['!ref']) return null;
        const R2 = lerAba(XL.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }));
        return R2 && R2.itens.length ? { nome, R: R2 } : null;
      }).filter((x): x is { nome: string; R: AbaLida } => !!x);
      if (!lidas.length) { setAviso('Não achei uma tabela de itens (cabeçalho com Descrição e Quantidade) nesta planilha.'); return; }
      if (lidas.length === 1) aplicar(f.name, lidas[0]);
      else { setAbas({ arquivo: f.name, abas: lidas }); setAviso(''); }
    } catch (e) { setAviso(`Não consegui ler a planilha: ${(e as Error).message}`); }
  };
  const ncmDe = (it: ItemCalc) => {
    const c = String(it.ncm || '').replace(/\D/g, '');
    if (!tabela || !c) return null;
    return { f: tabela.porCodigo.get(c) ?? null, completo: c.length >= 8 };
  };

  return (
    <div className="calc">
      <div className="pn-cabecalho">
        <div>
          <h1>Calculadora de importação</h1>
          <p className="sub muted">Custo nacionalizado por item, preço de venda sugerido e comparação com o preço de mercado. Recalcula enquanto você digita e fica salva neste navegador.</p>
        </div>
        <div className="pn-cabecalho-acoes">
          <button className="botao secundario" onClick={() => baixar(`calculo-importacao-${new Date().toISOString().slice(0, 10)}.csv`, resultadoCsv(s))}><Icone nome="exportar" tamanho={16} /> Exportar resultado (CSV)</button>
        </div>
      </div>

      {aviso && <div className="aviso info" role="status">{aviso}</div>}

      <section className="pn-caixa calc-caixa">
        <div className="calc-inicio">
          <label className="campo" htmlFor="calcModelo">
            <span>Começar a partir de</span>
            <select id="calcModelo" value={s.modelo} onChange={(e) => carregarModelo(e.target.value)}>
              <option value="20">Planilha de drones: contêiner 20&apos; (48 un.)</option>
              <option value="40">Planilha de drones: contêiner 40&apos; (110 un.)</option>
              <option value="vazio">Em branco</option>
              {s.modelo === 'importado' && <option value="importado">Planilha anexada: {s.origem?.arquivo}</option>}
            </select>
          </label>
          <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="botao secundario" htmlFor="calcArq" style={{ cursor: 'pointer' }}><Icone nome="documento" tamanho={16} /> Anexar planilha</label>
            <input id="calcArq" type="file" hidden accept=".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void anexar(f); }} />
            <button className="botao leve" onClick={() => baixar('modelo-calculadora-importacao.csv', MODELO_CSV)}>Baixar modelo (CSV)</button>
          </div>
        </div>
        <p className="pequeno muted" style={{ margin: '8px 0 0' }}>
          {s.modelo === 'importado' && s.origem
            ? <>Dados de <b>{s.origem.arquivo}</b>, aba {s.origem.aba}, importados em {s.origem.em}.</>
            : 'Anexe .xlsx, .xls ou .csv no formato da planilha de custos (cabeçalho com Descrição, Quant., $ / Unit, Net Wt, NCM e alíquotas).'}
        </p>
        {abas && (
          <div className="calc-abas">
            <b>Qual aba usar?</b> <span className="muted pequeno">{abas.arquivo} tem {abas.abas.length} abas com itens.</span>
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {abas.abas.map((a) => <button key={a.nome} className="botao secundario pequeno" onClick={() => aplicar(abas.arquivo, a)}>{a.nome} · {a.R.itens.length} itens</button>)}
              <button className="botao leve pequeno" onClick={() => setAbas(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      <div className="calc-colunas">
        <div className="calc-principal">
          <section className="pn-caixa calc-caixa">
            <h2>Câmbio</h2>
            <div className="calc-grade">
              <Num id="cDI" rotulo="Câmbio do registro da DI (R$/US$)" valor={s.cambioDI} mudar={(v) => mudar({ cambioDI: v })} />
              <Num id="cFr" rotulo="Câmbio do frete (R$/US$)" valor={s.cambioFrete} mudar={(v) => mudar({ cambioFrete: v })} />
              <Num id="cPg" rotulo="Câmbio do pagamento final (R$/US$)" valor={s.cambioPag} mudar={(v) => mudar({ cambioPag: v })} />
            </div>
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {dolar
                ? <>
                  <span className="pequeno" id="calcDolar">Dólar do dia: <b>R$ {num(dolar.taxa, 4)}</b> · {dolar.origem === 'banco_central' ? 'PTAX de venda do Banco Central' : 'última cotação de Configurações → Câmbio'} de {data(`${dolar.data}T12:00:00`)}</span>
                  {(s.cambioDI !== dolar.taxa || s.cambioFrete !== dolar.taxa || s.cambioPag !== dolar.taxa)
                    && <button className="botao secundario pequeno" onClick={() => mudar({ cambioDI: dolar.taxa, cambioFrete: dolar.taxa, cambioPag: dolar.taxa })}>Voltar ao dólar do dia</button>}
                </>
                : <span className="pequeno muted">Sem cotação do dólar: informe o câmbio ou cadastre em Configurações → Câmbio.</span>}
            </div>
            <p className="pequeno muted calc-pe">Ao abrir a calculadora, os três câmbios vêm com o dólar do dia. A diferença entre o câmbio da DI e o do pagamento entra como variação cambial.</p>
          </section>

          <section className="pn-caixa calc-caixa">
            <h2>Custos antes da chegada ao Brasil (US$)</h2>
            <p className="pequeno muted">Tudo que é cobrado até a mercadoria chegar ao porto ou aeroporto no Brasil, em dólar. O FOB de cada item fica no cartão do item.</p>
            <div className="calc-ext">
              <div className="calc-ext-linha">
                <div><b>Frete internacional</b><small className="muted">Rateado pelo peso · entra no valor aduaneiro</small></div>
                <Num id="cFrete" rotulo="US$" valor={s.freteUSD} min={0} mudar={(v) => mudar({ freteUSD: v })} />
                <div className="calc-ext-brl numero">= {BRL(X.freteUSD * s.cambioFrete)}</div>
              </div>
              <div className="calc-ext-linha">
                <div><b>Seguro internacional</b><small className="muted">Deixe 0 para estimar em {num(s.seguroPct)}% de FOB + frete · entra no valor aduaneiro</small>
                  <div className="calc-mini"><Num id="cSeg" rotulo="Estimativa (% de FOB + frete)" valor={s.seguroPct} min={0} mudar={(v) => mudar({ seguroPct: v })} /></div>
                </div>
                <Num id="cSegUSD" rotulo="US$" valor={s.seguroUSD} min={0} mudar={(v) => mudar({ seguroUSD: v })} />
                <div className="calc-ext-brl numero">= {BRL(T.seguro)}{s.seguroUSD > 0 ? null : <small className="muted">estimado: {USD(X.seguroUSD)}</small>}</div>
              </div>
              {s.exterior.map((x, i) => (
                <div className="calc-ext-linha" key={i}>
                  <div>
                    <input className="calc-ext-nome" aria-label={`Descrição da despesa no exterior ${i + 1}`} value={x.rot} onChange={(e) => mudar({ exterior: s.exterior.map((y, j) => (j === i ? { ...y, rot: e.target.value } : y)) })} />
                    <label className="calc-chk"><input type="checkbox" checked={x.va} onChange={(e) => mudar({ exterior: s.exterior.map((y, j) => (j === i ? { ...y, va: e.target.checked } : y)) })} /> Entra no valor aduaneiro (base dos tributos)</label>
                  </div>
                  <Num id={`cX${i}`} rotulo="US$" valor={x.usd} min={0} mudar={(v) => mudar({ exterior: s.exterior.map((y, j) => (j === i ? { ...y, usd: v } : y)) })} />
                  <div className="calc-ext-brl numero">= {BRL(x.usd * s.cambioDI)}
                    <button className="botao leve pequeno" aria-label={`Remover despesa no exterior ${i + 1}`} title="Remover" onClick={() => mudar({ exterior: s.exterior.filter((_, j) => j !== i) })}><Icone nome="fechar" tamanho={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button className="botao secundario pequeno" style={{ marginTop: 10 }} onClick={() => mudar({ exterior: [...s.exterior, { rot: 'Nova despesa no exterior', usd: 0, va: true }] })}><Icone nome="mais" tamanho={14} /> Adicionar despesa no exterior</button>
            <p className="calc-ext-total">Total no exterior: <b>{USD(X.totalUSD)}</b> (FOB {USD(X.fobUSD)} + frete {USD(X.freteUSD)} + seguro {USD(X.seguroUSD)}{X.origemUSD ? ` + origem ${USD(X.origemUSD)}` : ''})</p>
            <p className="pequeno muted calc-pe">Convertidos pelo câmbio da DI e rateados pelo valor FOB de cada item (o frete, pelo peso). Pela valoração aduaneira, frete, seguro e gastos até o porto de embarque entram na base dos tributos; comissão de compra não entra. Marque conforme o caso.</p>
          </section>

          <section className="pn-caixa calc-caixa">
            <h2>Itens ({s.itens.length})</h2>
            {s.itens.map((it, ix) => {
              const l = R.linhas[ix];
              const n = ncmDe(it);
              return (
                <div className="calc-item" key={ix}>
                  <div className="calc-item-topo">
                    <input aria-label={`Descrição do item ${ix + 1}`} placeholder="Descrição do produto" value={it.desc} onChange={(e) => mudarItem(ix, { desc: e.target.value })} />
                    <button className="botao leve pequeno" title="Remover item" aria-label={`Remover item ${ix + 1}`}
                      onClick={() => setS((a) => ({ ...a, itens: a.itens.length > 1 ? a.itens.filter((_, i) => i !== ix) : [itemNovo()] }))}><Icone nome="fechar" tamanho={16} /></button>
                  </div>
                  <div className="calc-grade">
                    <div className="campo calc-campo">
                      <label htmlFor={`ci${ix}_ncm`}>NCM</label>
                      <div className="calc-ncm">
                        <input id={`ci${ix}_ncm`} value={it.ncm} placeholder="0000.00.00" onChange={(e) => mudarItem(ix, { ncm: e.target.value })}
                          className={n && !n.f && n.completo ? 'calc-invalido' : ''} title={n?.f ? `${formatarNcm(n.f.c)} — ${n.f.d}` : undefined} />
                        <button type="button" className="botao secundario pequeno" title="Buscar NCM na tabela oficial" aria-label={`Buscar NCM do item ${ix + 1}`} onClick={() => setBuscaNcm(buscaNcm === ix ? null : ix)}><Icone nome="busca" tamanho={16} /></button>
                      </div>
                      {n?.f && <small className="muted">{descricaoNcm(n.f)}</small>}
                      {n && !n.f && n.completo && <small className="neg">Não existe na tabela NCM vigente</small>}
                    </div>
                    <Num id={`ci${ix}_qtd`} rotulo="Quantidade" valor={it.qtd} min={0} mudar={(v) => mudarItem(ix, { qtd: v })} />
                    <Num id={`ci${ix}_fob`} rotulo="FOB unitário (US$)" valor={it.fob} min={0} mudar={(v) => mudarItem(ix, { fob: v })} />
                    <Num id={`ci${ix}_peso`} rotulo="Peso líquido total (kg)" valor={it.peso} min={0} mudar={(v) => mudarItem(ix, { peso: v })} />
                  </div>
                  {buscaNcm === ix && <BuscaNcm item={it} fechar={() => setBuscaNcm(null)} usar={(c) => { mudarItem(ix, { ncm: c }); setBuscaNcm(null); setAviso(`NCM ${c} aplicado ao item.`); }} />}
                  <details className="calc-det">
                    <summary>Tributos e preço de mercado</summary>
                    <div className="calc-grade">
                      <Num id={`ci${ix}_ii`} rotulo="II (%)" valor={it.ii} mudar={(v) => mudarItem(ix, { ii: v })} />
                      <Num id={`ci${ix}_ipi`} rotulo="IPI (%)" valor={it.ipi} mudar={(v) => mudarItem(ix, { ipi: v })} />
                      <Num id={`ci${ix}_pis`} rotulo="PIS (%)" valor={it.pis} mudar={(v) => mudarItem(ix, { pis: v })} />
                      <Num id={`ci${ix}_cofins`} rotulo="COFINS (%)" valor={it.cofins} mudar={(v) => mudarItem(ix, { cofins: v })} />
                      <Num id={`ci${ix}_merc`} rotulo="Preço de mercado no Brasil, por unidade (R$)" valor={it.mercado} min={0} mudar={(v) => mudarItem(ix, { mercado: v })} />
                    </div>
                  </details>
                  <p className="calc-item-res">
                    {l ? <>Custo líquido + FINIMP <b>{BRL(l.totU)}</b>/un. · preço sugerido <b>{BRL(l.pv)}</b>{l.margemMerc != null && <> · margem no preço de mercado <b className={l.margemMerc >= 0 ? 'pos' : 'neg'}>{PCT(l.margemMerc)}</b></>}</> : 'Sem quantidade: fora do cálculo.'}
                  </p>
                </div>
              );
            })}
            <button className="botao secundario largo" onClick={() => setS((a) => ({ ...a, itens: [...a.itens, itemNovo()] }))}><Icone nome="mais" tamanho={16} /> Adicionar item</button>
          </section>

          <section className="pn-caixa calc-caixa">
            <h2>Despesas no Brasil (R$)</h2>
            <div className="calc-grade">
              <Num id="cCap" rotulo="Capatazia" valor={s.capatazia} min={0} mudar={(v) => mudar({ capatazia: v })} />
              <Num id="cAf" rotulo="AFRMM (% do frete)" valor={s.afrmmPct} min={0} mudar={(v) => mudar({ afrmmPct: v })} />
              {DESPESAS.map(([k, t]) => <Num key={k} id={`cD_${k}`} rotulo={t} valor={s.desp[k]} min={0} mudar={(v) => mudar({ desp: { ...s.desp, [k]: v } })} />)}
            </div>
            <label className="calc-chk" style={{ marginTop: 12 }}><input type="checkbox" checked={s.siscomexAuto} onChange={(e) => mudar({ siscomexAuto: e.target.checked })} /> Calcular a Taxa Siscomex pelo número de adições</label>
            {!s.siscomexAuto && <div className="calc-grade"><Num id="cSisc" rotulo="Taxa Siscomex (R$)" valor={s.siscomex} min={0} mudar={(v) => mudar({ siscomex: v })} /></div>}
            <p className="pequeno muted calc-pe">{R.adicoes} adição(ões) (NCM + alíquotas diferentes) · Taxa Siscomex {BRL(R.siscomex)} · peso total {num(R.pesoTot, 0)} kg · {num(R.qtdTot, 0)} unidade(s)</p>
          </section>

          <section className="pn-caixa calc-caixa">
            <h2>Tributação e venda</h2>
            <label className="calc-chk"><input type="checkbox" checked={s.lucroReal} onChange={(e) => mudar({ lucroReal: e.target.checked })} /> Empresa no Lucro Real (PIS e COFINS da importação viram crédito)</label>
            <div className="calc-grade">
              <Num id="cIcmsI" rotulo="ICMS na importação (%)" valor={s.icmsImp} min={0} mudar={(v) => mudar({ icmsImp: Math.min(v, 95) })} />
              <Num id="cFin" rotulo="Custo financeiro / FINIMP (%)" valor={s.finimp} min={0} mudar={(v) => mudar({ finimp: v })} />
              <Num id="cIcmsV" rotulo="ICMS na venda (%)" valor={s.icmsVenda} min={0} mudar={(v) => mudar({ icmsVenda: v })} />
              <Num id="cPcV" rotulo="PIS/COFINS na venda (%)" valor={s.piscofVenda} min={0} mudar={(v) => mudar({ piscofVenda: v })} />
              <Num id="cMg" rotulo="Margem-alvo sobre a receita líquida (%)" valor={s.margem} min={0} mudar={(v) => mudar({ margem: Math.min(v, 90) })} />
            </div>
            <p className="pequeno muted calc-pe">ICMS na importação: 0% pressupõe diferimento por regime especial; sem ele, MG cobra 18%. Na venda, mercadoria importada para outro estado paga 4%; dentro de MG, 18%.</p>
          </section>
        </div>

        <aside className="calc-lado">
          <section className="pn-caixa calc-caixa">
            <h2>Resumo do embarque</h2>
            <div className="calc-sub">No exterior (US$)</div>
            <Linha k="FOB" v={USD(X.fobUSD)} />
            <Linha k="Frete internacional" v={USD(X.freteUSD)} />
            <Linha k={`Seguro internacional${s.seguroUSD > 0 ? '' : ' (estimado)'}`} v={USD(X.seguroUSD)} />
            {X.origemUSD > 0 && <Linha k="Despesas na origem" v={USD(X.origemUSD)} />}
            <Linha k="Total até o Brasil" v={USD(X.totalUSD)} forte />
            <div className="calc-sub">No Brasil (R$)</div>
            <Linha k="FOB" v={BRL(T.fob)} />
            <Linha k="Frete + seguro" v={BRL(T.frete + T.seguro)} />
            {T.origemVA + T.origemFora > 0 && <Linha k="Despesas na origem" v={BRL(T.origemVA + T.origemFora)} />}
            <Linha k={`Valor aduaneiro (CIF + capatazia${T.origemVA ? ' + origem' : ''})`} v={BRL(T.va)} />
            <Linha k="II" v={BRL(T.ii)} />
            <Linha k="IPI" v={BRL(T.ipi)} />
            <Linha k="PIS + COFINS" v={BRL(T.pis + T.cofins)} />
            <Linha k="ICMS" v={BRL(T.icms)} />
            <Linha k="AFRMM + Siscomex" v={BRL(T.afrmm + T.siscomex)} />
            <Linha k="Despesas no Brasil" v={BRL(T.desp)} />
            {Math.abs(T.varCamb) > 0.005 && <Linha k="Variação cambial" v={BRL(T.varCamb)} />}
            <Linha k="Desembolso total" v={BRL(T.desembolso)} forte />
            <Linha k="Créditos de impostos" v={`− ${BRL(T.creditos)}`} />
            <Linha k="Custo líquido" v={BRL(T.liquido)} forte />
            <Linha k="Desembolso ÷ FOB" v={`${num(R.fatorDesembolso, 3)}×`} />
            <Linha k="Custo líquido ÷ FOB" v={`${num(R.fatorLiquido, 3)}×`} />
          </section>
          <section className="pn-caixa calc-caixa">
            <h2>Por unidade</h2>
            {R.linhas.every((l) => !l) && <p className="muted">Informe ao menos um item com quantidade.</p>}
            {R.linhas.map((l, ix) => l && (
              <div className="calc-unidade" key={ix}>
                <div className="linha entre"><b>{s.itens[ix].desc || 'Item sem descrição'}</b>{l.margemMerc != null && <span className={`calc-chip ${l.margemMerc >= 0 ? 'pos' : 'neg'}`}>{PCT(l.margemMerc)}</span>}</div>
                <Linha k="Custo nacionalizado (desembolso)" v={BRL(l.desembolsoU)} />
                <Linha k="Custo líquido + FINIMP" v={BRL(l.totU)} />
                <Linha k="Preço sugerido (com IPI)" v={BRL(l.pv)} />
                {l.merc > 0 && <>
                  <Linha k="Preço de mercado" v={BRL(l.merc)} />
                  <Linha k="Margem no preço de mercado" v={<span className={l.margemMerc != null && l.margemMerc >= 0 ? 'pos' : 'neg'}>{PCT(l.margemMerc)}</span>} />
                  <Linha k="FOB máximo p/ margem-alvo" v={USD(l.fobMax ?? 0, 0)} />
                </>}
              </div>
            ))}
          </section>
          <div className="calc-acoes">
            <button className="botao largo" onClick={() => baixar(`calculo-importacao-${new Date().toISOString().slice(0, 10)}.csv`, resultadoCsv(s))}>Exportar resultado (CSV)</button>
            <button className="botao secundario largo" onClick={() => carregarModelo(s.modelo === 'vazio' || s.modelo === 'importado' ? '20' : s.modelo, true)}>Restaurar valores da planilha</button>
          </div>
          <p className="calc-nota">Base: planilha &quot;FINAL IMPORT COSTS DRONES&quot;. A lupa ao lado do NCM busca na tabela oficial da Receita (atualizada toda semana). Diferenças em relação à planilha: frete e seguro entram uma vez só no total; estadia entra no custo por item; capatazia entra no valor aduaneiro; AFRMM é % do frete; a Taxa Siscomex segue a Portaria ME 4.131/2021; o preço sugerido parte do custo líquido de créditos. Estimativa para decisão comercial: confirme com o despachante antes de fechar.</p>
        </aside>
      </div>
    </div>
  );
}
