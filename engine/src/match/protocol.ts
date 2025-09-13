/**
 * Protocol emit helpers for match system events
 * Server-authoritative match lifecycle messaging
 */

import { Entity } from "../state";

export type InputMessage = {
  type: 'input';
  clientId: string;
  actions: Array<{
    seq: number;
    t: number; // tick
    move?: [number, number]; // optional movement vector
    shoot?: 1 | 0;
    aim?: [number, number];
    weaponSlot?: number;
    isAlternativeFire?: boolean;
    seed?: number; // for client-side prediction determinism
  }>;
};

export type SnapshotMessage = {
  type: 'snapshot';
  matchId: string;
  tick: number;
  snapshot: any; // Will be typed properly with Snapshot type
};

export type ProtocolMessage = InputMessage | SnapshotMessage;

// Removed message types: telemetry, spectator, complex match lifecycle messages

/**
 * Protocol emit helpers for match system
 */
export function createMatchProtocolHelpers(matchId: string, emit: (msg: any) => void) {
  return {
    emitSnapshot: (tick: number, snapshot: any) => {
      emit({
        type: 'snapshot',
        matchId,
        tick,
        snapshot,
      } as SnapshotMessage);
    }
  };
}