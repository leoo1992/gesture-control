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

export default function DesktopPage() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState("------");
  const [connected, setConnected] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [lastAction, setLastAction] = useState("—");
  const [gesture, setGesture] = useState("AGUARDANDO MÃO");
  const [demoCursor, setDemoCursor] = useState({ x: 0.5, y: 0.5 });
  const [demoClicks, setDemoClicks] = useState(0);

  const relayCommand = useCallback((command: GestureCommand) => {
    if (command.action === "pointer") setDemoCursor({ x: command.x, y: command.y });
    if (command.action === "click") setDemoClicks((value) => value + 1);
    if (command.action !== "pointer") setLastAction(command.action);
    window.postMessage({ source: "gesture-control-app", type: "gesture-command", command }, "*");
  }, []);

  const relayFrame = useCallback((frame: GestureFrame) => {
    setGesture(frame.gesture);
    if (canvasRef.current) drawHand(canvasRef.current, frame.landmarks);
    window.postMessage({ source: "gesture-control-app", type: "gesture-frame", frame }, "*");
  }, []);

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
          <Link className="back-link" href="/">← início</Link>
          <h1>PC receptor</h1>
          <p>Abra esta tela no computador, digite o código no celular e depois deixe esta aba aberta enquanto navega em outras páginas.</p>
        </div>
        <span className={`status-pill ${connected ? "online" : ""}`}>{connected ? "● CELULAR CONECTADO" : "○ AGUARDANDO CELULAR"}</span>
      </header>

      <section className="device-grid">
        <div className="panel">
          <span className="eyebrow">CÓDIGO DE PAREAMENTO</span>
          <div className="code" aria-label={`Código ${code}`}>{code}</div>
          <p className="small">O código muda quando a sessão é recriada. Não é senha de conta e não é persistido.</p>
          <div className={`notice ${extensionReady ? "good" : "warn"}`}>
            {extensionReady
              ? "Extensão detectada. Os comandos podem ser encaminhados para a aba ativa do navegador."
              : "Extensão não detectada. O pareamento e o modo de demonstração funcionam, mas o controle de outras abas exige carregar extension/ como extensão não compactada."}
          </div>
          <div className="kv"><span>Gesto atual</span><strong>{gesture}</strong></div>
          <div className="kv"><span>Última ação</span><strong>{lastAction}</strong></div>
        </div>

        <div className="panel">
          <h2>Esqueleto recebido</h2>
          <div className="remote-stage"><canvas ref={canvasRef} /></div>
          <p className="small">Somente os landmarks são recebidos; a imagem da câmera permanece no celular.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Área de teste sem extensão</h2>
        <p className="small">O cursor abaixo responde ao indicador mesmo antes de instalar a extensão. Cada pinça incrementa o contador.</p>
        <div className="demo-area">
          <button className="demo-button one" type="button">Elemento A</button>
          <button className="demo-button two" type="button">Elemento B</button>
          <span className="demo-cursor" style={{ left: `${demoCursor.x * 100}%`, top: `${demoCursor.y * 100}%` }} />
        </div>
        <div className="kv"><span>Cliques reconhecidos</span><strong>{demoClicks}</strong></div>
      </section>
    </main>
  );
}
