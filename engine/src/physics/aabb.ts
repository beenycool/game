/**
 * Simple AABB helpers (deterministic, no side-effects)
 */

export type AABB = { x: number; y: number; w: number; h: number };

/**
 * Test intersection between two AABBs
 */
export function intersects(a: AABB, b: AABB): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * Compute a minimal translation vector to separate a from b.
 * Returns {x, y} where one of the components is zero and the other
 * is the minimal translation to resolve penetration for `a`.
 *
 * Deterministic and purely positional (no velocity changes).
 */
export function resolve(a: AABB, b: AABB): { x: number; y: number } {
  // centers
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;

  const dx = ax - bx;
  const dy = ay - by;

  const px = (a.w + b.w) / 2 - Math.abs(dx);
  const py = (a.h + b.h) / 2 - Math.abs(dy);

  if (px <= 0 || py <= 0) return { x: 0, y: 0 }; // no overlap

  // small epsilon to ensure strict separation for integer-boundary tests
  const eps = 1e-6;

  // resolve along the smaller penetration axis
  if (px < py) {
    // move along x
    const val = dx > 0 ? px : -px;
    return { x: val + (val > 0 ? eps : -eps), y: 0 };
  } else {
    const val = dy > 0 ? py : -py;
    return { x: 0, y: val + (val > 0 ? eps : -eps) };
  }
}