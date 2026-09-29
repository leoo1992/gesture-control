"use client";

import Link from "next/link";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { drawHand } from "@/lib/hand-drawing";
import { isGesturePacket, type GestureCommand, type GestureFrame } from "@/lib/protocol";

const PREFIX = process.env.NEXT_PUBLIC_PEER_PREFIX || "gesture-control";

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const gestureName = (gesture: string) => ({
  POINTER: "Apontando",
  PINCH: "Clique",
  OPEN_PALM: "Mão aberta",
  "AGUARDANDO MÃO": "Aguardando sua mão",
}[gesture] ?? gesture);

const actionName = (action: string) => ({
  pointer: "Movendo o ponteiro",
  click: "Clique",
  scroll: "Rolando a página",
  history_back: "Voltando",
  history_forward: "Avançando",
}[action] ?? action);

export default function DesktopPage() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState("------");
  const [connected, setConnected] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [extensionsHelp, setExtensionsHelp] = useState("");
  const [lastAction, setLastAction] = useState("Nenhuma ainda");
  const [gesture, setGesture] = useState("AGUARDANDO MÃO");
  const [demoCursor, setDemoCursor] = useState({ x: 0.5, y: 0.5 });
  const [demoClicks, setDemoClicks] = useState(0);

  const relayCommand = useCallback((command: GestureCommand) => {
    if (command.action === "pointer") setDemoCursor({ x: command.x, y: command.y });
    if (command.action === "click") setDemoClicks((value) => value + 1);
    if (command.action !== "pointer") setLastAction(actionName(command.action));
    window.postMessage({ source: "gesture-control-app", type: "gesture-command", command }, "*");
  }, []);

  const relayFrame = useCallback((frame: GestureFrame) => {
    setGesture(frame.gesture);
    if (canvasRef.current) drawHand(canvasRef.current, frame.landmarks);
    window.postMessage({ source: "gesture-control-app", type: "gesture-frame", frame }, "*");
  }, []);

  const openExtensionsPage = async () => {
    const address = navigator.userAgent.includes("Edg/") ? "edge://extensions/" : "chrome://extensions/";

    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // O endereço continua visível na instrução mesmo quando a área de transferência não está disponível.
    }

    const opened = window.open(address, "_blank", "noopener,noreferrer");
    if (opened) {
      setExtensionsHelp("A tela de extensões foi solicitada em outra aba. Se ela não abrir, cole o endereço copiado na barra do navegador.");
    } else {
      setExtensionsHelp("O navegador bloqueou a abertura automática. O endereço foi copiado: cole-o na barra do navegador.");
    }
  };

  useEffect(() => {
    let disposed = false;
    let peer: Peer | null = null;

    const createReceiver = async () => {
      if (disposed) return;
      const { default: PeerClient } = await import("peerjs");
      if (disposed) return;

      const nextCode = randomCode();
      setCode(nextCode);
      peer = new PeerClient(`${PREFIX}-${nextCode}`);
      peerRef.current = peer;

      peer.on("connection", (conn) => {
        connRef.current?.close();
        connRef.current = conn;
        conn.on("open", () => setConnected(true));
        conn.on("close", () => setConnected(false));
        conn.on("data", (data) => {
          if (!isGesturePacket(data)) return;
          if (data.type === "command") relayCommand(data.command);
          if (data.type === "frame") relayFrame(data);
        });
      });

      peer.on("error", (event) => {
        if (event.type === "unavailable-id") {
          peer?.destroy();
          void createReceiver();
        }
      });
    };

    void createReceiver();
    return () => {
      disposed = true;
      connRef.current?.close();
      peer?.destroy();
    };
  }, [relayCommand, relayFrame]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.source === "gesture-control-extension" && event.data?.type === "ready") setExtensionReady(true);
    };

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "gesture-control-app", type: "probe-extension" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="shell device-page">
      <header className="topbar">
        <div>
          <Link className="back-link" href="/">← voltar</Link>
          <span className="eyebrow">NO COMPUTADOR</span>
          <h1>Prepare o computador</h1>
          <p>Deixe esta página aberta, conecte o celular pelo código e depois use sua mão para controlar outras páginas.</p>
        </div>
        <span className={`status-pill ${connected ? "online" : ""}`}>
          {connected ? "✓ Celular conectado" : "Aguardando o celular"}
        </span>
      </header>

      <section className="step-strip" aria-label="Passos no computador">
        <article className="mini-step done">
          <span>1</span>
          <div><strong>Abra esta tela</strong><small>Não feche esta página.</small></div>
        </article>
        <article className={`mini-step ${extensionReady ? "done" : "active"}`}>
          <span>2</span>
          <div><strong>Ative o controle do navegador</strong><small>Faça isso apenas na primeira vez.</small></div>
        </article>
        <article className={`mini-step ${connected ? "done" : extensionReady ? "active" : ""}`}>
          <span>3</span>
          <div><strong>Conecte o celular</strong><small>Digite no celular o código desta tela.</small></div>
        </article>
        <article className={`mini-step ${connected ? "active" : ""}`}>
          <span>4</span>
          <div><strong>Comece a controlar</strong><small>Troque de aba e use sua mão.</small></div>
        </article>
      </section>

      <section className="device-grid">
        <div className="panel connect-card">
          <span className="eyebrow">PASSO 3 · CÓDIGO DO CELULAR</span>
          <h2>Digite estes números no celular</h2>
          <div className="code" aria-label={`Código ${code}`}>{code}</div>
          <p className="small">Abra este mesmo site no celular, toque em “Estou no celular” e digite o código acima.</p>

          <div className={`notice ${connected ? "good" : ""}`}>
            {connected ? "✓ Tudo certo. O celular está conectado." : "Quando o celular conectar, esta mensagem mudará automaticamente."}
          </div>

          <div className="kv"><span>Movimento reconhecido</span><strong>{gestureName(gesture)}</strong></div>
          <div className="kv"><span>Última ação</span><strong>{lastAction}</strong></div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">SUA MÃO</span>
              <h2>Veja o movimento chegando</h2>
            </div>
          </div>
          <div className="remote-stage"><canvas ref={canvasRef} /></div>
          <p className="small">O computador recebe apenas o desenho dos movimentos. A imagem da câmera continua no celular.</p>
        </div>
      </section>

      {!extensionReady && (
        <section className="panel setup-card">
          <div className="setup-copy">
            <span className="eyebrow">CONFIGURAÇÃO INICIAL · UMA ÚNICA VEZ</span>
            <h2>Ative o controle em outras páginas</h2>
            <p>Para controlar outros sites, instale o complemento do Gesture Control no Chrome ou Edge.</p>
            <div className="setup-actions">
              <a className="button download-button" href="/gesture-control-extension.zip" download>
                1. Baixar complemento
              </a>
              <button className="button secondary" type="button" onClick={openExtensionsPage}>
                2. Abrir extensões do navegador
              </button>
            </div>
            {extensionsHelp && <div className="notice">{extensionsHelp}</div>}
          </div>

          <ol className="install-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Baixe e extraia o arquivo</strong>
                <small>Agora o ZIP cria a pasta <b>gesture-control-extension</b>. É essa pasta que você deve selecionar.</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Abra a tela de extensões</strong>
                <small>Use o botão ao lado. Se o navegador bloquear, cole <code>chrome://extensions/</code> na barra de endereço.</small>
              </div>
            </li>
            <li><span>3</span><div><strong>Ative “Modo do desenvolvedor”</strong><small>Use o botão no canto superior da tela.</small></div></li>
            <li><span>4</span><div><strong>Clique em “Carregar sem compactação”</strong><small>Escolha a pasta <b>gesture-control-extension</b> criada ao extrair o ZIP.</small></div></li>
            <li><span>5</span><div><strong>Volte aqui e recarregue a página</strong><small>Esta área desaparecerá quando estiver pronto.</small></div></li>
          </ol>
        </section>
      )}

      {extensionReady && (
        <section className="panel ready-card">
          <span className="ready-icon">✓</span>
          <div>
            <span className="eyebrow">CONTROLE DO NAVEGADOR ATIVO</span>
            <h2>Pronto para usar em outras páginas</h2>
            <p>Deixe esta página aberta. Depois troque para a página que deseja controlar e use os gestos com a mão.</p>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <span className="eyebrow">TESTE AQUI</span>
          <h2>Confirme que seus movimentos estão funcionando</h2>
          <p className="small">Mova o indicador para deslocar o ponto azul. Junte o polegar e o indicador para registrar um clique.</p>
        </div>
        <div className="demo-area">
          <button className="demo-button one" type="button">Botão 1</button>
          <button className="demo-button two" type="button">Botão 2</button>
          <span className="demo-cursor" style={{ left: `${demoCursor.x * 100}%`, top: `${demoCursor.y * 100}%` }} />
        </div>
        <div className="kv"><span>Cliques reconhecidos</span><strong>{demoClicks}</strong></div>
      </section>
    </main>
  );
}
