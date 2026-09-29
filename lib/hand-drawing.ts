import type { HandPoint } from "./protocol";

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];

export function drawHand(
  canvas: HTMLCanvasElement,
  points: HandPoint[],
  options: { clear?: boolean; lineColor?: string; pointColor?: string } = {},
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (options.clear !== false) ctx.clearRect(0, 0, rect.width, rect.height);
  if (points.length !== 21) return;

  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = options.lineColor ?? "#57e5ff";
  for (const [a,b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(points[a].x * rect.width, points[a].y * rect.height);
    ctx.lineTo(points[b].x * rect.width, points[b].y * rect.height);
    ctx.stroke();
  }

  ctx.fillStyle = options.pointColor ?? "#ffffff";
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x * rect.width, point.y * rect.height, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
