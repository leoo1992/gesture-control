import Link from "next/link";

const steps = [
  ["1", "No computador", "Abra o modo computador."],
  ["2", "No celular", "Abra o mesmo site."],
  ["3", "Conecte", "Digite o código de 6 números."],
  ["4", "Controle", "Mostre a mão para a câmera."],
];

export default function Home() {
  return (
    <main className="screen-shell home-screen">
      <header className="home-header">
        <div>
          <span className="eyebrow">CONTROLE POR GESTOS</span>
          <h1>Controle o navegador com a mão</h1>
        </div>
        <p className="lead">
          Use a câmera do celular como controle do navegador no computador.
        </p>
      </header>

      <section className="home-grid" aria-label="Escolha este dispositivo">
        <Link className="role-card primary-card" href="/desktop">
          <span className="device-icon" aria-hidden="true">💻</span>
          <span className="role-index">COMECE AQUI</span>
          <h2>Estou no computador</h2>
          <p>Mostre o código e prepare o navegador.</p>
          <strong>Usar este computador →</strong>
        </Link>

        <Link className="role-card" href="/mobile">
          <span className="device-icon" aria-hidden="true">📱</span>
          <span className="role-index">DEPOIS NO CELULAR</span>
          <h2>Estou no celular</h2>
          <p>Ative a câmera, digite o código e controle.</p>
          <strong>Usar este celular →</strong>
        </Link>

        <section className="panel quick-start">
          <div className="quick-title">
            <span className="eyebrow">COMO USAR</span>
            <strong>4 passos rápidos</strong>
          </div>
          <div className="quick-steps">
            {steps.map(([n, title, text]) => (
              <article key={n}>
                <span>{n}</span>
                <div><strong>{title}</strong><small>{text}</small></div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <footer className="gesture-bar" aria-label="Gestos disponíveis">
        <div><span>☝️</span><strong>Apontar</strong><small>mover</small></div>
        <div><span>🤏</span><strong>Pinça</strong><small>clicar</small></div>
        <div><span>↕️</span><strong>Mão aberta</strong><small>rolar</small></div>
        <div><span>↔️</span><strong>Mão aberta</strong><small>voltar/avançar</small></div>
      </footer>
    </main>
  );
}
