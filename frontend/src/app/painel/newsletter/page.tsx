'use client';
import { useState } from 'react';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Aviso, Campo, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Inscrito { id: number; email: string; nome: string | null; origem: string; ativo: boolean; inscrito_em: string; cancelado_em: string | null; razao_social: string | null }

const ORIGEM: Record<string, string> = { loja: 'Rodapé da loja', painel: 'Incluído pela equipe', cadastro: 'Cadastro da empresa' };

const COLUNAS: Coluna<Inscrito>[] = [
  { chave: 'email', titulo: 'E-mail', ordenavel: true, render: (i) => <><b>{i.email}</b>{i.nome && <div className="pequeno muted">{i.nome}</div>}</> },
  { chave: 'nome', titulo: 'Nome', oculta: true },
  { chave: 'razao_social', titulo: 'Empresa', filtro: 'opcoes', render: (i) => i.razao_social ?? <span className="muted">—</span> },
  { chave: 'origem', titulo: 'Origem', filtro: 'opcoes', opcoes: ORIGEM, render: (i) => ORIGEM[i.origem] ?? i.origem, valorCsv: (i) => ORIGEM[i.origem] ?? i.origem },
  { chave: 'inscrito_em', titulo: 'Inscrição', ordenavel: true, filtro: 'data', render: (i) => dataHora(i.inscrito_em) },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Inscrito', false: 'Saiu da lista' }, valor: (i) => String(i.ativo),
    render: (i) => (i.ativo ? <Situacao valor="inscrito" nomes={{ inscrito: 'Inscrito' }} /> : <><Situacao valor="saiu" nomes={{ saiu: 'Saiu da lista' }} /><div className="pequeno muted">{dataHora(i.cancelado_em)}</div></>),
    valorCsv: (i) => (i.ativo ? 'Inscrito' : 'Saiu') },
];

/** Marketing → Newsletter (como no Bagisto): quem se inscreveu no rodapé da loja, com exportação da lista. */
export default function Newsletter() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Inscrito[]>('/equipe/marketing/newsletter');
  const [novo, setNovo] = useState<{ email: string; nome: string } | null>(null);
  const acao = useAcao();
  const incluir = () => novo && acao.executar(async () => {
    await api('/equipe/marketing/newsletter', { corpo: { email: novo.email, nome: novo.nome || undefined } });
    await recarregar();
    setNovo(null);
  }, 'E-mail incluído na lista');
  const emLote = async (linhas: Inscrito[], ativo: boolean) => {
    for (const i of linhas) await api(`/equipe/marketing/newsletter/${i.id}`, { metodo: 'PATCH', corpo: { ativo } });
    await recarregar();
  };
  const ativos = dados?.filter((i) => i.ativo).length ?? 0;
  return (
    <Grade
      titulo="Newsletter"
      sub={dados ? `${ativos} inscrito(s) ativo(s) de ${dados.length}. Use Exportar para levar a lista à ferramenta de envio.` : ' '}
      acoes={pode && <button className="botao" onClick={() => setNovo({ email: '', nome: '' })}><Icone nome="mais" tamanho={16} /> Incluir e-mail</button>}
      topo={<>
        <Aviso tipo="ok">{acao.ok}</Aviso>
        {novo && (
          <form className="pn-caixa formulario" style={{ padding: 18, marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); void incluir(); }}>
            <h2 style={{ margin: 0 }}>Incluir na lista</h2>
            <div className="grade grade-2">
              <Campo rotulo="E-mail"><input type="email" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></Campo>
              <Campo rotulo="Nome (opcional)"><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Campo>
            </div>
            <p className="pequeno muted" style={{ margin: 0 }}>Inclua só quem pediu para receber (LGPD). A pessoa recebe as boas-vindas com o link para sair.</p>
            <Aviso tipo="erro">{acao.erro}</Aviso>
            <div className="linha"><button className="botao" disabled={acao.enviando}>Incluir</button><button type="button" className="botao leve" onClick={() => setNovo(null)}>Cancelar</button></div>
          </form>
        )}
      </>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(i) => i.id}
      ordemInicial={{ chave: 'inscrito_em', dir: 'desc' }}
      nomeArquivo="newsletter"
      vazio="Ninguém inscrito ainda."
      acoesLote={pode ? [
        { rotulo: 'Tirar da lista', confirmar: 'Tirar {n} e-mail(s) da lista?', executar: (l) => emLote(l, false) },
        { rotulo: 'Voltar à lista', executar: (l) => emLote(l, true) },
      ] : undefined}
    />
  );
}
