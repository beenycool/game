/**
 * Server-authoritative match runner with deterministic lifecycle
 * Integrates with World/tick system and mode-specific rules
 */

import { World, createWorld } from "../sim/tick";
import { createPRNG, PRNG } from "../sim/prng";
import { computeStateChecksum } from "../sim/hash";
import { createPlayer, Entity, State } from "../state";
import {
  MatchConfig,
  MatchState,
  RoundState,
  PlayerMatchState,
  GameMode,
  SpawnPoint,
  MatchContext,
  ModeModule
} from "./match_types";
import { createMatchProtocolHelpers } from "./protocol";

export class MatchRunner {
  private world: World;
  private match: MatchState;
  private prng: PRNG;
  private modeModule: ModeModule;
  private isRunning = false;
  private emitCallback: (event: any) => void;
  private protocol: ReturnType<typeof createMatchProtocolHelpers>;
  private testMode: boolean;

  constructor(config: MatchConfig, emit: (event: any) => void, startTime?: number, testMode: boolean = false) {
    this.world = createWorld(config.seed, { tickRate: 20 });
    this.prng = createPRNG(config.seed);
    this.emitCallback = emit;
    this.isRunning = false;

    // Initialize match state with deterministic start time for testing
    this.match = {
      config,
      rounds: this.initializeRounds(config),
      currentRoundIndex: 0,
      matchState: 'lobby',
      playerStates: this.initializePlayerStates(config.players),
      telemetry: {
        matchStartTime: startTime || Date.now(),
        matchDuration: 0,
        checksums: {}
      }
    };

    // Initialize protocol helpers
    this.protocol = createMatchProtocolHelpers(config.id, emit);

    // Mode module will be loaded asynchronously in start() method
    this.modeModule = null as any; // Temporary assignment, will be set in start()

    // Store test mode for deterministic delays
    this.testMode = testMode;
  }

  private initializeRounds(config: MatchConfig): RoundState[] {
    const rounds: RoundState[] = [];
    // Create rounds until one player reaches roundsToWin (best-of-N)
    for (let i = 0; i < config.roundsToWin * 2 - 1; i++) {
      rounds.push({
        id: `round-${i}`,
        index: i,
        durationTicks: config.maxRoundTimeSec * 20, // Convert seconds to ticks
        timeLimitSec: config.maxRoundTimeSec,
        state: 'pending'
      });
    }
    return rounds;
  }

  private initializePlayerStates(playerIds: string[]): Record<string, PlayerMatchState> {
    const states: Record<string, PlayerMatchState> = {};
    for (const playerId of playerIds) {
      states[playerId] = {
        playerId,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        shotsFired: 0,
        shotsHit: 0,
        timeAlive: 0,
        score: 0
      };
    }
    return states;
  }

  private async loadModeModule(mode: GameMode): Promise<ModeModule> {
    // Dynamically import mode-specific module using ES modules
    switch (mode) {
      case 'arena':
        return new (await import('./modes/arena')).default(this.createContext());
      case 'boxfight':
        return new (await import('./modes/boxfight')).default(this.createContext());
      default:
        throw new Error(`Unknown game mode: ${mode}`);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Load mode-specific module asynchronously
    this.modeModule = await this.loadModeModule(this.match.config.mode);
    
    // Initialize mode module
    const ctx = this.createContext();
    this.modeModule.initialize(ctx);

    // Immediate start - skip warmup period
    this.match.matchState = 'in_progress';
    await this.runMatchLoop();
  }

  private createContext(): MatchContext {
    return {
      world: this.world,
      match: this.match,
      prng: this.prng,
      emit: this.emitCallback
    };
  }

  private async runMatchLoop(): Promise<void> {
    while (this.isRunning && this.match.currentRoundIndex < this.match.rounds.length) {
      const currentRound = this.match.rounds[this.match.currentRoundIndex];
      
      // Start round
      currentRound.state = 'active';
      currentRound.startTick = this.world.state.tick;
      
      const ctx = this.createContext();
      this.modeModule.onRoundStart(ctx);

      // Spawn players
      await this.spawnPlayers();

      // Run round tick loop
      await this.runRoundLoop();

      // End round
      currentRound.state = 'ended';
      this.match.matchState = 'round_end';
      
      this.modeModule.onRoundEnd(ctx);
      
      // Check if any player has reached roundsToWin (first to N wins)
      const roundWinners = currentRound.winners || [];
      const playerWins = this.calculatePlayerWins();
      
      const hasWinner = Object.values(playerWins).some(wins => wins >= this.match.config.roundsToWin);
      
      // Delay before next round or match end
      await this.delay(5000); // 5s scoreboard delay
      
      this.match.currentRoundIndex++;
      
      if (hasWinner || this.match.currentRoundIndex >= this.match.rounds.length) {
        // Match ended - either by reaching max rounds or a player winning
        break;
      } else {
        this.match.matchState = 'in_progress';
      }
    }

    // Match ended
    this.match.matchState = 'match_end';
    const ctx = this.createContext();
    this.modeModule.onMatchEnd(ctx);
    this.isRunning = false;
  }

  private calculatePlayerWins(): Record<string, number> {
    const wins: Record<string, number> = {};
    for (const playerId of this.match.config.players) {
      wins[playerId] = 0;
    }
    
    for (const round of this.match.rounds) {
      if (round.state === 'ended' && round.winners) {
        for (const winnerId of round.winners) {
          wins[winnerId] = (wins[winnerId] || 0) + 1;
        }
      }
    }
    
    return wins;
  }

  private async runRoundLoop(): Promise<void> {
    const currentRound = this.match.rounds[this.match.currentRoundIndex];
    const endTick = currentRound.startTick! + currentRound.durationTicks;
    
    while (this.isRunning && this.world.state.tick < endTick) {
      const ctx = this.createContext();
      
      // Check if round should end early (e.g., all players eliminated)
      if (this.modeModule.shouldEndRound(ctx)) {
        break;
      }

      // Process tick with empty inputs (would come from network in real implementation)
      this.processTick([]);

      // Handle mode-specific tick logic
      this.modeModule.onTick(ctx);

      // Store checksum for determinism verification
      this.match.telemetry.checksums[this.world.state.tick] = 
        computeStateChecksum(this.world.state);

      // Delay for tick rate (50ms for 20Hz)
      await this.delay(50);
    }
  }

  private processTick(inputs: any[] = []): void {
    // Advance world tick with provided inputs or empty
    this.world.tick(inputs);
    
    // Update player states (time alive, etc.)
    this.updatePlayerStates();
    
    // Advance PRNG state
    this.world.state.rng = this.prng.getState();
    this.prng.next();
  }

  private updatePlayerStates(): void {
    for (const playerId of this.match.config.players) {
      const playerState = this.match.playerStates[playerId];
      const playerEntity = this.world.state.entities.find(e => e.id === playerId);
      
      if (playerEntity && playerEntity.hp > 0) {
        playerState.timeAlive++;
      }
    }
  }

  private async spawnPlayers(): Promise<void> {
    const ctx = this.createContext();
    
    for (const playerId of this.match.config.players) {
      const spawnPoint = this.modeModule.getSpawnPoint(ctx, playerId);
      if (!spawnPoint) continue;

      const playerEntity = createPlayer(playerId, spawnPoint.x, spawnPoint.y);
      this.world.state.entities.push(playerEntity);

      // Update player state
      this.match.playerStates[playerId].spawnPointId = spawnPoint.id;

      // Emit spawn event using protocol helpers
      // removed message type — skip
    }
  }

  handlePlayerDeath(playerId: string): void {
    const playerState = this.match.playerStates[playerId];
    playerState.deaths++;
    playerState.timeAlive = 0;

    // Remove player entity
    const index = this.world.state.entities.findIndex(e => e.id === playerId);
    if (index !== -1) {
      this.world.state.entities.splice(index, 1);
    }

    // Emit despawn event using protocol helpers
    // removed message type — skip

    // Handle respawn based on mode
    const ctx = this.createContext();
    this.modeModule.handleRespawn(ctx, playerId);
  }

  handlePlayerKill(killerId: string, victimId: string): void {
    const killerState = this.match.playerStates[killerId];
    const victimState = this.match.playerStates[victimId];
    
    killerState.kills++;
    killerState.score += 100; // Base kill score
    
    victimState.deaths++;
    victimState.score -= 50; // Death penalty

    // Emit kill event using protocol helpers
    // removed message type — skip
  }

  stop(): void {
    this.isRunning = false;
  }

  getState(): MatchState {
    return { ...this.match };
  }

  // Public method for testing - get the internal world
  getWorld(): any {
    return this.world;
  }

  // Public method for testing - process one tick with inputs
  tick(inputs: any[]): void {
    this.processTick(inputs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Factory function
  static create(config: MatchConfig, emit: (event: any) => void, startTime?: number, testMode: boolean = false): MatchRunner {
    return new MatchRunner(config, emit, startTime, testMode);
  }
}