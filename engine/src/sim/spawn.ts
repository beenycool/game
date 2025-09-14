/**
 * Deterministic spawn system for players, items, and other entities
 * Uses match PRNG for deterministic spawning across all clients
 */

import { Entity } from "../state";
import { PRNG } from "./prng";
import { World, createWorld } from "./tick";
import { SpawnPoint, LootSpawn } from "../match/match_types";

export interface SpawnResult {
  success: boolean;
  reason?: string;
  spawnPoint?: SpawnPoint;
}

export interface SpawnSystem {
  spawnPlayer(playerId: string, spawnPoint: SpawnPoint): SpawnResult;
  spawnItem(lootSpawn: LootSpawn): SpawnResult;
  findSpawnPoint(playerId: string): SpawnPoint | null;
  canSpawnAt(x: number, y: number, radius: number): boolean;
}

export class DefaultSpawnSystem implements SpawnSystem {
  private world: World;
  private prng: PRNG;
  private spawnPoints: Map<string, SpawnPoint> = new Map();
  private activeSpawns: Map<string, { entity: Entity; spawnTime: number }> = new Map();

  constructor(world: World, prng: PRNG) {
    this.world = world;
    this.prng = prng;
  }

  spawnPlayer(playerId: string, spawnPoint: SpawnPoint): SpawnResult {
    // Check if spawn point is available (no overlapping entities)
    if (!this.canSpawnAt(spawnPoint.x, spawnPoint.y, 1.0)) { // 1.0 radius for players
      return { 
        success: false, 
        reason: "Spawn point occupied" 
      };
    }

    // Create player entity at spawn point
    const playerEntity: Entity = {
      id: playerId,
      type: "player",
      x: spawnPoint.x,
      y: spawnPoint.y,
      w: 1,
      h: 1.8,
      vx: 0,
      vy: 0,
      hp: 100,
      team: spawnPoint.type === "team" ? spawnPoint.team : undefined
    };

    // Add to world
    this.world.state.entities.push(playerEntity);

    // Register spawn
    this.activeSpawns.set(playerId, { 
      entity: playerEntity, 
      spawnTime: Date.now() 
    });

    return { success: true, spawnPoint };
  }

  spawnItem(lootSpawn: LootSpawn): SpawnResult {
    // Check if spawn point is available
    if (!this.canSpawnAt(lootSpawn.x, lootSpawn.y, 0.5)) { // 0.5 radius for items
      return { 
        success: false, 
        reason: "Spawn point occupied" 
      };
    }

    // Create item entity
    const itemEntity: Entity = {
      id: `item_${Date.now()}_${this.prng.nextInt(0, 10000)}`,
      type: "item",
      x: lootSpawn.x,
      y: lootSpawn.y,
      w: 0.5,
      h: 0.5,
      vx: 0,
      vy: 0,
      hp: 1,
      itemType: lootSpawn.table,
      respawnTime: lootSpawn.respawnTicks
    };

    // Add to world
    this.world.state.entities.push(itemEntity);

    return { success: true };
  }

  findSpawnPoint(playerId: string): SpawnPoint | null {
    // Simple implementation: find nearest spawn point that's not occupied
    const playerPos = this.getPlayerPosition(playerId);
    if (!playerPos) return null;

    let closestSpawn: SpawnPoint | null = null;
    let minDistance = Infinity;

    for (const spawn of this.spawnPoints.values()) {
      if (this.canSpawnAt(spawn.x, spawn.y, 1.0)) {
        const distance = Math.sqrt(
          Math.pow(spawn.x - playerPos.x, 2) + 
          Math.pow(spawn.y - playerPos.y, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestSpawn = spawn;
        }
      }
    }

    return closestSpawn;
  }

  canSpawnAt(x: number, y: number, radius: number): boolean {
    // Check if any entity is within the exclusion radius
    for (const entity of this.world.state.entities) {
      if (entity.type === "player" || entity.type === "item") {
        const distance = Math.sqrt(
          Math.pow(entity.x - x, 2) + 
          Math.pow(entity.y - y, 2)
        );
        
        if (distance < radius) {
          return false;
        }
      }
    }
    return true;
  }

  private getPlayerPosition(playerId: string): { x: number; y: number } | null {
    const entity = this.world.state.entities.find(e => e.id === playerId);
    if (!entity) return null;
    return { x: entity.x, y: entity.y };
  }

  // Handle respawn with delay
  scheduleRespawn(playerId: string, delayTicks: number): void {
    setTimeout(() => {
      const spawnPoint = this.findSpawnPoint(playerId);
      if (spawnPoint) {
        this.spawnPlayer(playerId, spawnPoint);
      }
    }, delayTicks * 50); // 50ms per tick
  }

  // Handle loot spawning with match PRNG
  scheduleLootSpawn(lootSpawn: LootSpawn, delayTicks: number): void {
    setTimeout(() => {
      this.spawnItem(lootSpawn);
    }, delayTicks * 50);
  }

  // Initialize spawn points for a match
  initializeSpawnPoints(matchConfig: any): void {
    // Implementation depends on game mode
    // For example, for a team-based mode:
    this.spawnPoints.clear();
    
    const teamCount = 2; // Example
    const playersPerTeam = matchConfig.players.length / teamCount;
    
    for (let team = 0; team < teamCount; team++) {
      for (let i = 0; i < playersPerTeam; i++) {
        const spawn: SpawnPoint = {
          id: `team_${team}_spawn_${i}`,
          x: team * 100 + i * 20, // Example positions
          y: 50 + i * 20,
          type: "team",
          team: team
        };
        this.spawnPoints.set(spawn.id, spawn);
      }
    }
  }

  // Cleanup
  destroy(): void {
    this.spawnPoints.clear();
    this.activeSpawns.clear();
  }
}

// Factory function
export function createSpawnSystem(world: World, prng: PRNG): SpawnSystem {
  return new DefaultSpawnSystem(world, prng);
}