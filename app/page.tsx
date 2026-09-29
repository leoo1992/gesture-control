import Link from "next/link";

const steps = [
  { n: "1", title: "Comece pelo computador", text: "Abra esta página no computador e escolha “Usar este computador”." },
  { n: "2", title: "Depois pegue o celular", text: "Abra o mesmo site no celular e escolha “Usar este celular”." },
  { n: "3", title: "Conecte os dois", text: "Digite no celular o código de 6 números que aparece no computador." },
  { n: "4", title: "Mostre sua mão", text: "Mantenha a mão inteira visível na câmera. O desenho da mão aparecerá na tela e você já poderá controlar." },
];

export default function Home() {
  return (
    <main className="shell landing">
      <section className="hero">
        <span className="eyebrow">CONTROLE POR GESTOS</span>
        <h1>Controle o navegador com a mão</h1>
        <p className="lead">
          Use a câmera do celular para mover o ponteiro, clicar e rolar páginas no computador sem encostar no mouse.
        </p>
      </section>

      <section className="panel onboarding">
        <div className="section-heading">
          <span className="eyebrow">COMO USAR</span>
          <h2>São só 4 passos</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.n}>
              <span className="step-number">{step.n}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="role-grid" aria-label="Escolha este dispositivo">
        <Link className="role-card primary-card" href="/desktop">
          <span className="device-icon" aria-hidden="true">💻</span>
          <span className="role-index">COMECE AQUI</span>
          <h2>Estou no computador</h2>
          <p>Mostre o código para conectar o celular e prepare o navegador para receber seus movimentos.</p>
          <strong>Usar este computador →</strong>
        </Link>

        <Link className="role-card" href="/mobile">
          <span className="device-icon" aria-hidden="true">📱</span>
          <span className="role-index">SEGUNDO PASSO</span>
          <h2>Estou no celular</h2>
          <p>Abra a câmera, digite o código do computador e use sua mão como controle.</p>
          <strong>Usar este celular →</strong>
        </Link>
      </section>

      <section className="panel gesture-overview">
        <div className="section-heading">
          <span className="eyebrow">GESTOS</span>
          <h2>Movimentos simples</h2>
        </div>
        <div className="gesture-grid">
          <div><span>☝️</span><strong>Apontar</strong><small>Move o ponteiro</small></div>
          <div><span>🤏</span><strong>Juntar os dedos</strong><small>Faz um clique</small></div>
          <div><span>✋</span><strong>Mover para cima/baixo</strong><small>Rola a página</small></div>
          <div><span>✋</span><strong>Mover para os lados</strong><small>Volta ou avança</small></div>
        </div>
      </section>
    </main>
  );
}
