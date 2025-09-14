/**
 * Projectile physics and hit detection system.
 * Handles deterministic projectile simulation and collision detection.
 */

import { PRNG } from "./prng";
import { AABB, intersects } from "../physics/aabb";
import { Entity } from "../state";
import { ProjectileData } from "../weapon/weapon";

export interface Projectile extends ProjectileData {
  lifetime: number;
  distanceTraveled: number;
}

export interface HitResult {
  hit: boolean;
  entityId?: string;
  damage?: number;
  position?: { x: number; y: number };
  isHeadshot?: boolean;
  distance?: number;
}

export interface ProjectileSimulationResult {
  projectiles: Projectile[];
  hits: HitResult[];
}

export function createProjectile(projectileData: ProjectileData, prng: PRNG): Projectile {
  return {
    ...projectileData,
    lifetime: projectileData.isHitscan ? 1 : 120, // Hitscan projectiles live 1 tick, others 6 seconds at 20 tick rate
    distanceTraveled: 0
  };
}

export function simulateProjectile(
  projectile: Projectile,
  entities: Entity[],
  dt: number,
  prng: PRNG
): { projectile: Projectile; hitResult?: HitResult } {
  if (projectile.isHitscan) {
    // Hitscan weapons - immediate hit detection
    return simulateHitscan(projectile, entities, prng);
  } else {
    // Projectile weapons - movement and collision detection
    return simulateProjectileMovement(projectile, entities, dt, prng);
  }
}

function simulateHitscan(
  projectile: Projectile,
  entities: Entity[],
  prng: PRNG
): { projectile: Projectile; hitResult?: HitResult } {
  const hitResult = detectHitscanHit(projectile, entities, prng);
  return {
    projectile: { ...projectile, lifetime: 0 }, // Hitscan projectiles are consumed immediately
    hitResult
  };
}

function simulateProjectileMovement(
  projectile: Projectile,
  entities: Entity[],
  dt: number,
  prng: PRNG
): { projectile: Projectile; hitResult?: HitResult } {
  // Move projectile
  const newX = projectile.position.x + projectile.direction.x * projectile.speed * dt;
  const newY = projectile.position.y + projectile.direction.y * projectile.speed * dt;
  const distanceMoved = Math.sqrt(
    Math.pow(newX - projectile.position.x, 2) + Math.pow(newY - projectile.position.y, 2)
  );

  const updatedProjectile: Projectile = {
    ...projectile,
    position: { x: newX, y: newY },
    distanceTraveled: projectile.distanceTraveled + distanceMoved,
    lifetime: projectile.lifetime - 1
  };

  // Check for collisions
  const hitResult = detectProjectileHit(updatedProjectile, entities, prng);

  return {
    projectile: updatedProjectile,
    hitResult
  };
}

function detectHitscanHit(
  projectile: Projectile,
  entities: Entity[],
  prng: PRNG
): HitResult | undefined {
  const rayOrigin = projectile.position;
  const rayDir = projectile.direction;
  const maxDistance = projectile.range;

  let closestHit: HitResult | undefined;
  let closestDistance = Infinity;

  for (const entity of entities) {
    if (entity.id === projectile.ownerId) continue; // Don't hit owner

    const hitResult = raycastVsEntity(rayOrigin, rayDir, entity, maxDistance, prng);
    if (hitResult.hit && hitResult.distance! < closestDistance) {
      closestHit = hitResult;
      closestDistance = hitResult.distance!;
    }
  }

  return closestHit;
}

function detectProjectileHit(
  projectile: Projectile,
  entities: Entity[],
  prng: PRNG
): HitResult | undefined {
  const projectileAABB: AABB = {
    x: projectile.position.x - projectile.pellets * 0.1,
    y: projectile.position.y - projectile.pellets * 0.1,
    w: projectile.pellets * 0.2,
    h: projectile.pellets * 0.2
  };

  for (const entity of entities) {
    if (entity.id === projectile.ownerId) continue; // Don't hit owner

    const entityAABB: AABB = {
      x: entity.x - entity.w / 2,
      y: entity.y - entity.h / 2,
      w: entity.w,
      h: entity.h
    };

    if (intersects(projectileAABB, entityAABB)) {
      return {
        hit: true,
        entityId: entity.id,
        damage: calculateDamage(projectile, entity, prng),
        position: { ...projectile.position },
        isHeadshot: isHeadshot(projectile.position, entity, prng)
      };
    }
  }

  return undefined;
}

function raycastVsEntity(
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  entity: Entity,
  maxDistance: number,
  prng: PRNG
): HitResult {
  const entityAABB: AABB = {
    x: entity.x - entity.w / 2,
    y: entity.y - entity.h / 2,
    w: entity.w,
    h: entity.h
  };

  // Simple ray-AABB intersection
  const t1 = (entityAABB.x - origin.x) / direction.x;
  const t2 = (entityAABB.x + entityAABB.w - origin.x) / direction.x;
  const t3 = (entityAABB.y - origin.y) / direction.y;
  const t4 = (entityAABB.y + entityAABB.h - origin.y) / direction.y;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

  if (tmax < 0 || tmin > tmax || tmin > maxDistance) {
    return { hit: false };
  }

  const hitPosition = {
    x: origin.x + direction.x * tmin,
    y: origin.y + direction.y * tmin
  };

  return {
    hit: true,
    entityId: entity.id,
    distance: tmin,
    position: hitPosition,
    isHeadshot: isHeadshot(hitPosition, entity, prng)
  };
}

function isHeadshot(
  hitPosition: { x: number; y: number },
  entity: Entity,
  prng: PRNG
): boolean {
  // Simple head detection - upper third of entity is head
  const headHeight = entity.h / 3;
  const headTop = entity.y - entity.h / 2;
  const headBottom = headTop + headHeight;

  return hitPosition.y >= headTop && hitPosition.y <= headBottom;
}

function calculateDamage(
  projectile: Projectile,
  entity: Entity,
  prng: PRNG
): number {
  let damage = projectile.damage;

  // Apply damage falloff
  if (projectile.distanceTraveled > projectile.range * 0.5) {
    const falloffFactor = 1 - Math.min(1, (projectile.distanceTraveled - projectile.range * 0.5) / (projectile.range * 0.5));
    damage *= falloffFactor;
  }

  // Apply headshot multiplier
  if (isHeadshot(projectile.position, entity, prng)) {
    damage *= projectile.headshotMultiplier;
  }

  // Add small random variation (±5%)
  const variation = 1 + (prng.nextFloat() - 0.5) * 0.1;
  damage *= variation;

  return Math.max(1, Math.round(damage));
}

export function simulateProjectiles(
  projectiles: Projectile[],
  entities: Entity[],
  dt: number,
  prng: PRNG
): ProjectileSimulationResult {
  const results: ProjectileSimulationResult = {
    projectiles: [],
    hits: []
  };

  for (const projectile of projectiles) {
    if (projectile.lifetime <= 0 || projectile.distanceTraveled >= projectile.range) {
      continue; // Skip expired projectiles
    }

    const simulationResult = simulateProjectile(projectile, entities, dt, prng);
    
    if (simulationResult.hitResult) {
      results.hits.push(simulationResult.hitResult);
    }

    if (simulationResult.projectile.lifetime > 0 && 
        simulationResult.projectile.distanceTraveled < simulationResult.projectile.range) {
      results.projectiles.push(simulationResult.projectile);
    }
  }

  return results;
}