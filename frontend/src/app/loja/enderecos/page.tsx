'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando, Situacao, Vazio } from '@/components/ui';
import { api } from '@/lib/api';
import { enderecoEmLinha as linhaEndereco } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Endereco { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string }
interface Salvo { id: number; apelido: string; endereco: Endereco; padrao: boolean }
const VAZIO: Endereco = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };

/** Endereços de entrega da empresa (no Bagisto, "Endereços"): o padrão vai em cada pedido, a menos que se escolha outro no carrinho. */
export default function Enderecos() {
  const { eu } = useEu();
  const aprovador = eu.usuario.papel === 'aprovador';
  const { dados, erro, recarregar } = useDados<Salvo[]>('/loja/enderecos');
  const [f, setF] = useState<{ id: number | null; apelido: string; endereco: Endereco; padrao: boolean } | null>(null);
  const acao = useAcao();
  const salvar = () => f && acao.executar(async () => {
    const corpo = { apelido: f.apelido, endereco: { ...f.endereco, complemento: f.endereco.complemento || undefined }, padrao: f.padrao };
    if (f.id === null) await api('/loja/enderecos', { corpo });
    else await api(`/loja/enderecos/${f.id}`, { metodo: 'PATCH', corpo });
    await recarregar();
    setF(null);
  }, 'Endereço salvo');
  const alterar = (id: number, corpo: Record<string, unknown>) => acao.executar(async () => { await api(`/loja/enderecos/${id}`, { metodo: 'PATCH', corpo }); await recarregar(); });
  const e = f?.endereco;
  const muda = (m: Partial<Endereco>) => f && setF({ ...f, endereco: { ...f.endereco, ...m } });
  return (
    <>
      <Cabecalho titulo="Endereços de entrega" sub="Os endereços da empresa. O padrão vai em cada pedido; no carrinho dá para escolher outro.">
        {aprovador && !f && <button className="botao" onClick={() => setF({ id: null, apelido: '', endereco: { ...VAZIO }, padrao: !dados?.length })}>Novo endereço</button>}
      </Cabecalho>
      {!aprovador && <Aviso tipo="info">Só o aprovador da empresa cadastra e altera endereços.</Aviso>}
      <Aviso tipo="erro">{erro ?? acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      {f && e && (
        <form className="cartao formulario" style={{ marginBottom: 16 }} onSubmit={(ev) => { ev.preventDefault(); void salvar(); }}>
          <h2 style={{ margin: 0 }}>{f.id === null ? 'Novo endereço' : `Editar: ${f.apelido}`}</h2>
          <div className="grade grade-3">
            <Campo rotulo="Apelido" dica="Ex.: Matriz, Armazém 2"><input value={f.apelido} onChange={(x) => setF({ ...f, apelido: x.target.value })} required minLength={2} maxLength={60} /></Campo>
            <Campo rotulo="CEP"><input inputMode="numeric" value={e.cep} onChange={(x) => muda({ cep: x.target.value })} required pattern="\d{5}-?\d{3}" /></Campo>
            <Campo rotulo="UF"><input value={e.uf} onChange={(x) => muda({ uf: x.target.value.toUpperCase() })} required maxLength={2} pattern="[A-Za-z]{2}" /></Campo>
            <Campo rotulo="Logradouro"><input value={e.logradouro} onChange={(x) => muda({ logradouro: x.target.value })} required /></Campo>
            <Campo rotulo="Número"><input value={e.numero} onChange={(x) => muda({ numero: x.target.value })} required maxLength={20} /></Campo>
            <Campo rotulo="Complemento"><input value={e.complemento ?? ''} onChange={(x) => muda({ complemento: x.target.value })} maxLength={100} /></Campo>
            <Campo rotulo="Bairro"><input value={e.bairro} onChange={(x) => muda({ bairro: x.target.value })} required /></Campo>
            <Campo rotulo="Cidade"><input value={e.cidade} onChange={(x) => muda({ cidade: x.target.value })} required /></Campo>
          </div>
          <label className="linha"><input type="checkbox" style={{ width: 'auto' }} checked={f.padrao} onChange={(x) => setF({ ...f, padrao: x.target.checked })} /> Endereço padrão</label>
          <div className="linha"><button className="botao" disabled={acao.enviando}>Salvar</button><button type="button" className="botao leve" onClick={() => setF(null)}>Cancelar</button></div>
        </form>
      )}
      {!dados ? <Carregando /> : !dados.length ? <Vazio>Nenhum endereço cadastrado. Sem endereço, a Export Fácil combina a entrega com a empresa.</Vazio> : (
        <div className="grade grade-2">
          {dados.map((d) => (
            <div key={d.id} className="cartao pilha" style={{ gap: 8 }}>
              <div className="linha entre"><b>{d.apelido}</b>{d.padrao && <Situacao valor="ativa" nomes={{ ativa: 'Padrão' }} />}</div>
              <span className="pequeno">{linhaEndereco(d.endereco)}</span>
              {aprovador && (
                <div className="linha" style={{ gap: 6 }}>
                  <button className="botao leve pequeno" onClick={() => setF({ id: d.id, apelido: d.apelido, endereco: { ...VAZIO, ...d.endereco }, padrao: d.padrao })}>Editar</button>
                  {!d.padrao && <button className="botao leve pequeno" onClick={() => void alterar(d.id, { padrao: true })}>Tornar padrão</button>}
                  {!d.padrao && <button className="botao leve pequeno" onClick={() => void alterar(d.id, { ativo: false })}>Tirar</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
