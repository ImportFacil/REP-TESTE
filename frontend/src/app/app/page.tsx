'use client';
import { useEffect, useState } from 'react';

/** Evento do Chrome/Android que permite oferecer a instalação com um botão. */
interface PedidoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Baixar o app: QR code, botão de instalar (Android/Chrome) e o passo a passo para iPhone. */
export default function BaixarApp() {
  const [pedido, setPedido] = useState<PedidoInstalacao | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [endereco, setEndereco] = useState('');

  useEffect(() => {
    setEndereco(location.origin);
    setInstalado(window.matchMedia('(display-mode: standalone)').matches);
    const guardar = (e: Event) => {
      e.preventDefault();
      setPedido(e as PedidoInstalacao);
    };
    window.addEventListener('beforeinstallprompt', guardar);
    window.addEventListener('appinstalled', () => setInstalado(true));
    return () => window.removeEventListener('beforeinstallprompt', guardar);
  }, []);

  const instalar = async () => {
    if (!pedido) return;
    await pedido.prompt();
    if ((await pedido.userChoice).outcome === 'accepted') setInstalado(true);
    setPedido(null);
  };

  return (
    <div className="entrar" style={{ alignItems: 'start' }}>
      <div style={{ maxWidth: 920, width: '100%', display: 'grid', gap: 16 }}>
        <div className="linha" style={{ gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/globo-192.png" alt="" width={60} height={60} style={{ borderRadius: 14, border: '1px solid var(--borda)' }} />
          <div>
            <h1 style={{ margin: 0 }}>App ImportFácil no celular</h1>
            <p className="sub" style={{ margin: '4px 0 0' }}>A loja, o Financeiro, a importação e o Painel da equipe, com o ícone do globo na tela inicial.</p>
          </div>
        </div>

        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
          <div className="cartao pilha" style={{ textAlign: 'center', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qr-app.png" alt="QR code para baixar o app" width={240} height={240} style={{ maxWidth: '100%', height: 'auto', background: '#fff', borderRadius: 10, padding: 6 }} />
            <b>Aponte a câmera do celular para o QR code</b>
            <span className="pequeno muted">importfacil.github.io/REP-TESTE/app</span>
            {instalado ? (
              <span className="etiqueta verde">App instalado neste aparelho</span>
            ) : pedido ? (
              <button className="botao" onClick={() => void instalar()}>Instalar o app agora</button>
            ) : null}
          </div>

          <div className="cartao pilha">
            <h2 style={{ margin: 0 }}>Android (Chrome)</h2>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Abra o QR code ou este endereço no Chrome.</li>
              <li>Toque em <b>Instalar app</b> (ou no menu ⋮ → <b>Adicionar à tela inicial</b>).</li>
            </ol>
            <h2 style={{ margin: '8px 0 0' }}>iPhone (Safari)</h2>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Abra o QR code ou este endereço no Safari.</li>
              <li>Toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</li>
            </ol>
            <p className="pequeno muted" style={{ margin: 0 }}>Endereço desta loja: {endereco}</p>
            <a className="botao secundario" href="/entrar/">Entrar na loja ou no Painel</a>
          </div>
        </div>
      </div>
    </div>
  );
}
