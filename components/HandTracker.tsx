"use client";

import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { GestureEngine, type GestureSnapshot } from "@/lib/gesture-engine";
import { drawHand } from "@/lib/hand-drawing";
import type { HandPoint } from "@/lib/protocol";

type Props = {
  onFrame?: (points: HandPoint[], snapshot: GestureSnapshot, at: number) => void;
};

const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

const gestureName = (gesture: string) => ({
  POINTER: "Apontando",
  PINCH: "Clique",
  OPEN_PALM: "Mão aberta",
  "SEM MÃO": "Mostre sua mão",
}[gesture] ?? gesture);

export function HandTracker({ onFrame }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef(new GestureEngine());
  const requestRef = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);
  const lastVideoTimeRef = useRef(-1);
  const fpsRef = useRef({ at: 0, frames: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Abrindo a câmera…");
  const [gesture, setGesture] = useState("SEM MÃO");
  const [fps, setFps] = useState(0);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: HandLandmarker | null = null;

    const tick = () => {
      if (cancelled || !landmarker) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const now = performance.now();

      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const result = landmarker.detectForVideo(video, now);
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

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este navegador não conseguiu abrir a câmera.");
        }

        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        fpsRef.current.at = performance.now();
        const vision = await FilesetResolver.forVisionTasks(WASM);

        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
            minTrackingConfidence: 0.7,
          });
        } catch {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
            minTrackingConfidence: 0.7,
          });
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("ready");
        setMessage("Câmera pronta");
        tick();
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível abrir a câmera.");
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stream?.getTracks().forEach((track) => track.stop());
      landmarker?.close();
    };
  }, []);

  return (
    <div className="camera-stage" aria-label="Câmera com desenho da mão">
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} />
      <div className="camera-hud">
        <span className="metric">{status === "error" ? "Câmera indisponível" : gestureName(gesture)}</span>
        <span className="metric">{message}</span>
        {status === "ready" && <span className="metric subtle-metric">{fps} quadros/s</span>}
      </div>
    </div>
  );
}
