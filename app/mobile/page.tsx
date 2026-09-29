"use client";

import Link from "next/link";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandTracker } from "@/components/HandTracker";
import type { GestureSnapshot } from "@/lib/gesture-engine";
import type { GesturePacket, HandPoint } from "@/lib/protocol";

const PREFIX = process.env.NEXT_PUBLIC_PEER_PREFIX || "gesture-control";

const actionName = (action: string) => ({
  pointer: "Movendo o ponteiro",
  click: "Clique",
  scroll: "Rolando a página",
  history_back: "Voltando",
  history_forward: "Avançando",
}[action] ?? action);

export default function MobilePage() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const lastFrameAt = useRef(0);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [lastAction, setLastAction] = useState("Nenhuma ainda");
  const [error, setError] = useState("");

  useEffect(() => () => {
    connRef.current?.close();
    peerRef.current?.destroy();
  }, []);

  const connect = useCallback(async () => {
    const clean = code.replace(/\D/g, "").slice(0, 6);
    if (clean.length !== 6) {
      setError("Digite os 6 números que aparecem no computador.");
      return;
    }

    setError("");
    setState("connecting");
    connRef.current?.close();
    peerRef.current?.destroy();

    const { default: PeerClient } = await import("peerjs");
    const peer = new PeerClient();
    peerRef.current = peer;

    peer.on("open", () => {
      const conn = peer.connect(`${PREFIX}-${clean}`, { reliable: true, serialization: "json" });
      connRef.current = conn;

      conn.on("open", () => {
        setState("connected");
        const hello: GesturePacket = { type: "hello", device: "mobile", version: 1 };
        conn.send(hello);
      });

      conn.on("close", () => setState("idle"));
      conn.on("error", () => {
        setError("Não foi possível conectar. Confira o código e tente novamente.");
        setState("error");
      });
    });

    peer.on("error", () => {
      setError("Não foi possível conectar. Confira o código e tente novamente.");
      setState("error");
    });
  }, [code]);

  const onHandFrame = useCallback((rawPoints: HandPoint[], snapshot: GestureSnapshot, at: number) => {
    const conn = connRef.current;
    if (!conn?.open) return;

    for (const command of snapshot.commands) {
      conn.send({ type: "command", command } satisfies GesturePacket);
      if (command.action !== "pointer") setLastAction(actionName(command.action));
    }

    if (at - lastFrameAt.current >= 70) {
      lastFrameAt.current = at;
      const mirrored = rawPoints.map((point) => ({
        x: Number((1 - point.x).toFixed(4)),
        y: Number(point.y.toFixed(4)),
        z: point.z == null ? undefined : Number(point.z.toFixed(4)),
      }));
      conn.send({ type: "frame", landmarks: mirrored, gesture: snapshot.gesture, at } satisfies GesturePacket);
    }
  }, []);

  const connected = state === "connected";

  return (
    <main className="shell device-page">
      <header className="topbar">
        <div>
          <Link className="back-link" href="/">← voltar</Link>
          <span className="eyebrow">NO CELULAR</span>
          <h1>Use sua mão como controle</h1>
          <p>Siga os passos abaixo. Quando estiver conectado, mantenha a mão inteira dentro da imagem da câmera.</p>
        </div>
        <span className={`status-pill ${connected ? "online" : state === "error" ? "error" : ""}`}>
          {connected ? "✓ Pronto para usar" : state === "connecting" ? "Conectando…" : "Aguardando conexão"}
        </span>
      </header>

      <section className="step-strip" aria-label="Passos no celular">
        <article className="mini-step done">
          <span>1</span>
          <div><strong>Abra o computador</strong><small>Deixe a tela do computador aberta.</small></div>
        </article>
        <article className={`mini-step ${connected ? "done" : "active"}`}>
          <span>2</span>
          <div><strong>Digite o código</strong><small>Use os 6 números mostrados no computador.</small></div>
        </article>
        <article className={`mini-step ${connected ? "active" : ""}`}>
          <span>3</span>
          <div><strong>Mostre sua mão</strong><small>O desenho deve acompanhar seus dedos.</small></div>
        </article>
      </section>

      <section className="device-grid">
        <div className="panel camera-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">SUA CÂMERA</span>
              <h2>Mantenha a mão visível</h2>
            </div>
            <span className="camera-tip">✋ mão inteira na tela</span>
          </div>
          <HandTracker onFrame={onHandFrame} />
        </div>

        <aside className="panel controls">
          <div>
            <span className="eyebrow">PASSO 2</span>
            <h2>Conecte ao computador</h2>
            <p className="small">Olhe para a tela do computador e copie o código abaixo.</p>
          </div>

          <label className="label">
            Código de 6 números
            <input
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>

          <button className="button" type="button" onClick={connect} disabled={state === "connecting"}>
            {connected ? "Conectar novamente" : state === "connecting" ? "Conectando…" : "Conectar ao computador"}
          </button>

          {error && <div className="notice warn">{error}</div>}
          {connected && <div className="notice good">✓ Conectado. Agora use os gestos abaixo.</div>}

          <div className="gesture-list">
            <div><span>☝️</span><div><strong>Apontar</strong><small>Move o ponteiro</small></div></div>
            <div><span>🤏</span><div><strong>Juntar polegar e indicador</strong><small>Faz um clique</small></div></div>
            <div><span>✋</span><div><strong>Mover para cima ou para baixo</strong><small>Rola a página</small></div></div>
            <div><span>↔️</span><div><strong>Mover a mão para os lados</strong><small>Volta ou avança</small></div></div>
          </div>

          <div className="kv"><span>Última ação</span><strong>{lastAction}</strong></div>
          <div className="privacy-note">🔒 A imagem da câmera fica somente no seu celular.</div>
        </aside>
      </section>
    </main>
  );
}
