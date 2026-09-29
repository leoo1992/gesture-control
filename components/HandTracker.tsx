"use client";

import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { GestureEngine, type GestureSnapshot } from "@/lib/gesture-engine";
import { drawHand } from "@/lib/hand-drawing";
import type { HandPoint } from "@/lib/protocol";

type Props = {
  onFrame?: (points: HandPoint[], snapshot: GestureSnapshot, at: number) => void;
};

type CameraPermissionState =
  | "checking"
  | "prompt"
  | "granted"
  | "denied"
  | "unknown";

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

const gestureName = (gesture: string) =>
  ({
    POINTER: "Apontando",
    PINCH: "Clique",
    OPEN_PALM: "Mão aberta",
    "SEM MÃO": "Mostre sua mão",
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
  const fpsRef = useRef({ at: 0, frames: 0 });

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [permission, setPermission] =
    useState<CameraPermissionState>("checking");
  const [message, setMessage] = useState(
    "Toque em “Ativar câmera” para começar.",
  );
  const [gesture, setGesture] = useState("SEM MÃO");
  const [fps, setFps] = useState(0);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    let permissionListener: (() => void) | null = null;
    let disposed = false;

    const readPermission = async () => {
      if (!navigator.permissions?.query) {
        if (!disposed) setPermission("unknown");
        return;
      }

      try {
        permissionStatus = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });

        if (disposed) return;

        permissionListener = () => {
          const state = permissionStatus?.state;
          setPermission(
            state === "granted" || state === "denied" || state === "prompt"
              ? state
              : "unknown",
          );
        };

        permissionListener();
        permissionStatus.addEventListener("change", permissionListener);
      } catch {
        if (!disposed) setPermission("unknown");
      }
    };

    void readPermission();

    return () => {
      disposed = true;
      if (permissionStatus && permissionListener) {
        permissionStatus.removeEventListener("change", permissionListener);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  const activateCamera = async () => {
    if (status === "loading" || status === "ready") return;

    if (!window.isSecureContext) {
      setStatus("error");
      setMessage("A câmera só funciona em uma conexão segura (HTTPS).");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMessage("Este navegador não oferece acesso à câmera nesta página.");
      return;
    }

    setStatus("loading");
    setMessage("Aguardando sua permissão para usar a câmera…");

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
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

      streamRef.current = stream;
      setPermission("granted");

      const video = videoRef.current;
      if (!video) throw new Error("Não foi possível preparar a câmera.");

      video.srcObject = stream;
      await video.play();
      setMessage("Câmera autorizada. Preparando o reconhecimento da mão…");

      const { FilesetResolver, HandLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(WASM);

      try {
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });
      } catch {
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });
      }

      fpsRef.current = { at: performance.now(), frames: 0 };
      setStatus("ready");
      setMessage("Câmera pronta");

      const tick = () => {
        const landmarker = landmarkerRef.current;
        const currentVideo = videoRef.current;
        const canvas = canvasRef.current;
        if (!landmarker || !currentVideo || !canvas) return;

        const now = performance.now();

        if (
          currentVideo.readyState >= 2 &&
          currentVideo.currentTime !== lastVideoTimeRef.current
        ) {
          lastVideoTimeRef.current = currentVideo.currentTime;
          const result = landmarker.detectForVideo(currentVideo, now);
          const raw = result.landmarks?.[0] as HandPoint[] | undefined;

          if (raw?.length === 21) {
            drawHand(canvas, raw);
            const snapshot = engineRef.current.update(raw, now);
            setGesture(snapshot.gesture);
            onFrameRef.current?.(raw, snapshot, now);
          } else {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            setGesture("SEM MÃO");
          }

          fpsRef.current.frames += 1;
          if (now - fpsRef.current.at >= 1000) {
            setFps(fpsRef.current.frames);
            fpsRef.current = { at: now, frames: 0 };
          }
        }

        requestRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const cameraError = error as DOMException;

      if (
        cameraError?.name === "NotAllowedError" ||
        cameraError?.name === "SecurityError"
      ) {
        setPermission("denied");
        setMessage(
          "A câmera está bloqueada para este site. Abra as permissões do site no navegador, permita a câmera e toque em “Tentar novamente”.",
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

      setStatus("error");
    }
  };

  const permissionText =
    permission === "denied"
      ? "Câmera bloqueada"
      : permission === "granted"
        ? "Câmera permitida"
        : permission === "prompt"
          ? "Permissão ainda não solicitada"
          : permission === "checking"
            ? "Verificando permissão…"
            : "Permissão será verificada ao ativar";

  return (
    <div className="camera-stage" aria-label="Câmera com desenho da mão">
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} />

      {status !== "ready" && (
        <div className="camera-permission">
          <span className="camera-permission-icon" aria-hidden="true">
            📷
          </span>
          <h3>
            {status === "error"
              ? "A câmera precisa da sua atenção"
              : "Ative a câmera do celular"}
          </h3>
          <p>{message}</p>
          <span className={`permission-badge permission-${permission}`}>
            {permissionText}
          </span>
          <button
            className="button camera-action"
            type="button"
            onClick={activateCamera}
            disabled={status === "loading"}
          >
            {status === "loading"
              ? "Aguardando permissão…"
              : status === "error"
                ? "Tentar novamente"
                : "Ativar câmera"}
          </button>
          {permission === "denied" && (
            <small className="permission-help">
              No Chrome do celular: toque no ícone ao lado do endereço do site →
              Permissões → Câmera → Permitir.
            </small>
          )}
        </div>
      )}

      <div className="camera-hud">
        {status === "ready" && (
          <span className="metric">{gestureName(gesture)}</span>
        )}
        {status === "ready" && <span className="metric">{message}</span>}
        {status === "ready" && (
          <span className="metric subtle-metric">{fps} quadros/s</span>
        )}
      </div>
    </div>
  );
}
