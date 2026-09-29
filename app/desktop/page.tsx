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
  "AGUARDANDO MÃO": "Aguardando mão",
}[gesture] ?? gesture);

const actionName = (action: string) => ({
  pointer: "Movendo",
  click: "Clique",
  scroll: "Rolando",
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
  const [lastAction, setLastAction] = useState("Nenhuma");
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
      // O endereço segue visível na interface.
    }

    const opened = window.open(address, "_blank", "noopener,noreferrer");
    setExtensionsHelp(
      opened
        ? "Abertura solicitada. Se não aparecer, cole o endereço copiado na barra."
        : "O navegador bloqueou. Cole o endereço copiado na barra.",
    );
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
      if (event.data?.source === "gesture-control-extension" && event.data?.type === "ready") {
        setExtensionReady(true);
      }
    };

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "gesture-control-app", type: "probe-extension" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="screen-shell device-screen desktop-screen">
      <header className="compact-header">
        <div className="compact-heading">
          <Link className="back-link" href="/">←</Link>
          <div>
            <span className="eyebrow">COMPUTADOR</span>
            <h1>Prepare o navegador</h1>
          </div>
        </div>
        <span className={`status-pill ${connected ? "online" : ""}`}>
          {connected ? "✓ Celular conectado" : "Aguardando celular"}
        </span>
      </header>

      <div className="micro-steps desktop-steps" aria-label="Passos">
        <span className={extensionReady ? "done" : "active"}>1. Ative o complemento</span>
        <span className={extensionReady && !connected ? "active" : connected ? "done" : ""}>2. Digite o código no celular</span>
        <span className={connected ? "active" : ""}>3. Use a mão</span>
      </div>

      <section className="desktop-workspace">
        <article className="panel code-panel">
          <span className="eyebrow">CÓDIGO DO CELULAR</span>
          <h2>Digite no celular</h2>
          <div className="code" aria-label={`Código ${code}`}>{code}</div>
          <div className={`notice compact-notice ${connected ? "good" : ""}`}>
            {connected ? "✓ Celular conectado" : "Aguardando o código ser informado no celular."}
          </div>
          <div className="status-grid">
            <div><span>Movimento</span><strong>{gestureName(gesture)}</strong></div>
            <div><span>Última ação</span><strong>{lastAction}</strong></div>
          </div>
        </article>

        <article className="panel hand-panel">
          <div className="panel-heading-row">
            <div><span className="eyebrow">SUA MÃO</span><h2>Movimento recebido</h2></div>
            <span className={`mini-status ${connected ? "online" : ""}`}>{connected ? "ao vivo" : "aguardando"}</span>
          </div>
          <div className="remote-stage"><canvas ref={canvasRef} /></div>
          <div className="demo-strip">
            <span>Teste:</span>
            <div className="demo-mini">
              <button type="button">A</button>
              <button type="button">B</button>
              <span className="demo-cursor" style={{ left: `${demoCursor.x * 100}%`, top: `${demoCursor.y * 100}%` }} />
            </div>
            <strong>{demoClicks} cliques</strong>
          </div>
        </article>

        <aside className="panel browser-panel">
          <div className="panel-heading-row">
            <div>
              <span className="eyebrow">CONTROLE DO NAVEGADOR</span>
              <h2>{extensionReady ? "Pronto para usar" : "Configuração inicial"}</h2>
            </div>
            <span className={`mini-status ${extensionReady ? "online" : ""}`}>
              {extensionReady ? "ativo" : "pendente"}
            </span>
          </div>

          {extensionReady ? (
            <div className="ready-compact">
              <span>✓</span>
              <div>
                <strong>Complemento ativo</strong>
                <small>Deixe esta tela aberta e troque para a página que deseja controlar.</small>
              </div>
            </div>
          ) : (
            <>
              <div className="setup-actions compact-actions">
                <a className="button" href="/gesture-control-extension.zip" download>Baixar complemento</a>
                <button className="button secondary" type="button" onClick={openExtensionsPage}>Abrir extensões</button>
              </div>

              <ol className="install-steps compact-install">
                <li><span>1</span><div><strong>Extraia o ZIP</strong><small>Ele cria a pasta gesture-control-extension.</small></div></li>
                <li><span>2</span><div><strong>Abra extensões</strong><small>Use o botão acima ou cole chrome://extensions/.</small></div></li>
                <li><span>3</span><div><strong>Modo do desenvolvedor</strong><small>Ative no canto superior.</small></div></li>
                <li><span>4</span><div><strong>Carregar sem compactação</strong><small>Escolha a pasta extraída.</small></div></li>
                <li><span>5</span><div><strong>Recarregue esta tela</strong><small>O status mudará para ativo.</small></div></li>
              </ol>
            </>
          )}

          {extensionsHelp && <div className="notice compact-help">{extensionsHelp}</div>}

          <div className="compact-gestures desktop-gestures">
            <div><span>☝️</span><small>Mover</small></div>
            <div><span>🤏</span><small>Clicar</small></div>
            <div><span>↕️</span><small>Rolar</small></div>
            <div><span>↔️</span><small>Navegar</small></div>
          </div>
        </aside>
      </section>
    </main>
  );
}
