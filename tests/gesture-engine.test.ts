import { describe, expect, it } from "vitest";
import { distance, handGeometry } from "../lib/gesture-engine";
import type { HandPoint } from "../lib/protocol";

const point = (x: number, y: number): HandPoint => ({ x, y, z: 0 });

describe("gesture geometry", () => {
  it("calculates euclidean distance", () => {
    expect(distance(point(0, 0), point(3, 4))).toBe(5);
  });

  it("detects a compact thumb-index pinch", () => {
    const hand = Array.from({ length: 21 }, () => point(0.5, 0.5));
    hand[0] = point(0.5, 0.9);
    hand[5] = point(0.35, 0.6);
    hand[17] = point(0.65, 0.6);
    hand[4] = point(0.49, 0.3);
    hand[8] = point(0.51, 0.3);
    expect(handGeometry(hand).pinchRatio).toBeLessThan(0.42);
  });
});
