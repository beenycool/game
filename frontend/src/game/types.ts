export interface GameState {
  builds: any[];
  players: any[];
  projectiles: any[];
}

export interface InputMessage {
  type: 'input';
  playerId: string;
  tick: number;
  input: any;
}

export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  state: GameState;
}

// Additional type definitions as needed
export interface BuildPiece {
  // Define properties as needed
}