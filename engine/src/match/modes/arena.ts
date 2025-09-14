/**
 * Arena mode implementation - 1v1 combat
 * Server-authoritative deterministic arena mode with team-based spawns
 */

import { Entity } from "../../state";
import { MatchContext, SpawnPoint, LootSpawn, ModeModule } from "../match_types";
import { createPRNG, PRNG } from "../../sim/prng";
import { createSpawnSystem, SpawnSystem } from "../../sim/spawn";

export class ArenaMode implements ModeModule {
  private spawnSystem: SpawnSystem;
  private prng: PRNG;

  constructor(private ctx: MatchContext) {
    this.prng = createPRNG(ctx.match.config.seed);
    this.spawnSystem = createSpawnSystem(ctx.world, this.prng);
  }

  initialize(ctx: MatchContext): void {
    // Set up arena boundaries and spawn points
    const spawnPoints = this.generateSpawnPoints();
    ctx.match.config.spawnPoints = spawnPoints;
    
    // Initialize players at opposite sides
    const players = ctx.match.config.players;
    if (players.length >= 2) {
      this.spawnSystem.spawnPlayer(players[0], spawnPoints[0]);
      this.spawnSystem.spawnPlayer(players[1], spawnPoints[1]);
    }
  }

  onRoundStart(ctx: MatchContext): void {
    // Reset player positions and state
    const players = ctx.match.config.players;
    const spawnPoints = ctx.match.config.spawnPoints;
    
    for (let i = 0; i < players.length; i++) {
      this.spawnSystem.spawnPlayer(players[i], spawnPoints[i % spawnPoints.length]);
    }
  }

  onTick(ctx: MatchContext): void {
    // Check for elimination conditions
    const players = ctx.match.config.players;
    const entities = ctx.world.state.entities;
    
    // Check if any player is out of bounds or dead
    for (const playerId of players) {
      const entity = entities.find((e: Entity) => e.id === playerId);
      if (!entity || entity.hp <= 0) {
        // Player eliminated
        this.handleElimination(ctx, playerId);
      }
    }
  }

  onRoundEnd(ctx: MatchContext): void {
    // Clean up and prepare for next round
    const survivors = this.getSurvivors(ctx);
    if (survivors.length === 1) {
      // Single survivor wins the round
      ctx.match.playerStates[survivors[0]].score += 100;
    }
  }

  onMatchEnd(ctx: MatchContext): void {
    // Final scoring and cleanup
    const scores = this.calculateFinalScores(ctx);
    for (const [playerId, score] of Object.entries(scores)) {
      ctx.match.playerStates[playerId].score = score;
    }
  }

  shouldEndRound(ctx: MatchContext): boolean {
    const players = ctx.match.config.players;
    const entities = ctx.world.state.entities;
    
    // Check if only one player remains
    let activeCount = 0;
    for (const playerId of players) {
      const entity = entities.find((e: Entity) => e.id === playerId);
      if (entity && entity.hp > 0) {
        activeCount++;
      }
    }
    
    return activeCount <= 1;
  }

  getSpawnPoint(ctx: MatchContext, playerId: string): SpawnPoint | null {
    // Simple spawn logic for arena - just use predefined points
    const spawnPoints = ctx.match.config.spawnPoints;
    const playerIndex = ctx.match.config.players.indexOf(playerId);
    if (playerIndex >= 0 && playerIndex < spawnPoints.length) {
      return spawnPoints[playerIndex];
    }
    return null;
  }

  handleRespawn(ctx: MatchContext, playerId: string): void {
    // Respawn player with a short invulnerability period
    const spawnPoint = this.getSpawnPoint(ctx, playerId);
    if (spawnPoint) {
      this.spawnSystem.spawnPlayer(playerId, spawnPoint);
      
      // Apply invulnerability for 3 seconds
      const entity = ctx.world.state.entities.find((e: Entity) => e.id === playerId);
      if (entity) {
        (entity as any).invulnerableUntil = ctx.world.state.tick + 60; // 3 seconds at 20Hz
      }
    }
  }

  private generateSpawnPoints(): SpawnPoint[] {
    // Simple arena spawn points - opposite sides
    return [
      {
        id: "team_0_spawn",
        x: 0,
        y: 0,
        type: "team" as const,
        team: 0,
        radius: 2
      },
      {
        id: "team_1_spawn",
        x: 100,
        y: 100,
        type: "team" as const,
        team: 1,
        radius: 2
      }
    ];
  }

  private handleElimination(ctx: MatchContext, playerId: string): void {
    // Handle player elimination (update score, etc.)
    ctx.match.playerStates[playerId].deaths++;
    
    // Check if match should end
    if (this.shouldEndRound(ctx)) {
      ctx.match.matchState = 'round_end';
    }
  }

  private getSurvivors(ctx: MatchContext): string[] {
    const survivors: string[] = [];
    const entities = ctx.world.state.entities;
    
    for (const playerId of ctx.match.config.players) {
      const entity = entities.find((e: Entity) => e.id === playerId);
      if (entity && entity.hp > 0) {
        survivors.push(playerId);
      }
    }
    
    return survivors;
  }

  private calculateFinalScores(ctx: MatchContext): Record<string, number> {
    const scores: Record<string, number> = {};
    const entities = ctx.world.state.entities;
    
    for (const playerId of ctx.match.config.players) {
      const entity = entities.find((e: Entity) => e.id === playerId);
      if (entity) {
        scores[playerId] = entity.hp > 0 ? 100 : 0;
      } else {
        scores[playerId] = 0;
      }
    }
    
    return scores;
  }
}

// Export as default for dynamic loading
export default ArenaMode;