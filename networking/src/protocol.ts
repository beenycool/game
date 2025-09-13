// networking/src/protocol.ts
/**
 * Networking protocol types and serializers
 * Compact JSON-first format for 1v1 input-delta and snapshots.
 */

export type Vec2 = [number, number];

export type InputAction = {
  seq: number;
  t: number; // tick
  move?: Vec2; // optional movement vector
  shoot?: 1 | 0;
  aim?: Vec2;
  weaponSlot?: number;
  isAlternativeFire?: boolean;
  seed?: number; // for client-side prediction determinism
};

/**
 * Building action types
 */
export type BuildActionType = 'place' | 'edit' | 'remove' | 'preview';
export type BuildType = 'wall' | 'ramp' | 'floor';
export type MaterialType = 'wood' | 'brick' | 'metal';
export type BuildEditType = 'window' | 'door' | 'triangle';

/**
 * Client to Server: Building action message
 */
export type BuildActionMsg = {
  type: 'build_action';
  tick: number;
  clientId: string;
  action: BuildActionType;
  buildType?: BuildType;
  material?: MaterialType;
  gridPos?: Vec2; // Grid coordinates [x, y]
  rot?: number; // Rotation in degrees (0, 90, 180, 270)
  buildId?: string; // For edit/remove actions
  editType?: BuildEditType; // For edit actions
  turbo?: boolean; // For turbo building mode
  turboEndPos?: Vec2; // End position for turbo building
};

/**
 * Server to Clients: Build piece spawned
 */
export type BuildSpawnMsg = {
  type: 'build_spawn';
  tick: number;
  buildId: string;
  ownerId: string;
  buildType: BuildType;
  material: MaterialType;
  position: Vec2; // World coordinates
  dimensions: Vec2; // Width, height
  rotation: number;
  hp: number;
  editState: number; // Bitflags for applied edits
};

/**
 * Server to Clients: Build piece edited
 */
export type BuildEditMsg = {
  type: 'build_edit';
  tick: number;
  buildId: string;
  editType: BuildEditType;
  newHp: number;
  newEditState: number;
};

/**
 * Server to Clients: Build piece destroyed
 */
export type BuildDestroyMsg = {
  type: 'build_destroy';
  tick: number;
  buildId: string;
  ownerId: string;
};

/**
 * Server to Client: Build preview acknowledgment
 */
export type BuildPreviewAckMsg = {
  type: 'build_preview_ack';
  tick: number;
  clientId: string;
  success: boolean;
  gridPos?: Vec2;
  worldPos?: Vec2;
  error?: string;
};

/**
 * Server to Clients: Material/HP update for build piece
 */
export type BuildMaterialUpdateMsg = {
  type: 'build_material_update';
  tick: number;
  buildId: string;
  material: MaterialType;
  hp: number;
  editState: number;
};

export type InputDelta = {
  type: 'input';
  clientId: string;
  actions: InputAction[];
};

export type EntityState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  inventory?: any; // weapon and ammo state
};

export type Snapshot = {
  type: 'snapshot';
  t: number; // tick
  entities: EntityState[];
};

export type ProjectileSpawnMsg = {
  type: 'projectile_spawn';
  tick: number;
  projectileId: string;
  weaponId: string;
  ownerId: string;
  position: Vec2;
  direction: Vec2;
  speed: number;
  isHitscan: boolean;
};

export type HitEventMsg = {
  type: 'hit_event';
  tick: number;
  projectileId: string;
  entityId: string;
  damage: number;
  position: Vec2;
  isHeadshot: boolean;
};

export type DamageEventMsg = {
  type: 'damage_event';
  tick: number;
  entityId: string;
  damage: number;
  newHp: number;
  attackerId: string;
  weaponId: string;
};

export type WeaponSwapEventMsg = {
  type: 'weapon_swap';
  tick: number;
  clientId: string;
  weaponSlot: number;
  weaponId: string;
};

export type AmmoUpdateMsg = {
  type: 'ammo_update';
  tick: number;
  clientId: string;
  weaponId: string;
  currentAmmo: number;
  reserveAmmo: number;
};

export type CandidateMsg = {
  type: 'candidate';
  clientId: string;
  candidate: any;
};

export type HelloMsg = { type: 'hello'; clientId: string };

export type GameMode = '1v1' | 'box' | 'build' | 'zone' | 'aim';

export type MatchStartMsg = {
  type: 'match_start';
  matchId: string;
  mode: GameMode;
  seed: number;
  players: string[];
  roundTimeSec: number;
  maxRounds: number;
};

export type RoundStartMsg = {
  type: 'round_start';
  matchId: string;
  roundIndex: number;
  roundId: string;
  startTick: number;
  durationTicks: number;
};

export type RoundEndMsg = {
  type: 'round_end';
  matchId: string;
  roundIndex: number;
  roundId: string;
  winners: string[];
  playerStates: Record<string, any>;
};

export type MatchEndMsg = {
  type: 'match_end';
  matchId: string;
  winners: string[];
  finalPlayerStates: Record<string, any>;
};

export type MatchStateUpdateMsg = {
  type: 'match_state_update';
  matchId: string;
  matchState: 'lobby' | 'warmup' | 'in_progress' | 'round_end' | 'match_end';
  currentRoundIndex: number;
  timeRemainingSec: number;
};

export type PlayerScoreUpdateMsg = {
  type: 'player_score_update';
  matchId: string;
  playerId: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  shotsHit: number;
  score: number;
};

export type ZoneUpdateMsg = {
  type: 'zone_update';
  matchId: string;
  center: { x: number; y: number };
  radius: number;
  damagePerTick: number;
  nextShrinkTick?: number;
};

export type TargetSpawnMsg = {
  type: 'target_spawn';
  matchId: string;
  targetId: string;
  x: number;
  y: number;
  targetType: 'static' | 'moving' | 'popup';
  movementPattern?: 'horizontal' | 'vertical' | 'circular';
  speed?: number;
  points: number;
};

export type TargetHitMsg = {
  type: 'target_hit';
  matchId: string;
  targetId: string;
  playerId: string;
  hitPosition: { x: number; y: number };
  accuracy: number;
  pointsEarned: number;
};

export type TargetDestroyMsg = {
  type: 'target_destroy';
  matchId: string;
  targetId: string;
  playerId: string;
  pointsEarned: number;
};

export type MatchTelemetryMsg = {
  type: 'match_telemetry';
  matchId: string;
  tick: number;
  checksum: string;
  entityCount: number;
  playerCount: number;
};

export type MatchSpawnMsg = {
  type: 'match_spawn';
  matchId: string;
  tick: number;
  entityId: string;
  x: number;
  y: number;
  spawnPointId?: string;
  invulnerableMs?: number;
};

export type MatchDespawnMsg = {
  type: 'match_despawn';
  matchId: string;
  tick: number;
  entityId: string;
};

export type MatchKillMsg = {
  type: 'match_kill';
  matchId: string;
  tick: number;
  killerId: string;
  victimId: string;
};

export type LootSpawnMsg = {
  type: 'loot_spawn';
  matchId: string;
  tick: number;
  lootId: string;
  x: number;
  y: number;
  table: string;
};

export type SpectateMsg = {
  type: 'spectate';
  matchId: string;
  clientId: string;
  spectating: boolean;
  target?: string;
};

export type SnapshotMsg = {
  type: 'snapshot';
  matchId: string;
  tick: number;
  snapshot: any;
};

export type Envelope = InputDelta | Snapshot;

// simple JSON serializers (replace with CBOR/protobuf later)
export function encodeMessage(msg: Envelope): string {
  return JSON.stringify(msg);
}

export function decodeMessage(s: string): Envelope {
  return JSON.parse(s) as Envelope;
}

// compact examples (exported for tests/examples)
export const exampleInput: InputDelta = {
  type: 'input',
  clientId: 'u-1',
  actions: [{
    seq: 5012,
    t: 102345,
    move: [1, 0],
    shoot: 1,
    aim: [0.7, 0.3],
    weaponSlot: 0,
    seed: 12345
  }],
};

export const exampleSnapshot: Snapshot = {
  type: 'snapshot',
  t: 102360,
  entities: [
    { id: 'u-1', x: 1024, y: 512, vx: 10, vy: 0, hp: 85, inventory: { weapons: [], activeWeaponSlot: 0, reserveAmmo: {} } },
    { id: 'u-2', x: 980, y: 540, vx: -5, vy: 0, hp: 100, inventory: { weapons: [], activeWeaponSlot: 0, reserveAmmo: {} } },
  ],
};

export const exampleProjectileSpawn: ProjectileSpawnMsg = {
  type: 'projectile_spawn',
  tick: 102361,
  projectileId: 'proj_u1_12345',
  weaponId: 'ar_standard',
  ownerId: 'u-1',
  position: [1024, 512],
  direction: [0.7, 0.3],
  speed: 50,
  isHitscan: false
};

export const exampleHitEvent: HitEventMsg = {
  type: 'hit_event',
  tick: 102362,
  projectileId: 'proj_u1_12345',
  entityId: 'u-2',
  damage: 25,
  position: [980, 540],
  isHeadshot: false
};

export const exampleBuildAction: BuildActionMsg = {
  type: 'build_action',
  tick: 102370,
  clientId: 'u-1',
  action: 'place',
  buildType: 'wall',
  material: 'wood',
  gridPos: [10, 5],
  rot: 0,
  turbo: false
};

export const exampleBuildSpawn: BuildSpawnMsg = {
  type: 'build_spawn',
  tick: 102371,
  buildId: 'build_u1_102371_1234',
  ownerId: 'u-1',
  buildType: 'wall',
  material: 'wood',
  position: [20, 10], // World coordinates
  dimensions: [2, 4], // Width, height in world units
  rotation: 0,
  hp: 100,
  editState: 0
};

export const exampleBuildEdit: BuildEditMsg = {
  type: 'build_edit',
  tick: 102380,
  buildId: 'build_u1_102371_1234',
  editType: 'window',
  newHp: 80,
  newEditState: 1 // Window flag set
};

export const exampleBuildDestroy: BuildDestroyMsg = {
  type: 'build_destroy',
  tick: 102390,
  buildId: 'build_u1_102371_1234',
  ownerId: 'u-1'
};

export const exampleBuildPreviewAck: BuildPreviewAckMsg = {
  type: 'build_preview_ack',
  tick: 102365,
  clientId: 'u-1',
  success: true,
  gridPos: [10, 5],
  worldPos: [20, 10]
};

export const exampleInputString = encodeMessage(exampleInput);
export const exampleSnapshotString = encodeMessage(exampleSnapshot);