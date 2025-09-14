/**
 * Deterministic game state and helpers.
 *
 * Snapshot format (compact JSON): { tick: number, entities: [ { id,x,y,vx,vy,hp } ] }
 *
 * This module is pure logic and avoids any side-effects.
 */

import { MaterialType, BuildType } from "./build/types";
import { createDefaultInventory } from "./player/inventory";

export type Input = {
  seq: number;
  clientId: string;
  dx: number; // velocity x (units / second)
  dy: number; // velocity y
  shoot?: boolean;
  jump?: boolean;
  crouch?: boolean;
  sprint?: boolean;
};

export type EntityType = "player" | "bullet" | "build_piece" | "item";

export type Entity = {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  lifetime?: number;
  owner?: string;
  inventory?: any; // Will be properly typed when inventory system is integrated
  // Build piece specific fields
  material?: MaterialType;
  buildType?: BuildType;
  rot?: number; // Rotation in degrees (0, 90, 180, 270)
  editState?: number; // Bitflags for edits (window/door/triangle)
  // Item specific fields
  itemType?: string;
  respawnTime?: number;
  // Team field for players
  team?: number;
  // Movement state fields for players
  isCrouching?: boolean;
  isSprinting?: boolean;
  onGround?: boolean;
  jumpState?: {
    jumpStartTick?: number;
    jumpVel?: number;
  };
  fallStartY?: number;
  movementMomentum?: number;
  maxWalkSpeed?: number;
  walkAccel?: number;
  airControlFactor?: number;
  crouchSpeedMultiplier?: number;
  sprintSpeedMultiplier?: number;
};

export type State = {
  tick: number;
  entities: Entity[];
  rng?: number;
  lastChecksum?: string;
};

export type Snapshot = {
  tick: number;
  entities: { 
    id: string; 
    type: EntityType; 
    x: number; 
    y: number; 
    w: number;
    h: number;
    vx: number; 
    vy: number; 
    hp: number; 
    lifetime?: number; 
    owner?: string; 
    inventory?: any;
    material?: MaterialType;
    buildType?: BuildType;
    rot?: number;
    editState?: number;
    // Movement state fields
    isCrouching?: boolean;
    isSprinting?: boolean;
    onGround?: boolean;
    jumpState?: {
      jumpStartTick?: number;
      jumpVel?: number;
    };
    fallStartY?: number;
    movementMomentum?: number;
    maxWalkSpeed?: number;
    walkAccel?: number;
    airControlFactor?: number;
    crouchSpeedMultiplier?: number;
    sprintSpeedMultiplier?: number;
  }[];
};

export function createState(startTick = 0, seed?: number): State {
  return {
    tick: startTick,
    entities: [],
    rng: seed
  };
}

export function createPlayer(id: string, x: number, y: number): Entity {
  return {
    id,
    type: "player",
    x, y, w: 1, h: 1.8, vx: 0, vy: 0, hp: 100,
    inventory: createDefaultInventory(),
    // Initialize movement state
    isCrouching: false,
    isSprinting: false,
    onGround: true,
    jumpState: {},
    movementMomentum: 0,
    maxWalkSpeed: 5.0,
    walkAccel: 20.0,
    airControlFactor: 0.3,
    crouchSpeedMultiplier: 0.5,
    sprintSpeedMultiplier: 1.8
  };
}

export function createBullet(
  id: string,
  owner: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  lifetime = 60
): Entity {
  return { id, type: "bullet", owner, x, y, w: 0.2, h: 0.2, vx, vy, hp: 1, lifetime };
}

export function createBuildPiece(
  id: string,
  owner: string,
  buildType: BuildType,
  material: MaterialType,
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
  hp: number
): Entity {
  return {
    id,
    type: "build_piece",
    owner,
    buildType,
    material,
    x,
    y,
    w,
    h,
    rot,
    vx: 0,
    vy: 0,
    hp,
    editState: 0 // No edits initially
  };
}

export function serializeSnapshot(state: State): string {
  const snap: Snapshot = {
    tick: state.tick,
    entities: state.entities.map((e) => ({
      id: e.id,
      type: e.type,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      vx: e.vx,
      vy: e.vy,
      hp: e.hp,
      lifetime: e.lifetime,
      owner: e.owner,
      inventory: e.inventory,
      material: e.material,
      buildType: e.buildType,
      rot: e.rot,
      editState: e.editState,
      // Movement state fields
      isCrouching: e.isCrouching,
      isSprinting: e.isSprinting,
      onGround: e.onGround,
      jumpState: e.jumpState,
      fallStartY: e.fallStartY,
      movementMomentum: e.movementMomentum,
      maxWalkSpeed: e.maxWalkSpeed,
      walkAccel: e.walkAccel,
      airControlFactor: e.airControlFactor,
      crouchSpeedMultiplier: e.crouchSpeedMultiplier,
      sprintSpeedMultiplier: e.sprintSpeedMultiplier
    }))
  };
  return JSON.stringify(snap);
}

export function deserializeSnapshot(json: string): State {
  const snap = JSON.parse(json) as Snapshot;
  const entities: Entity[] = snap.entities.map((e) => {
    if (e.type === "bullet") {
      return {
        id: e.id,
        type: "bullet",
        owner: e.owner,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        vx: e.vx,
        vy: e.vy,
        hp: e.hp,
        lifetime: e.lifetime,
      };
    } else if (e.type === "build_piece") {
      return {
        id: e.id,
        type: "build_piece",
        owner: e.owner,
        buildType: e.buildType,
        material: e.material,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        vx: e.vx,
        vy: e.vy,
        hp: e.hp,
        rot: e.rot || 0,
        editState: e.editState || 0
      };
    }
    // Default to player
    return {
      id: e.id,
      type: "player",
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      vx: e.vx,
      vy: e.vy,
      hp: e.hp,
      inventory: e.inventory,
      // Movement state fields
      isCrouching: e.isCrouching,
      isSprinting: e.isSprinting,
      onGround: e.onGround,
      jumpState: e.jumpState,
      fallStartY: e.fallStartY,
      movementMomentum: e.movementMomentum,
      maxWalkSpeed: e.maxWalkSpeed,
      walkAccel: e.walkAccel,
      airControlFactor: e.airControlFactor,
      crouchSpeedMultiplier: e.crouchSpeedMultiplier,
      sprintSpeedMultiplier: e.sprintSpeedMultiplier
    };
  });
  return { tick: snap.tick, entities };
}

export function cloneState(state: State): State {
  return {
    tick: state.tick,
    entities: state.entities.map((e) => ({ ...e })),
    rng: state.rng,
    lastChecksum: state.lastChecksum
  };
}

/**
 * Apply inputs (mapping clientId->Input) deterministically to state for dt seconds.
 * This does not perform collision resolution; it integrates velocities and bullets.
 */
export function applyInputsShallow(state: State, inputs: Record<string, Input>, dt: number): State {
  const next = cloneState(state);
  next.tick = state.tick + 1;

  // apply player inputs
  for (const clientId of Object.keys(inputs)) {
    const input = inputs[clientId];
    const ent = next.entities.find((x) => x.id === clientId && x.type === "player");
    if (!ent) continue;
    ent.vx = input.dx;
    ent.vy = input.dy;
    ent.x += ent.vx * dt;
    ent.y += ent.vy * dt;
  }

  // advance bullets
  for (let i = next.entities.length - 1; i >= 0; i--) {
    const e = next.entities[i];
    if (e.type === "bullet") {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (typeof e.lifetime === "number") {
        e.lifetime -= 1;
        if (e.lifetime <= 0) next.entities.splice(i, 1);
      }
    }
  }

  return next;
}

/**
 * Reconcile a compact snapshot by re-applying bufferedInputs (array of input maps).
 * Returns reconstructed state after applying all inputs deterministically.
 */
export function reconcile(snapshotJson: string, bufferedInputs: Record<string, Input>[], tickRate = 20): State {
  let state = deserializeSnapshot(snapshotJson);
  const dt = 1 / tickRate;
  for (const inputs of bufferedInputs) {
    state = applyInputsShallow(state, inputs, dt);
  }
  return state;
}