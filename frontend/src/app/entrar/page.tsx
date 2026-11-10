'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Carregando } from '@/components/ui';
import { entrarCognito, entrarDev, type Origem } from '@/lib/auth';
import { carregarConfig, type ConfigSite } from '@/lib/config';

const DEMO = [
  { email: 'compras@coop-demo.com.br', nome: 'Cooperativa Agro Sorriso', origem: 'cliente' },
  { email: 'compras@distribuidora-demo.com.br', nome: 'Distribuidora Central', origem: 'cliente' },
  { email: 'compras@revenda-demo.com.br', nome: 'Revenda Ferramentas', origem: 'cliente' },
  { email: 'compras@construtora-demo.com.br', nome: 'Construtora Horizonte', origem: 'cliente' },
  { email: 'compras@hospital-demo.com.br', nome: 'Hospital Santa Clara', origem: 'cliente' },
  { email: 'admin@importfacil.dev', nome: 'Equipe ImportFácil (administrador)', origem: 'equipe' },
] as const;

export default function Entrar() {
  const router = useRouter();
  const [config, setConfig] = useState<ConfigSite | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [origem, setOrigem] = useState<Origem>('cliente');

  useEffect(() => {
    carregarConfig().then(setConfig).catch((e) => setErro(e.message));
  }, []);

  const dev = async (e: string, o: Origem) => {
    try {
      await entrarDev(e, o);
      router.replace(o === 'equipe' ? '/painel/' : '/loja/');
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  if (!config && !erro) return <Carregando />;
  return (
    <div className="entrar">
      <div className="cartao pilha">
        <div className="marca" style={{ padding: 0 }}>
          <div className="marca-icone">IF</div>
          <div>
            <b>ImportFácil</b>
            <span>Loja B2B e importação</span>
          </div>
        </div>
        <Aviso tipo="erro">{erro}</Aviso>
        {config?.auth === 'cognito' && (
          <>
            <button className="botao largo" onClick={() => void entrarCognito('cliente')}>Entrar como cliente</button>
            <button className="botao secundario largo" onClick={() => void entrarCognito('equipe')}>Sou da equipe ImportFácil</button>
            <p className="pequeno muted">O acesso é criado pela equipe ImportFácil, que envia o convite por e-mail. No primeiro acesso, troque a senha temporária.</p>
          </>
        )}
        {config?.auth === 'dev' && (
          <>
            <Aviso tipo="atencao">Ambiente de desenvolvimento: entre com um usuário de demonstração, sem senha.</Aviso>
            {DEMO.map((d) => (
              <button key={d.email} className="botao secundario largo" style={{ justifyContent: 'flex-start' }} onClick={() => void dev(d.email, d.origem)}>
                {d.origem === 'equipe' ? '🛠️' : '🏢'} {d.nome}
              </button>
            ))}
            <form className="linha" onSubmit={(e) => { e.preventDefault(); void dev(email, origem); }}>
              <input type="email" placeholder="outro e-mail cadastrado" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} required />
              <select value={origem} onChange={(e) => setOrigem(e.target.value as Origem)} style={{ width: 'auto' }}>
                <option value="cliente">cliente</option>
                <option value="equipe">equipe</option>
              </select>
              <button className="botao">Entrar</button>
            </form>
          </>
        )}
        <p className="pequeno muted" style={{ margin: 0 }}><Link href="/pagina/">Sobre a ImportFácil, entrega, pagamentos e privacidade</Link></p>
      </div>
    </div>
  );
}
