import type { HandPoint } from "./protocol";

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

type DrawOptions = {
  clear?: boolean;
  lineColor?: string;
  pointColor?: string;
  lineWidth?: number;
  pointRadius?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  fit?: "fill" | "cover" | "contain";
};

function mapPoint(
  point: HandPoint,
  width: number,
  height: number,
  options: DrawOptions,
) {
  const sourceWidth = options.sourceWidth;
  const sourceHeight = options.sourceHeight;
  const fit = options.fit ?? "fill";

  if (!sourceWidth || !sourceHeight || fit === "fill") {
    return { x: point.x * width, y: point.y * height };
  }

  const scale =
    fit === "cover"
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight);

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;

  return {
    x: offsetX + point.x * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  };
}

export function drawHand(
  canvas: HTMLCanvasElement,
  points: HandPoint[],
  options: DrawOptions = {},
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

  if (options.clear !== false) {
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  if (points.length !== 21) return;

  const mapped = points.map((point) =>
    mapPoint(point, rect.width, rect.height, options),
  );

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = options.lineWidth ?? 2.7;
  ctx.strokeStyle = options.lineColor ?? "#00ff3b";

  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(mapped[a].x, mapped[a].y);
    ctx.lineTo(mapped[b].x, mapped[b].y);
    ctx.stroke();
  }

  const radius = options.pointRadius ?? 4;
  ctx.fillStyle = options.pointColor ?? "#ff2525";

  for (const point of mapped) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
