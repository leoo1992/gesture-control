"use client";

import { useEffect, useRef, useState } from "react";
import { GestureEngine, type GestureSnapshot } from "@/lib/gesture-engine";
import { drawHand } from "@/lib/hand-drawing";
import type { HandPoint } from "@/lib/protocol";

type Props = {
  onFrame?: (points: HandPoint[], snapshot: GestureSnapshot, at: number) => void;
};

type CameraStatus = "idle" | "requesting" | "streaming" | "error";
type TrackingStatus = "idle" | "loading" | "ready" | "error";

type LegacyHandsResults = {
  multiHandLandmarks?: Array<Array<HandPoint>>;
};

type LegacyHandsInstance = {
  setOptions: (options: {
    selfieMode?: boolean;
    maxNumHands?: number;
    modelComplexity?: number;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }) => void;
  onResults: (callback: (results: LegacyHandsResults) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => Promise<void> | void;
};

type LegacyHandsConstructor = new (options: {
  locateFile: (file: string) => string;
}) => LegacyHandsInstance;

declare global {
  interface Window {
    Hands?: LegacyHandsConstructor;
  }
}

const HANDS_SCRIPT = "/mediapipe/hands/hands.js";
const HANDS_ASSET_ROOT = "/mediapipe/hands";
const DETECTION_CONFIDENCE = 0.5;
const TRACKING_CONFIDENCE = 0.45;

let handsScriptPromise: Promise<void> | null = null;

function loadHandsScript() {
  if (typeof window !== "undefined" && window.Hands) {
    return Promise.resolve();
  }

  if (handsScriptPromise) return handsScriptPromise;

  handsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${HANDS_SCRIPT}"]`,
    );

    if (existing) {
      if (window.Hands) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Falha ao carregar hands.js.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = HANDS_SCRIPT;
    script.async = true;
    script.crossOrigin = "anonymous";

    const timeout = window.setTimeout(() => {
      reject(new Error("Tempo esgotado ao carregar o detector de mão."));
    }, 15000);

    script.onload = () => {
      window.clearTimeout(timeout);

      if (!window.Hands) {
        reject(
          new Error(
            "hands.js foi carregado, mas o detector não ficou disponível.",
          ),
        );
        return;
      }

      resolve();
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Não foi possível carregar o detector de mão."));
    };

    document.head.appendChild(script);
  });

  return handsScriptPromise;
}

const gestureName = (gesture: string) =>
  ({
    POINTER: "Apontando",
    PINCH: "Clique",
    OPEN_PALM: "Mão aberta",
    "SEM MÃO": "Mão detectada",
  })[gesture] ?? gesture;

export function HandTracker({ onFrame }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<LegacyHandsInstance | null>(null);
  const engineRef = useRef(new GestureEngine());
  const requestRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  const lastDetectAtRef = useRef(0);
  const fpsRef = useRef({ at: 0, frames: 0 });

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [trackingStatus, setTrackingStatus] =
    useState<TrackingStatus>("idle");
  const [message, setMessage] = useState(
    "Toque em “Ativar câmera” para começar.",
  );
  const [trackingMessage, setTrackingMessage] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [gesture, setGesture] = useState("SEM MÃO");
  const [handDetected, setHandDetected] = useState(false);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void handsRef.current?.close?.();
      handsRef.current = null;
    };
  }, []);

  const clearSkeleton = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleResults = (results: LegacyHandsResults) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const now = performance.now();
    const raw = results.multiHandLandmarks?.[0];

    if (raw?.length === 21) {
      setHandDetected(true);

      drawHand(canvas, raw, {
        lineColor: "#00ff3b",
        pointColor: "#ff2525",
        lineWidth: 3,
        pointRadius: 4.2,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        fit: "cover",
      });

      const snapshot = engineRef.current.update(raw, now);
      setGesture(snapshot.gesture);
      onFrameRef.current?.(raw, snapshot, now);
    } else {
      setHandDetected(false);
      setGesture("SEM MÃO");
      clearSkeleton();
    }

    fpsRef.current.frames += 1;
    if (now - fpsRef.current.at >= 1000) {
      setFps(fpsRef.current.frames);
      fpsRef.current = { at: now, frames: 0 };
    }
  };

  const startTrackingLoop = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    const tick = () => {
      const hands = handsRef.current;
      const video = videoRef.current;

      if (!hands || !video) return;

      const now = performance.now();

      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - lastDetectAtRef.current >= 33 &&
        !processingRef.current
      ) {
        lastDetectAtRef.current = now;
        processingRef.current = true;

        void hands
          .send({ image: video })
          .catch((error: unknown) => {
            const detail =
              error instanceof Error ? error.message : String(error);

            console.error("Falha durante o rastreamento da mão:", error);
            setTrackingError(detail);
            setTrackingStatus("error");
            setTrackingMessage("O detector parou durante o rastreamento.");
          })
          .finally(() => {
            processingRef.current = false;
          });
      }

      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);
  };

  const loadHandTracking = async () => {
    const video = videoRef.current;
    if (!video) return;

    setTrackingStatus("loading");
    setTrackingMessage("Preparando reconhecimento da mão…");
    setTrackingError("");
    setHandDetected(false);
    clearSkeleton();

    try {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }

      await handsRef.current?.close?.();
      handsRef.current = null;
      processingRef.current = false;

      await loadHandsScript();

      const HandsClass = window.Hands;
      if (!HandsClass) {
        throw new Error("O detector MediaPipe Hands não foi inicializado.");
      }

      const hands = new HandsClass({
        locateFile: (file) => `${HANDS_ASSET_ROOT}/${file}`,
      });

      hands.setOptions({
        selfieMode: false,
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: DETECTION_CONFIDENCE,
        minTrackingConfidence: TRACKING_CONFIDENCE,
      });

      hands.onResults(handleResults);
      handsRef.current = hands;

      fpsRef.current = { at: performance.now(), frames: 0 };
      lastDetectAtRef.current = 0;

      setTrackingStatus("ready");
      setTrackingMessage("Reconhecimento ativo");
      startTrackingLoop();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      console.error("Falha ao inicializar MediaPipe Hands:", error);
      setTrackingStatus("error");
      setTrackingMessage(
        "A câmera está ativa, mas o reconhecimento da mão não carregou.",
      );
      setTrackingError(detail);
    }
  };

  const activateCamera = async () => {
    if (cameraStatus === "requesting" || cameraStatus === "streaming") return;

    if (!window.isSecureContext) {
      setCameraStatus("error");
      setMessage("A câmera só funciona em uma conexão segura (HTTPS).");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("error");
      setMessage("Este navegador não oferece acesso à câmera nesta página.");
      return;
    }

    setCameraStatus("requesting");
    setTrackingStatus("idle");
    setHandDetected(false);
    setMessage("Aguardando autorização da câmera…");

    try {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }

      await handsRef.current?.close?.();
      handsRef.current = null;
      processingRef.current = false;

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      clearSkeleton();

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
      } catch (error) {
        const cameraError = error as DOMException;
        if (cameraError?.name !== "OverconstrainedError") throw error;

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Não foi possível preparar a câmera.");
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error("A câmera demorou demais para iniciar.")),
            8000,
          );

          const cleanup = () => {
            window.clearTimeout(timeout);
            video.onloadedmetadata = null;
            video.onerror = null;
          };

          video.onloadedmetadata = () => {
            cleanup();
            resolve();
          };

          video.onerror = () => {
            cleanup();
            reject(new Error("Não foi possível exibir a imagem da câmera."));
          };
        });
      }

      await video.play();

      setCameraStatus("streaming");
      setMessage("Câmera ativa");
      void loadHandTracking();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const cameraError = error as DOMException;

      if (
        cameraError?.name === "NotAllowedError" ||
        cameraError?.name === "SecurityError"
      ) {
        setMessage(
          "A câmera está bloqueada. Permita a câmera para este site e tente novamente.",
        );
      } else if (cameraError?.name === "NotFoundError") {
        setMessage("Nenhuma câmera foi encontrada neste celular.");
      } else if (cameraError?.name === "NotReadableError") {
        setMessage(
          "A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.",
        );
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível abrir a câmera.",
        );
      }

      setCameraStatus("error");
    }
  };

  const cameraVisible = cameraStatus === "streaming";

  return (
    <div className="camera-stage" aria-label="Câmera com desenho da mão">
      <video ref={videoRef} autoPlay playsInline muted />
      <canvas ref={canvasRef} />

      {!cameraVisible && (
        <div className="camera-permission">
          <span className="camera-permission-icon" aria-hidden="true">
            📷
          </span>
          <h3>
            {cameraStatus === "error"
              ? "Não foi possível mostrar a câmera"
              : "Ative a câmera do celular"}
          </h3>
          <p>{message}</p>
          <button
            className="button camera-action"
            type="button"
            onClick={activateCamera}
            disabled={cameraStatus === "requesting"}
          >
            {cameraStatus === "requesting"
              ? "Abrindo câmera…"
              : cameraStatus === "error"
                ? "Tentar novamente"
                : "Ativar câmera"}
          </button>
        </div>
      )}

      {cameraVisible && (
        <div className="camera-hud">
          <span className="metric camera-live">● Câmera ativa</span>

          {trackingStatus === "loading" && (
            <span className="metric">{trackingMessage}</span>
          )}

          {trackingStatus === "ready" && handDetected && (
            <>
              <span className="metric hand-live">● Mão detectada</span>
              <span className="metric">{gestureName(gesture)}</span>
              <span className="metric subtle-metric">{fps} fps</span>
            </>
          )}

          {trackingStatus === "ready" && !handDetected && (
            <span className="metric no-hand">
              Mão não detectada · enquadre a mão inteira
            </span>
          )}

          {trackingStatus === "error" && (
            <>
              <button
                className="metric metric-button"
                type="button"
                onClick={() => void loadHandTracking()}
              >
                Reconhecimento falhou · tentar novamente
              </button>
              {trackingError && (
                <span className="metric tracking-error" title={trackingError}>
                  Erro: {trackingError}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
