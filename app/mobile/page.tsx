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
  pointer: "Movendo",
  click: "Clique",
  scroll: "Rolando",
  history_back: "Voltando",
  history_forward: "Avançando",
}[action] ?? action);

export default function MobilePage() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const lastFrameAt = useRef(0);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [lastAction, setLastAction] = useState("Nenhuma");
  const [error, setError] = useState("");

  useEffect(() => () => {
    connRef.current?.close();
    peerRef.current?.destroy();
  }, []);

  const connect = useCallback(async () => {
    const clean = code.replace(/\D/g, "").slice(0, 6);
    if (clean.length !== 6) {
      setError("Digite os 6 números mostrados no computador.");
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
        setError("Falha ao conectar. Confira o código.");
        setState("error");
      });
    });

    peer.on("error", () => {
      setError("Falha ao conectar. Confira o código.");
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
    <main className="screen-shell device-screen mobile-screen">
      <header className="compact-header">
        <div className="compact-heading">
          <Link className="back-link" href="/">←</Link>
          <div>
            <span className="eyebrow">CELULAR</span>
            <h1>Controle com a mão</h1>
          </div>
        </div>
        <span className={`status-pill ${connected ? "online" : state === "error" ? "error" : ""}`}>
          {connected ? "✓ Conectado" : state === "connecting" ? "Conectando…" : "Aguardando"}
        </span>
      </header>

      <div className="micro-steps" aria-label="Passos">
        <span>1. Ative a câmera</span>
        <span>2. Digite o código</span>
        <span>3. Mostre a mão</span>
      </div>

      <section className="mobile-workspace">
        <div className="panel camera-panel">
          <div className="camera-overlay-label">✋ Mantenha a mão inteira visível</div>
          <HandTracker onFrame={onHandFrame} />
        </div>

        <aside className="panel mobile-controls">
          <div className="connect-row">
            <label className="compact-code-label">
              <span>Código do computador</span>
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

            <button className="button connect-button" type="button" onClick={connect} disabled={state === "connecting"}>
              {connected ? "Reconectar" : state === "connecting" ? "Conectando…" : "Conectar"}
            </button>
          </div>

          <div className="mobile-feedback" aria-live="polite">
            {error ? <span className="feedback-error">{error}</span> : connected ? <span className="feedback-good">✓ Pronto para controlar</span> : <span>Ative a câmera e informe o código.</span>}
            <strong>{lastAction}</strong>
          </div>

          <div className="compact-gestures" aria-label="Gestos">
            <div><span>☝️</span><small>Mover</small></div>
            <div><span>🤏</span><small>Clicar</small></div>
            <div><span>↕️</span><small>Rolar</small></div>
            <div><span>↔️</span><small>Navegar</small></div>
          </div>

          <div className="privacy-line">🔒 A imagem da câmera permanece neste celular.</div>
        </aside>
      </section>
    </main>
  );
}
