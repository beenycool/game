/**
 * Simple deterministic PRNG (Xorshift32) for game simulation.
 * Provides deterministic randomness based on a seed value.
 */

/**
 * Xorshift32 PRNG implementation
 */
export class PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed || 0x12345678;
  }

  /**
   * Generate next random number in sequence
   */
  next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return this.state >>> 0; // Convert to unsigned 32-bit integer
  }

  /**
   * Generate random float between 0 (inclusive) and 1 (exclusive)
   */
  nextFloat(): number {
    return (this.next() >>> 0) / 0xffffffff;
  }

  /**
   * Generate random integer between min (inclusive) and max (inclusive)
   */
  nextInt(min: number, max: number): number {
    const range = max - min + 1;
    return min + Math.floor(this.nextFloat() * range);
  }

  /**
   * Generate random boolean with given probability (0-1)
   */
  nextBool(probability = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Get current state (for serialization)
   */
  getState(): number {
    return this.state;
  }

  /**
   * Set state (for deserialization)
   */
  setState(state: number): void {
    this.state = state;
  }
}

/**
 * Create a new PRNG instance with optional seed
 */
export function createPRNG(seed?: number): PRNG {
  return new PRNG(seed || 0x12345678);
}

/**
 * Simple one-shot random number generation
 */
export function randomInt(seed: number, min: number, max: number): number {
  const prng = new PRNG(seed);
  return prng.nextInt(min, max);
}

/**
 * Simple one-shot random float generation
 */
export function randomFloat(seed: number): number {
  const prng = new PRNG(seed);
  return prng.nextFloat();
}