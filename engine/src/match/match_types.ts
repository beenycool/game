/**
 * Match system types and interfaces
 * Server-authoritative deterministic match lifecycle
 */

import { Entity } from "../state";
import { PRNG } from "../sim/prng";

export type GameMode = 'arena' | 'boxfight';

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  type: 'team' | 'random' | 'safe';
  team?: number;
  radius?: number;
}

export interface LootSpawn {
  id: string;
  x: number;
  y: number;
  table: string;
  respawnTicks?: number;
  lastSpawnTick?: number;
}

export interface RoundState {
  id: string;
  index: number;
  startTick?: number;
  durationTicks: number;
  timeLimitSec: number;
  state: 'pending' | 'active' | 'ended';
  winners?: string[];
}

export interface PlayerMatchState {
  playerId: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  shotsHit: number;
  timeAlive: number;
  score: number;
  respawnTick?: number;
  spawnPointId?: string;
}

export interface MatchConfig {
  id: string;
  seed: number;
  mode: GameMode;
  players: string[];
  roundsToWin: number; // First to this many wins (best-of-N)
  maxRoundTimeSec: number; // Maximum round duration in seconds
  respawnDelaySec: number;
  warmupTimeSec: number; // Deprecated - kept for backward compatibility
  spawnPoints: SpawnPoint[];
  lootSpawns: LootSpawn[];
}

export interface MatchState {
  config: MatchConfig;
  rounds: RoundState[];
  currentRoundIndex: number;
  matchState: 'lobby' | 'warmup' | 'in_progress' | 'round_end' | 'match_end';
  playerStates: Record<string, PlayerMatchState>;
  prngState?: number;
  telemetry: {
    matchStartTime: number;
    matchDuration: number;
    checksums: Record<number, string>;
  };
}

export interface ZoneSchedule {
  center: { x: number; y: number };
  radius: number;
  durationTicks: number;
  damagePerTick: number;
  startTick: number;
}

export interface MatchContext {
  world: any; // World from engine/src/sim/tick.ts
  match: MatchState;
  prng: PRNG;
  emit: (event: any) => void;
}

export interface ModeModule {
  initialize: (ctx: MatchContext) => void;
  onRoundStart: (ctx: MatchContext) => void;
  onTick: (ctx: MatchContext) => void;
  onRoundEnd: (ctx: MatchContext) => void;
  onMatchEnd: (ctx: MatchContext) => void;
  shouldEndRound: (ctx: MatchContext) => boolean;
  getSpawnPoint: (ctx: MatchContext, playerId: string) => SpawnPoint | null;
  handleRespawn: (ctx: MatchContext, playerId: string) => void;
}