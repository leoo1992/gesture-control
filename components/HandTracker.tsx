"use client";

import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { GestureEngine, type GestureSnapshot } from "@/lib/gesture-engine";
import { drawHand } from "@/lib/hand-drawing";
import type { HandPoint } from "@/lib/protocol";

type Props = {
  onFrame?: (points: HandPoint[], snapshot: GestureSnapshot, at: number) => void;
};

type CameraStatus = "idle" | "requesting" | "streaming" | "error";
type TrackingStatus = "idle" | "loading" | "ready" | "error";

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

const DETECTION_CONFIDENCE = 0.45;
const PRESENCE_CONFIDENCE = 0.45;
const TRACKING_CONFIDENCE = 0.4;

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
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const engineRef = useRef(new GestureEngine());
  const requestRef = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);
  const lastVideoTimeRef = useRef(-1);
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
      landmarkerRef.current?.close();
    };
  }, []);

  const clearSkeleton = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const startTrackingLoop = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    const tick = () => {
      const landmarker = landmarkerRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!landmarker || !video || !canvas) return;

      const now = performance.now();

      if (
        now - lastDetectAtRef.current >= 30 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastDetectAtRef.current = now;
        lastVideoTimeRef.current = video.currentTime;

        try {
          const result = landmarker.detectForVideo(video, now);
          const raw = result.landmarks?.[0] as HandPoint[] | undefined;

          if (raw?.length === 21) {
            setHandDetected(true);
            drawHand(canvas, raw, {
              lineColor: "#00ff3b",
              pointColor: "#ff2525",
              lineWidth: 2.7,
              pointRadius: 4,
              sourceWidth: video.videoWidth,
              sourceHeight: video.videoHeight,
              fit: "cover",
            });

            const snapshot = engineRef.current.update(raw, now);
            setGesture(snapshot.gesture);
            onFrameRef.current?.(raw, snapshot, now);
          } else {
            setHandDetected(false);
            clearSkeleton();
            setGesture("SEM MÃO");
          }

          fpsRef.current.frames += 1;
          if (now - fpsRef.current.at >= 1000) {
            setFps(fpsRef.current.frames);
            fpsRef.current = { at: now, frames: 0 };
          }
        } catch {
          setHandDetected(false);
          clearSkeleton();
          landmarkerRef.current = null;
          setTrackingStatus("error");
          setTrackingMessage(
            "O detector parou. A câmera continua ativa; toque para reiniciar o reconhecimento.",
          );
          return;
        }
      }

      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);
  };

  const createLandmarker = async (
    delegate: "CPU" | "GPU",
    HandLandmarkerClass: typeof import("@mediapipe/tasks-vision").HandLandmarker,
    vision: Awaited<
      ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>
    >,
  ) =>
    HandLandmarkerClass.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: DETECTION_CONFIDENCE,
      minHandPresenceConfidence: PRESENCE_CONFIDENCE,
      minTrackingConfidence: TRACKING_CONFIDENCE,
    });

  const loadHandTracking = async () => {
    setTrackingStatus("loading");
    setTrackingMessage("Preparando reconhecimento da mão…");
    setHandDetected(false);
    clearSkeleton();

    try {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;

      const { FilesetResolver, HandLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(WASM);

      try {
        landmarkerRef.current = await createLandmarker(
          "CPU",
          HandLandmarker,
          vision,
        );
      } catch {
        landmarkerRef.current = await createLandmarker(
          "GPU",
          HandLandmarker,
          vision,
        );
      }

      fpsRef.current = { at: performance.now(), frames: 0 };
      lastVideoTimeRef.current = -1;
      lastDetectAtRef.current = 0;
      setTrackingStatus("ready");
      setTrackingMessage("Reconhecimento ativo");
      startTrackingLoop();
    } catch {
      setTrackingStatus("error");
      setTrackingMessage(
        "A câmera está ativa, mas o reconhecimento da mão não carregou.",
      );
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

      landmarkerRef.current?.close();
      landmarkerRef.current = null;
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
            <button
              className="metric metric-button"
              type="button"
              onClick={() => void loadHandTracking()}
            >
              Reconhecimento falhou · tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
