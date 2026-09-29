import type { GestureCommand, HandPoint } from "./protocol";

export type GestureSnapshot = {
  commands: GestureCommand[];
  gesture: "POINTER" | "PINCH" | "OPEN_PALM";
  pointer: { x: number; y: number };
  pinchRatio: number;
  openPalm: boolean;
};

export function distance(a: HandPoint, b: HandPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extended(points: HandPoint[], tip: number, pip: number) {
  const wrist = points[0];
  return distance(wrist, points[tip]) > distance(wrist, points[pip]) * 1.14;
}

export function handGeometry(points: HandPoint[]) {
  if (points.length !== 21) return { pinchRatio: 99, openPalm: false };
  const palmWidth = Math.max(distance(points[5], points[17]), 0.001);
  const pinchRatio = distance(points[4], points[8]) / palmWidth;
  const extendedCount = [
    extended(points, 8, 6),
    extended(points, 12, 10),
    extended(points, 16, 14),
    extended(points, 20, 18),
  ].filter(Boolean).length;
  return { pinchRatio, openPalm: extendedCount >= 4 };
}

export class GestureEngine {
  private smoothed = { x: 0.5, y: 0.5 };
  private initialized = false;
  private pinchFrames = 0;
  private pinchLatched = false;
  private lastClickAt = 0;
  private lastSwipeAt = 0;
  private prevWrist: { x: number; y: number; at: number } | null = null;

  update(points: HandPoint[], at = performance.now()): GestureSnapshot {
    if (points.length !== 21) {
      return { commands: [], gesture: "POINTER", pointer: this.smoothed, pinchRatio: 99, openPalm: false };
    }

    const index = points[8];
    const displayPoint = { x: 1 - index.x, y: index.y };
    if (!this.initialized) {
      this.smoothed = displayPoint;
      this.initialized = true;
    } else {
      const alpha = 0.34;
      this.smoothed = {
        x: this.smoothed.x + (displayPoint.x - this.smoothed.x) * alpha,
        y: this.smoothed.y + (displayPoint.y - this.smoothed.y) * alpha,
      };
    }

    const commands: GestureCommand[] = [
      { action: "pointer", x: clamp01(this.smoothed.x), y: clamp01(this.smoothed.y), at },
    ];
    const { pinchRatio, openPalm } = handGeometry(points);
    const pinching = pinchRatio < 0.42;

    if (pinching) this.pinchFrames += 1;
    else {
      this.pinchFrames = 0;
      this.pinchLatched = false;
    }

    if (this.pinchFrames >= 3 && !this.pinchLatched && at - this.lastClickAt > 380) {
      commands.push({ action: "click", x: clamp01(this.smoothed.x), y: clamp01(this.smoothed.y), at });
      this.pinchLatched = true;
      this.lastClickAt = at;
    }

    const wrist = { x: 1 - points[0].x, y: points[0].y, at };
    if (openPalm && this.prevWrist) {
      const elapsed = Math.max(1, at - this.prevWrist.at);
      const dx = wrist.x - this.prevWrist.x;
      const dy = wrist.y - this.prevWrist.y;
      const horizontalVelocity = Math.abs(dx) / elapsed;

      if (Math.abs(dx) > 0.09 && horizontalVelocity > 0.0005 && at - this.lastSwipeAt > 850) {
        commands.push({ action: dx > 0 ? "history_forward" : "history_back", at });
        this.lastSwipeAt = at;
      } else if (Math.abs(dy) > 0.008) {
        commands.push({ action: "scroll", deltaY: Math.round(dy * 1250), at });
      }
    }
    this.prevWrist = openPalm ? wrist : null;

    return {
      commands,
      gesture: pinching ? "PINCH" : openPalm ? "OPEN_PALM" : "POINTER",
      pointer: this.smoothed,
      pinchRatio,
      openPalm,
    };
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
