/**
 * Deterministic tick loop and World implementation (pure TypeScript).
 *
 * - Fixed timestep (tickRate)
 * - World.tick(inputs[]) advances one tick
 * - Uses state.applyInputsShallow, physics AABB helpers for collision & resolution
 *
 * World shape is intentionally small and testable.
 */

import { intersects, resolve, AABB } from "../physics/aabb";
import {
  State,
  createState,
  Entity,
  EntityType,
  createBullet,
  createPlayer,
  applyInputsShallow,
  serializeSnapshot,
  deserializeSnapshot,
  Input,
  cloneState,
} from "../state";
import { PRNG, createPRNG } from "./prng";
import { computeStateChecksum } from "./hash";
import { getActiveWeapon, getWeaponConfigForSlot, canFireWeapon, fireWeapon, updateReload } from "../player/inventory";
import { fire, FireResult } from "../weapon/weapon";
import { simulateProjectiles, createProjectile, Projectile, HitResult } from "./projectiles";
import { processMovement } from "./movement";

/**
 * Options for world creation
 */
export type WorldOpts = {
  tickRate?: number; // ticks per second
  seed?: number;
};

export type Snapshot = { tick: number; entities: { id: string; x: number; y: number; vx: number; vy: number; hp: number }[] };

/**
 * World object returned by createWorld
 */
export class World {
  state: State;
  tickRate: number;
  dt: number;
  private prng: PRNG;
  private activeProjectiles: Projectile[] = [];

  constructor(state?: State, tickRate = 20, seed?: number) {
    this.state = state ?? createState(0, seed);
    this.tickRate = tickRate;
    this.dt = 1 / this.tickRate;
    this.prng = createPRNG(seed);
    this.activeProjectiles = [];
    
    // Initialize RNG state if not present
    if (this.state.rng === undefined) {
      this.state.rng = this.prng.getState();
    } else {
      this.prng.setState(this.state.rng);
    }
  }

  /**
   * Merge an array of input maps into a single mapping clientId -> Input.
   * Later maps override earlier ones for the same clientId.
   */
  private mergeInputs(inputs: Record<string, Input>[]): Record<string, Input> {
    const out: Record<string, Input> = {};
    for (const map of inputs) {
      for (const k of Object.keys(map)) out[k] = map[k];
    }
    return out;
  }

  /**
   * Advance world by exactly one tick.
   * inputs: array of maps (clientId -> Input) per the public API; merged deterministically.
   */
  tick(inputs: Record<string, Input>[]): void {
    const merged = this.mergeInputs(inputs);
    // apply inputs shallowly (integrate velocities & bullets)
    let next = applyInputsShallow(this.state, merged, this.dt);

    // Process deterministic movement for all players (after inputs, before collision resolution)
    processMovement(next, merged, this.dt, next.tick, this.prng);

    // Handle weapon reloading and combat
    this.handleWeaponCombat(next, merged);

    // Simulate projectiles and handle hits
    this.handleProjectiles(next);

    // positional collision resolution for players (pairwise)
    const players = next.entities.filter((e) => e.type === "player");
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];
        const a: AABB = { x: p1.x, y: p1.y, w: p1.w, h: p1.h };
        const b: AABB = { x: p2.x, y: p2.y, w: p2.w, h: p2.h };
        if (intersects(a, b)) {
          const mtv = resolve(a, b);
          // split the correction so it's deterministic and symmetric
          p1.x += mtv.x / 2;
          p1.y += mtv.y / 2;
          p2.x -= mtv.x / 2;
          p2.y -= mtv.y / 2;
        }
      }
    }

    // Advance RNG state and store it
    this.state.rng = this.prng.getState();
    this.prng.next(); // Advance to next state for next tick

    // Compute state checksum
    next.lastChecksum = computeStateChecksum(next);

    // finalize
    this.state = next;
  }

  private handleWeaponCombat(state: State, inputs: Record<string, Input>): void {
    // Update reload states
    for (const entity of state.entities) {
      if (entity.type === "player" && entity.inventory) {
        entity.inventory = updateReload(entity.inventory);
      }
    }

    // Handle shooting inputs
    for (const cid of Object.keys(inputs)) {
      const inp = inputs[cid];
      if (inp.shoot) {
        const shooter = state.entities.find((e) => e.id === cid && e.type === "player");
        if (shooter && shooter.inventory) {
          this.handlePlayerShooting(shooter, inp);
        }
      }
    }
  }

  private handlePlayerShooting(shooter: Entity, input: Input): void {
    if (!shooter.inventory) return;

    const weaponState = getActiveWeapon(shooter.inventory);
    const weaponConfig = getWeaponConfigForSlot(shooter.inventory, shooter.inventory.activeWeaponSlot);

    if (canFireWeapon(shooter.inventory)) {
      // Determine aim direction (use movement direction for now)
      let aimDir = { x: 0, y: -1 }; // Default upwards
      if (input.dx !== 0 || input.dy !== 0) {
        aimDir = { x: input.dx, y: input.dy };
      }

      // Normalize aim direction
      const mag = Math.sqrt(aimDir.x * aimDir.x + aimDir.y * aimDir.y) || 1;
      aimDir = { x: aimDir.x / mag, y: aimDir.y / mag };

      // Fire weapon
      const fireResult = fire(weaponState, weaponConfig, shooter.id,
        { x: shooter.x, y: shooter.y }, aimDir, this.prng);

      if (fireResult.success) {
        // Update ammo
        shooter.inventory = fireWeapon(shooter.inventory);

        // Spawn projectiles
        for (const projectileData of fireResult.projectiles) {
          this.activeProjectiles.push(createProjectile(projectileData, this.prng));
        }

        // TODO: Emit projectile spawn events via protocol
      }
    }
  }

  private handleProjectiles(state: State): void {
    const simulationResult = simulateProjectiles(this.activeProjectiles, state.entities, this.dt, this.prng);
    
    // Apply damage from hits
    for (const hit of simulationResult.hits) {
      if (hit.entityId && hit.damage) {
        const target = state.entities.find(e => e.id === hit.entityId);
        if (target) {
          target.hp = Math.max(0, target.hp - hit.damage);
          // TODO: Emit damage event via protocol
        }
      }
    }

    // Update active projectiles
    this.activeProjectiles = simulationResult.projectiles;

    // Remove expired projectiles
    this.activeProjectiles = this.activeProjectiles.filter(p => p.lifetime > 0 && p.distanceTraveled < p.range);
  }

  getSnapshot(): Snapshot {
    return { tick: this.state.tick, entities: this.state.entities.map((e) => ({ id: e.id, x: e.x, y: e.y, vx: e.vx, vy: e.vy, hp: e.hp })) };
  }

  // helper to set state (useful in tests)
  setState(s: State) {
    this.state = cloneState(s);
  }

  // compact serialized snapshot
  serialize(): string {
    return serializeSnapshot(this.state);
  }

  static deserialize(serialized: string): State {
    return deserializeSnapshot(serialized);
  }
}

/**
 * Factory
 */
export function createWorld(seed?: number, opts?: { tickRate?: number }): World {
  const tickRate = opts?.tickRate ?? 20;
  const startState = createState(0, seed);
  return new World(startState, tickRate, seed);
}

/**
 * Reconciliation helper (re-export)
 */
export function reconcile(snapshotJson: string, bufferedInputs: Record<string, Input>[], tickRate = 20): State {
  // use state's reconcile implementation
  // import here to avoid circular exports at top-level
  const { reconcile: reconcileState } = require("../state") as typeof import("../state");
  return reconcileState(snapshotJson, bufferedInputs, tickRate);
}