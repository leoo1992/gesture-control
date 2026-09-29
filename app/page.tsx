import Link from "next/link";

export default function Home() {
  return (
    <main className="shell landing">
      <section className="hero">
        <span className="eyebrow">VISÃO COMPUTACIONAL · WEBRTC · MEDIAPIPE</span>
        <h1>Gesture Control</h1>
        <p className="lead">
          Use a câmera do celular para rastrear sua mão, visualizar os 21 landmarks em tempo real e controlar o navegador do PC sem tocar no mouse.
        </p>
      </section>

      <section className="role-grid" aria-label="Escolha o papel deste dispositivo">
        <Link className="role-card" href="/mobile">
          <span className="role-index">01</span>
          <h2>Celular controlador</h2>
          <p>Abre a câmera frontal, desenha o esqueleto da mão e envia gestos para o PC.</p>
          <strong>Abrir controlador →</strong>
        </Link>
        <Link className="role-card" href="/desktop">
          <span className="role-index">02</span>
          <h2>PC receptor</h2>
          <p>Gera o código de pareamento, recebe os landmarks e repassa comandos para a extensão.</p>
          <strong>Abrir receptor →</strong>
        </Link>
      </section>

      <section className="flow-card">
        <div>📱 câmera</div><span>→</span><div>21 landmarks</div><span>→</span><div>WebRTC</div><span>→</span><div>💻 extensão</div><span>→</span><div>navegador</div>
      </section>
    </main>
  );
}
