"use client";

import Link from "next/link";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { drawHand } from "@/lib/hand-drawing";
import {
  isGesturePacket,
  type GestureCommand,
  type GestureFrame,
} from "@/lib/protocol";

const PREFIX = process.env.NEXT_PUBLIC_PEER_PREFIX || "gesture-control";
const WINDOWS_DOWNLOAD =
  "https://github.com/leoo1992/gesture-control/releases/download/windows-latest/GestureControl.Windows.exe";

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const gestureName = (gesture: string) =>
  ({
    POINTER: "Apontando",
    PINCH: "Clique",
    OPEN_PALM: "Mão aberta",
    "AGUARDANDO MÃO": "Aguardando mão",
  })[gesture] ?? gesture;

const actionName = (action: string) =>
  ({
    pointer: "Movendo",
    click: "Clique",
    scroll: "Rolando",
    history_back: "Voltando",
    history_forward: "Avançando",
  })[action] ?? action;

export default function DesktopPage() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [code, setCode] = useState("------");
  const [connected, setConnected] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [windowsReady, setWindowsReady] = useState(false);
  const [windowsEnabled, setWindowsEnabled] = useState(true);
  const [extensionsHelp, setExtensionsHelp] = useState("");
  const [lastAction, setLastAction] = useState("Nenhuma");
  const [gesture, setGesture] = useState("AGUARDANDO MÃO");
  const [demoCursor, setDemoCursor] = useState({ x: 0.5, y: 0.5 });
  const [demoClicks, setDemoClicks] = useState(0);

  const relayCommand = useCallback((command: GestureCommand) => {
    if (command.action === "pointer") {
      setDemoCursor({ x: command.x, y: command.y });
    }

    if (command.action === "click") {
      setDemoClicks((value) => value + 1);
    }

    if (command.action !== "pointer") {
      setLastAction(actionName(command.action));
    }

    window.postMessage(
      {
        source: "gesture-control-app",
        type: "gesture-command",
        command,
      },
      "*",
    );
  }, []);

  const relayFrame = useCallback((frame: GestureFrame) => {
    setGesture(frame.gesture);

    if (canvasRef.current) {
      drawHand(canvasRef.current, frame.landmarks, {
        lineColor: "#00ff3b",
        pointColor: "#ff2525",
      });
    }

    window.postMessage(
      {
        source: "gesture-control-app",
        type: "gesture-frame",
        frame,
      },
      "*",
    );
  }, []);

  const openExtensionsPage = async () => {
    const address = navigator.userAgent.includes("Edg/")
      ? "edge://extensions/"
      : "chrome://extensions/";

    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // O endereço segue visível na interface.
    }

    const opened = window.open(
      address,
      "_blank",
      "noopener,noreferrer",
    );

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

          if (data.type === "command") {
            relayCommand(data.command);
          }

          if (data.type === "frame") {
            relayFrame(data);
          }
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
      if (
        event.source !== window ||
        event.data?.source !== "gesture-control-extension"
      ) {
        return;
      }

      if (event.data?.type === "ready") {
        setExtensionReady(true);
      }

      if (event.data?.type === "windows-agent-status") {
        setWindowsReady(Boolean(event.data.ready));
        setWindowsEnabled(event.data.enabled !== false);
      }
    };

    window.addEventListener("message", onMessage);

    const probe = () => {
      window.postMessage(
        {
          source: "gesture-control-app",
          type: "probe-extension",
        },
        "*",
      );
    };

    probe();
    const timer = window.setInterval(probe, 2500);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const globalActive = windowsReady && windowsEnabled;

  return (
    <main className="screen-shell device-screen desktop-screen">
      <header className="compact-header">
        <div className="compact-heading">
          <Link className="back-link" href="/">
            ←
          </Link>
          <div>
            <span className="eyebrow">COMPUTADOR</span>
            <h1>Controle global do Windows</h1>
          </div>
        </div>

        <span
          className={`status-pill ${globalActive ? "online" : ""}`}
        >
          {globalActive
            ? "✓ Windows sob controle"
            : windowsReady
              ? "Controle pausado"
              : connected
                ? "Celular conectado"
                : "Configuração pendente"}
        </span>
      </header>

      <div
        className="micro-steps desktop-steps desktop-steps-four"
        aria-label="Passos"
      >
        <span className={extensionReady ? "done" : "active"}>
          1. Extensão
        </span>
        <span
          className={
            windowsReady
              ? "done"
              : extensionReady
                ? "active"
                : ""
          }
        >
          2. App Windows
        </span>
        <span
          className={
            connected
              ? "done"
              : windowsReady
                ? "active"
                : ""
          }
        >
          3. Conecte o celular
        </span>
        <span className={globalActive && connected ? "active" : ""}>
          4. Controle tudo
        </span>
      </div>

      <section className="desktop-workspace">
        <article className="panel code-panel">
          <span className="eyebrow">CÓDIGO DO CELULAR</span>
          <h2>Digite no celular</h2>

          <div
            className="code"
            aria-label={`Código ${code}`}
          >
            {code}
          </div>

          <div
            className={`notice compact-notice ${
              connected ? "good" : ""
            }`}
          >
            {connected
              ? "✓ Celular conectado"
              : "Aguardando o código ser informado no celular."}
          </div>

          <div className="status-grid">
            <div>
              <span>Movimento</span>
              <strong>{gestureName(gesture)}</strong>
            </div>
            <div>
              <span>Última ação</span>
              <strong>{lastAction}</strong>
            </div>
          </div>

          <div
            className={`native-summary ${
              globalActive ? "native-summary-ready" : ""
            }`}
          >
            <span>{globalActive ? "●" : "○"}</span>
            <div>
              <strong>
                {globalActive
                  ? "Controle global ativo"
                  : windowsReady
                    ? "Controle global pausado"
                    : "Controle global ainda não ativo"}
              </strong>
              <small>
                {globalActive
                  ? "O cursor real do Windows recebe seus gestos."
                  : windowsReady
                    ? "Pressione Ctrl + Alt + G para retomar."
                    : "Conclua a instalação no painel ao lado."}
              </small>
            </div>
          </div>
        </article>

        <article className="panel hand-panel">
          <div className="panel-heading-row">
            <div>
              <span className="eyebrow">SUA MÃO</span>
              <h2>Movimento recebido</h2>
            </div>
            <span
              className={`mini-status ${
                connected ? "online" : ""
              }`}
            >
              {connected ? "ao vivo" : "aguardando"}
            </span>
          </div>

          <div className="remote-stage">
            <canvas ref={canvasRef} />
          </div>

          <div className="demo-strip">
            <span>Teste:</span>
            <div className="demo-mini">
              <button type="button">A</button>
              <button type="button">B</button>
              <span
                className="demo-cursor"
                style={{
                  left: `${demoCursor.x * 100}%`,
                  top: `${demoCursor.y * 100}%`,
                }}
              />
            </div>
            <strong>{demoClicks} cliques</strong>
          </div>

          <div className="overlay-note">
            <span>✋</span>
            <div>
              <strong>Overlay global</strong>
              <small>
                Com o app Windows ativo, o esqueleto verde/vermelho
                aparece por cima de qualquer programa.
              </small>
            </div>
          </div>
        </article>

        <aside className="panel browser-panel global-panel">
          <div className="panel-heading-row">
            <div>
              <span className="eyebrow">
                CONTROLE GLOBAL DO WINDOWS
              </span>
              <h2>
                {globalActive
                  ? "Pronto para controlar"
                  : !extensionReady
                    ? "Instale a extensão"
                    : !windowsReady
                      ? "Instale o app Windows"
                      : "Controle pausado"}
              </h2>
            </div>

            <span
              className={`mini-status ${
                globalActive ? "online" : ""
              }`}
            >
              {globalActive ? "ativo" : "pendente"}
            </span>
          </div>

          {!extensionReady && (
            <>
              <div className="setup-actions compact-actions">
                <a
                  className="button"
                  href="/gesture-control-extension.zip"
                  download
                >
                  Baixar extensão
                </a>
                <button
                  className="button secondary"
                  type="button"
                  onClick={openExtensionsPage}
                >
                  Abrir extensões
                </button>
              </div>

              <ol className="install-steps compact-install">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Remova a versão antiga</strong>
                    <small>
                      Necessário uma vez para ativar o novo ID estável.
                    </small>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Extraia o ZIP</strong>
                    <small>
                      Abra a pasta gesture-control-extension.
                    </small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Modo do desenvolvedor</strong>
                    <small>Ative em chrome://extensions/.</small>
                  </div>
                </li>
                <li>
                  <span>4</span>
                  <div>
                    <strong>Carregar sem compactação</strong>
                    <small>Selecione a pasta extraída.</small>
                  </div>
                </li>
              </ol>
            </>
          )}

          {extensionReady && !windowsReady && (
            <>
              <div className="ready-inline">
                <span>✓</span>
                <div>
                  <strong>Extensão detectada</strong>
                  <small>
                    Agora instale o componente que controla o Windows.
                  </small>
                </div>
              </div>

              <a
                className="button windows-download"
                href={WINDOWS_DOWNLOAD}
              >
                Baixar Gesture Control para Windows
              </a>

              <ol className="install-steps compact-install windows-install">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Baixe o .exe</strong>
                    <small>
                      O arquivo é criado automaticamente pelo GitHub.
                    </small>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Abra o arquivo uma vez</strong>
                    <small>
                      Ele se instala no seu usuário do Windows.
                    </small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Volte para esta página</strong>
                    <small>
                      O status muda sozinho para controle global ativo.
                    </small>
                  </div>
                </li>
                <li>
                  <span>!</span>
                  <div>
                    <strong>Extensão antiga?</strong>
                    <small>
                      Se o app não for detectado, remova a extensão antiga
                      e carregue novamente o ZIP atual.
                    </small>
                  </div>
                </li>
              </ol>
            </>
          )}

          {windowsReady && (
            <div className="global-ready-card">
              <span className="global-ready-icon">
                {windowsEnabled ? "✓" : "Ⅱ"}
              </span>
              <div>
                <strong>
                  {windowsEnabled
                    ? "Controle global ativo"
                    : "Controle global pausado"}
                </strong>
                <small>
                  {windowsEnabled
                    ? "Cursor real, clique, scroll e overlay da mão funcionam sobre todo o Windows."
                    : "Pressione Ctrl + Alt + G para retomar."}
                </small>
              </div>
            </div>
          )}

          {extensionsHelp && (
            <div className="notice compact-help">
              {extensionsHelp}
            </div>
          )}

          <div className="global-safety">
            <strong>Atalho de segurança</strong>
            <span>Ctrl + Alt + G</span>
            <small>Pausa/retoma o controle global imediatamente.</small>
          </div>

          <div className="compact-gestures desktop-gestures">
            <div>
              <span>☝️</span>
              <small>Cursor real</small>
            </div>
            <div>
              <span>🤏</span>
              <small>Clicar</small>
            </div>
            <div>
              <span>↕️</span>
              <small>Rolar</small>
            </div>
            <div>
              <span>↔️</span>
              <small>Navegar</small>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
