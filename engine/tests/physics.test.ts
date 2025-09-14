import { describe, it, expect } from "vitest";
import { intersects, resolve, AABB } from "../src/physics/aabb";

describe("AABB physics", () => {
  it("detects intersections correctly", () => {
    const a: AABB = { x: 0, y: 0, w: 2, h: 2 };
    const b: AABB = { x: 1, y: 1, w: 2, h: 2 };
    const c: AABB = { x: 3, y: 3, w: 1, h: 1 };

    expect(intersects(a, b)).toBe(true);
    expect(intersects(a, c)).toBe(false);
    expect(intersects(b, c)).toBe(false);
  });

  it("computes a minimal translation vector that separates overlapping boxes", () => {
    const a: AABB = { x: 0, y: 0, w: 2, h: 2 };
    const b: AABB = { x: 1.2, y: 0.5, w: 2, h: 2 };

    expect(intersects(a, b)).toBe(true);
    const mtv = resolve(a, b);
    // apply mtv to 'a' and check no intersection
    const movedA: AABB = { x: a.x + mtv.x, y: a.y + mtv.y, w: a.w, h: a.h };
    expect(intersects(movedA, b)).toBe(false);

    // mtv should move along a single axis (one component zero)
    const oneAxis = (Math.abs(mtv.x) < 1e-9) !== (Math.abs(mtv.y) < 1e-9);
    expect(oneAxis).toBe(true);
  });

  it("returns zero vector for non-overlapping boxes", () => {
    const a: AABB = { x: 0, y: 0, w: 1, h: 1 };
    const b: AABB = { x: 2, y: 2, w: 1, h: 1 };
    const mtv = resolve(a, b);
    expect(mtv.x).toBe(0);
    expect(mtv.y).toBe(0);
  });
});