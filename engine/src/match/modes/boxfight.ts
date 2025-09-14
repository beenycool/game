/**
 * Boxfight mode implementation - Small contained arena with immediate combat
 * Features fast-paced combat with instant respawns and build limitations
 */

import { Entity } from "../../state";
import { MatchContext, SpawnPoint, LootSpawn, ModeModule } from "../match_types";
import { createPRNG, PRNG } from "../../sim/prng";
import { createSpawnSystem, SpawnSystem } from "../../sim/spawn";

export class BoxfightMode implements ModeModule {
  private spawnSystem: SpawnSystem;
  private prng: PRNG;
  private respawnTimers: Map<string, number> = new Map();

  constructor(private ctx: MatchContext) {
    this.prng = createPRNG(ctx.match.config.seed);
    this.spawnSystem = createSpawnSystem(ctx.world, this.prng);
  }

  initialize(ctx: MatchContext): void {
    // Set up boxfight arena with predefined spawn points
    const spawnPoints = this.generateSpawnPoints();
    ctx.match.config.spawnPoints = spawnPoints;
    
    // Initialize players with preset loadouts
    const players = ctx.match.config.players;
    for (let i = 0; i < players.length; i++) {
      this.spawnPlayerWithLoadout(players[i], spawnPoints[i % spawnPoints.length]);
    }
  }

  onRoundStart(ctx: MatchContext): void {
    // Reset player positions, state, and loadouts
    const players = ctx.match.config.players;
    const spawnPoints = ctx.match.config.spawnPoints;
    
    for (let i = 0; i < players.length; i++) {
      this.spawnPlayerWithLoadout(players[i], spawnPoints[i % spawnPoints.length]);
    }
    
    // Clear respawn timers
    this.respawnTimers.clear();
  }

  onTick(ctx: MatchContext): void {
    // Check for eliminations and handle respawns
    const players = ctx.match.config.players;
    const entities = ctx.world.state.entities;
    
    for (const playerId of players) {
      const entity = entities.find((e: Entity) => e.id === playerId);
      
      // Handle player elimination
      if (!entity || entity.hp <= 0) {
        this.handleElimination(ctx, playerId);
      }
      
      // Handle respawn timers
      this.handleRespawnTimers(ctx, playerId);
    }
  }

  onRoundEnd(ctx: MatchContext): void {
    // Clean up and prepare for next round
    const survivors = this.getSurvivors(ctx);
    if (survivors.length === 1) {
      // Single survivor wins the round
      ctx.match.playerStates[survivors[0]].score += 50;
    }
    
    // Clear respawn timers
    this.respawnTimers.clear();
  }

  onMatchEnd(ctx: MatchContext): void {
    // Final scoring based on eliminations
    const scores = this.calculateFinalScores(ctx);
    for (const [playerId, score] of Object.entries(scores)) {
      ctx.match.playerStates[playerId].score = score;
    }
    
    // Clear respawn timers
    this.respawnTimers.clear();
  }

  shouldEndRound(ctx: MatchContext): boolean {
    // Boxfight rounds typically have time limits, but can also end by elimination
    const round = ctx.match.rounds[ctx.match.currentRoundIndex];
    const currentTick = ctx.world.state.tick;
    const roundStartTick = round.startTick || 0;
    
    // Check if round time limit reached (default 90 seconds at 20Hz = 1800 ticks)
    if (currentTick - roundStartTick >= 1800) {
      return true;
    }
    
    // Also check if only one player remains
    const players = ctx.match.config.players;
    const entities = ctx.world.state.entities;
    
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
    // Simple spawn logic - use predefined points
    const spawnPoints = ctx.match.config.spawnPoints;
    const playerIndex = ctx.match.config.players.indexOf(playerId);
    if (playerIndex >= 0 && playerIndex < spawnPoints.length) {
      return spawnPoints[playerIndex];
    }
    return null;
  }

  handleRespawn(ctx: MatchContext, playerId: string): void {
    // Boxfight has instant respawn after short delay (3 seconds)
    const spawnPoint = this.getSpawnPoint(ctx, playerId);
    if (spawnPoint) {
      // Set respawn timer (3 seconds at 20Hz = 60 ticks)
      this.respawnTimers.set(playerId, ctx.world.state.tick + 60);
    }
  }

  private spawnPlayerWithLoadout(playerId: string, spawnPoint: SpawnPoint): void {
    // Spawn player with preset boxfight loadout
    const result = this.spawnSystem.spawnPlayer(playerId, spawnPoint);
    if (result.success) {
      const entity = this.ctx.world.state.entities.find((e: Entity) => e.id === playerId);
      if (entity) {
        // Give player boxfight loadout (shotgun, SMG, materials)
        entity.inventory = {
          weapons: [
            { id: 'shotgun', ammo: 8, maxAmmo: 8 },
            { id: 'smg', ammo: 30, maxAmmo: 30 }
          ],
          activeWeaponSlot: 0,
          materials: { wood: 100, brick: 100, metal: 100 },
          reserveAmmo: { shotgun: 24, smg: 90 }
        };
      }
    }
  }

  private handleRespawnTimers(ctx: MatchContext, playerId: string): void {
    // Check and handle respawn timers
    const respawnTick = this.respawnTimers.get(playerId);
    if (respawnTick && ctx.world.state.tick >= respawnTick) {
      const spawnPoint = this.getSpawnPoint(ctx, playerId);
      if (spawnPoint) {
        this.spawnPlayerWithLoadout(playerId, spawnPoint);
        this.respawnTimers.delete(playerId);
        
        // Apply brief invulnerability after respawn
        const entity = ctx.world.state.entities.find((e: Entity) => e.id === playerId);
        if (entity) {
          (entity as any).invulnerableUntil = ctx.world.state.tick + 30; // 1.5 seconds
        }
      }
    }
  }

  private generateSpawnPoints(): SpawnPoint[] {
    // Boxfight spawn points - corners of a small box arena
    return [
      { 
        id: "box_corner_1", 
        x: 10, 
        y: 10, 
        type: "random" as const,
        radius: 1
      },
      { 
        id: "box_corner_2", 
        x: 90, 
        y: 10, 
        type: "random" as const,
        radius: 1
      },
      { 
        id: "box_corner_3", 
        x: 10, 
        y: 90, 
        type: "random" as const,
        radius: 1
      },
      { 
        id: "box_corner_4", 
        x: 90, 
        y: 90, 
        type: "random" as const,
        radius: 1
      }
    ];
  }

  private handleElimination(ctx: MatchContext, playerId: string): void {
    // Handle player elimination
    const entity = ctx.world.state.entities.find((e: Entity) => e.id === playerId);
    if (entity && entity.hp <= 0) {
      ctx.match.playerStates[playerId].deaths++;
      
      // Remove entity and schedule respawn
      const index = ctx.world.state.entities.findIndex((e: Entity) => e.id === playerId);
      if (index !== -1) {
        ctx.world.state.entities.splice(index, 1);
      }
      
      this.handleRespawn(ctx, playerId);
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
    
    // Score based on kills in boxfight mode
    for (const playerId of ctx.match.config.players) {
      scores[playerId] = ctx.match.playerStates[playerId].kills * 25;
    }
    
    return scores;
  }
}

// Export as default for dynamic loading
export default BoxfightMode;