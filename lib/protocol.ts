export type HandPoint = { x: number; y: number; z?: number };

export type GestureCommand =
  | { action: "pointer"; x: number; y: number; at: number }
  | { action: "click"; x: number; y: number; at: number }
  | { action: "scroll"; deltaY: number; at: number }
  | { action: "history_back"; at: number }
  | { action: "history_forward"; at: number };

export type GestureFrame = {
  type: "frame";
  landmarks: HandPoint[];
  gesture: string;
  at: number;
};

export type GesturePacket =
  | GestureFrame
  | { type: "command"; command: GestureCommand }
  | { type: "hello"; device: "mobile"; version: 1 };

export const isGesturePacket = (value: unknown): value is GesturePacket => {
  if (!value || typeof value !== "object") return false;
  const packet = value as { type?: unknown };
  return packet.type === "frame" || packet.type === "command" || packet.type === "hello";
};
