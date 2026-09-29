"use client";

import Link from "next/link";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandTracker } from "@/components/HandTracker";
import type { GestureSnapshot } from "@/lib/gesture-engine";
import type { GesturePacket, HandPoint } from "@/lib/protocol";

const PREFIX = process.env.NEXT_PUBLIC_PEER_PREFIX || "gesture-control";

export default function MobilePage() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const lastFrameAt = useRef(0);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [lastAction, setLastAction] = useState("—");
  const [error, setError] = useState("");

  useEffect(() => () => {
    connRef.current?.close();
    peerRef.current?.destroy();
  }, []);

  const connect = useCallback(async () => {
    const clean = code.replace(/\D/g, "").slice(0, 6);
    if (clean.length !== 6) {
      setError("Digite o código de 6 dígitos exibido no PC.");
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
      conn.on("error", (event) => {
        setError(String(event));
        setState("error");
      });
    });
    peer.on("error", (event) => {
      setError(event.message || "Falha no pareamento WebRTC.");
      setState("error");
    });
  }, [code]);

  const onHandFrame = useCallback((rawPoints: HandPoint[], snapshot: GestureSnapshot, at: number) => {
    const conn = connRef.current;
    if (!conn?.open) return;

    for (const command of snapshot.commands) {
      conn.send({ type: "command", command } satisfies GesturePacket);
      if (command.action !== "pointer") setLastAction(command.action);
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

  return (
    <main className="shell device-page">
      <header className="topbar">
        <div>
          <Link className="back-link" href="/">← início</Link>
          <h1>Celular controlador</h1>
          <p>A câmera e a inferência ficam neste aparelho. O PC recebe somente landmarks e comandos de gesto.</p>
        </div>
        <span className={`status-pill ${state === "connected" ? "online" : state === "error" ? "error" : ""}`}>
          {state === "connected" ? "● CONECTADO" : state === "connecting" ? "CONECTANDO…" : "○ DESCONECTADO"}
        </span>
      </header>

      <section className="device-grid">
        <div className="panel"><HandTracker onFrame={onHandFrame} /></div>
        <aside className="panel controls">
          <label className="label">
            Código exibido no PC
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <button className="button" type="button" onClick={connect} disabled={state === "connecting"}>
            {state === "connected" ? "Reconectar" : "Conectar ao PC"}
          </button>
          {error && <div className="notice warn">{error}</div>}
          <div className="kv"><span>Última ação</span><strong>{lastAction}</strong></div>
          <div className="notice good">O vídeo não é transmitido. Apenas 21 pontos normalizados e eventos de controle seguem pelo canal P2P.</div>
          <ol className="instructions">
            <li><strong>Indicador:</strong> move o cursor.</li>
            <li><strong>Pinça:</strong> clique.</li>
            <li><strong>Mão aberta + vertical:</strong> scroll.</li>
            <li><strong>Mão aberta + swipe lateral:</strong> voltar/avançar.</li>
          </ol>
        </aside>
      </section>
    </main>
  );
}
