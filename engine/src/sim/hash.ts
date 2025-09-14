/**
 * Deterministic state hashing utilities for game simulation.
 * Provides stable hashing of game state for determinism verification.
 */

/**
 * Simple deterministic hash function (FNV-1a variant)
 */
export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Hash a game state deterministically
 */
export function hashState(state: any): string {
  // Create a canonical JSON representation with sorted keys
  const canonicalJson = JSON.stringify(state, (key, value) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Sort object keys for deterministic ordering
      return Object.keys(value)
        .sort()
        .reduce((sorted: any, key) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
    }
    return value;
  });

  return fnv1aHash(canonicalJson).toString(16);
}

/**
 * Quantize float values for stable hashing
 */
export function quantizeValue(value: number, precision: number = 1000): number {
  return Math.round(value * precision);
}

/**
 * Create a quantized snapshot of entity state for hashing
 */
export function createQuantizedSnapshot(entities: any[]): any[] {
  return entities
    .map(entity => ({
      id: entity.id,
      type: entity.type,
      x: quantizeValue(entity.x),
      y: quantizeValue(entity.y),
      vx: quantizeValue(entity.vx),
      vy: quantizeValue(entity.vy),
      hp: quantizeValue(entity.hp),
      w: quantizeValue(entity.w),
      h: quantizeValue(entity.h),
      lifetime: entity.lifetime ? quantizeValue(entity.lifetime) : undefined,
      owner: entity.owner,
      // Build piece specific fields
      material: entity.material,
      buildType: entity.buildType,
      rot: entity.rot !== undefined ? quantizeValue(entity.rot) : undefined,
      editState: entity.editState
    }))
    .sort((a, b) => a.id.localeCompare(b.id)); // Sort by ID for deterministic ordering
}

/**
 * Compute checksum for game state
 */
export function computeStateChecksum(state: any): string {
  const quantizedState = {
    tick: state.tick,
    entities: createQuantizedSnapshot(state.entities),
    rng: state.rng // Include RNG state if present
  };
  
  return hashState(quantizedState);
}

/**
 * Simple checksum for quick verification
 */
export function quickChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}