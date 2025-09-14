/**
 * Deterministic player movement system.
 * Handles ground movement, air movement, jumping, gravity, crouch sliding, and fall damage.
 * All functions are deterministic and use seeded PRNG for any randomness.
 */

import { Entity, Input } from "../state";
import { PRNG } from "../sim/prng";
import { intersects, AABB } from "../physics/aabb";

// Movement constants
const GRAVITY = 20.0; // units/second^2
const JUMP_IMPULSE = 8.0; // units/second
const FRICTION = 15.0; // ground friction coefficient
const AIR_RESISTANCE = 2.0; // air resistance coefficient
const SLIDE_IMPULSE = 3.0; // crouch slide impulse
const FALL_DAMAGE_THRESHOLD = 10.0; // fall distance before damage starts
const FALL_DAMAGE_RATE = 5.0; // damage per unit of excess fall distance

/**
 * Apply ground movement mechanics including acceleration, momentum, and speed modifiers
 */
export function applyGroundMovement(entity: Entity, input: Input, dt: number, prng: PRNG): void {
  if (!entity.onGround) return;

  const maxSpeed = entity.maxWalkSpeed || 5.0;
  const accel = entity.walkAccel || 20.0;
  
  // Apply speed multipliers
  let speedMultiplier = 1.0;
  if (entity.isCrouching) {
    speedMultiplier *= entity.crouchSpeedMultiplier || 0.5;
  }
  if (entity.isSprinting && !entity.isCrouching) {
    speedMultiplier *= entity.sprintSpeedMultiplier || 1.8;
  }
  
  const targetSpeed = maxSpeed * speedMultiplier;
  
  // Calculate desired velocity from input
  const inputMagnitude = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
  let desiredVx = 0;
  let desiredVy = 0;
  
  if (inputMagnitude > 0) {
    // Normalize input and scale by target speed
    desiredVx = (input.dx / inputMagnitude) * targetSpeed;
    desiredVy = (input.dy / inputMagnitude) * targetSpeed;
  }
  
  // Apply acceleration towards desired velocity
  const dvx = desiredVx - entity.vx;
  const dvy = desiredVy - entity.vy;
  
  entity.vx += Math.sign(dvx) * Math.min(Math.abs(dvx), accel * dt);
  entity.vy += Math.sign(dvy) * Math.min(Math.abs(dvy), accel * dt);
  
  // Apply friction when no input
  if (inputMagnitude === 0) {
    const frictionForce = FRICTION * dt;
    if (Math.abs(entity.vx) < frictionForce) {
      entity.vx = 0;
    } else {
      entity.vx -= Math.sign(entity.vx) * frictionForce;
    }
    
    if (Math.abs(entity.vy) < frictionForce) {
      entity.vy = 0;
    } else {
      entity.vy -= Math.sign(entity.vy) * frictionForce;
    }
  }
  
  // Update momentum for crouch-slide calculations
  const currentSpeed = Math.sqrt(entity.vx * entity.vx + entity.vy * entity.vy);
  entity.movementMomentum = currentSpeed;
}

/**
 * Apply air movement with reduced control
 */
export function applyAirMovement(entity: Entity, input: Input, dt: number): void {
  if (entity.onGround) return;
  
  const maxSpeed = entity.maxWalkSpeed || 5.0;
  const airControl = entity.airControlFactor || 0.3;
  const accel = (entity.walkAccel || 20.0) * airControl;
  
  // Calculate desired velocity from input (reduced control in air)
  const inputMagnitude = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
  let desiredVx = 0;
  let desiredVy = 0;
  
  if (inputMagnitude > 0) {
    desiredVx = (input.dx / inputMagnitude) * maxSpeed;
    desiredVy = (input.dy / inputMagnitude) * maxSpeed;
  }
  
  // Apply reduced acceleration
  const dvx = desiredVx - entity.vx;
  const dvy = desiredVy - entity.vy;
  
  entity.vx += Math.sign(dvx) * Math.min(Math.abs(dvx), accel * dt);
  entity.vy += Math.sign(dvy) * Math.min(Math.abs(dvy), accel * dt);
  
  // Apply air resistance
  const resistance = AIR_RESISTANCE * dt;
  entity.vx *= Math.max(0, 1 - resistance);
  entity.vy *= Math.max(0, 1 - resistance);
}

/**
 * Handle jump initiation
 */
export function jump(entity: Entity, input: Input, worldTick: number): void {
  // Only jump if on ground and jump input is pressed
  if (!entity.onGround || !input.jump) return;
  
  // Prevent double jumping unless jumpStartTick is cleared
  if (entity.jumpState?.jumpStartTick === worldTick) return;
  
  // Set vertical velocity and jump state
  entity.vy = JUMP_IMPULSE;
  entity.onGround = false;
  entity.jumpState = {
    jumpStartTick: worldTick,
    jumpVel: JUMP_IMPULSE
  };
  
  // Record fall start position for damage calculation
  entity.fallStartY = entity.y;
}

/**
 * Apply gravity and update vertical position
 */
export function applyGravity(entity: Entity, dt: number, groundEntities: Entity[] = []): void {
  if (entity.onGround) return;
  
  // Apply gravity
  entity.vy -= GRAVITY * dt;
  
  // Store previous position for collision detection
  const prevY = entity.y;
  
  // Update position
  entity.y += entity.vy * dt;
  
  // Check for ground collision using AABB
  const playerAABB: AABB = {
    x: entity.x,
    y: entity.y,
    w: entity.w,
    h: entity.h
  };
  
  let hitGround = false;
  
  // Check collision with ground entities (simple ground at y=0 for now)
  if (entity.y <= 0) {
    entity.y = 0;
    entity.vy = 0;
    hitGround = true;
  }
  
  // Check collision with other ground entities
  for (const ground of groundEntities) {
    if (ground.id === entity.id) continue;
    
    const groundAABB: AABB = {
      x: ground.x,
      y: ground.y,
      w: ground.w,
      h: ground.h
    };
    
    if (intersects(playerAABB, groundAABB)) {
      // Simple collision resolution - place on top of ground entity
      if (prevY >= ground.y + ground.h) {
        entity.y = ground.y + ground.h;
        entity.vy = 0;
        hitGround = true;
        break;
      }
    }
  }
  
  // Update ground state
  if (hitGround && !entity.onGround) {
    entity.onGround = true;
    // Clear jump state when landing
    entity.jumpState = {};
  }
}

/**
 * Handle crouch sliding mechanics
 */
export function applyCrouchSlide(entity: Entity, input: Input, dt: number): void {
  // Toggle crouch state
  if (input.crouch) {
    if (!entity.isCrouching) {
      entity.isCrouching = true;
      
      // Apply slide impulse if transitioning from sprint to crouch
      if (entity.isSprinting && entity.onGround && (entity.movementMomentum || 0) > 3.0) {
        const currentSpeed = Math.sqrt(entity.vx * entity.vx + entity.vy * entity.vy);
        if (currentSpeed > 0) {
          const slideDirection = {
            x: entity.vx / currentSpeed,
            y: entity.vy / currentSpeed
          };
          entity.vx += slideDirection.x * SLIDE_IMPULSE;
          entity.vy += slideDirection.y * SLIDE_IMPULSE;
        }
      }
    }
  } else {
    entity.isCrouching = false;
  }
  
  // Handle sprint state (can't sprint while crouching)
  if (input.sprint && !entity.isCrouching) {
    entity.isSprinting = true;
  } else {
    entity.isSprinting = false;
  }
}

/**
 * Compute and apply fall damage based on fall distance
 */
export function computeFallDamage(entity: Entity): number {
  // Only apply fall damage when landing
  if (!entity.onGround || entity.fallStartY === undefined) {
    return 0;
  }
  
  const fallDistance = entity.fallStartY - entity.y;
  
  // Clear fall start position
  entity.fallStartY = undefined;
  
  // No damage if fall distance is below threshold
  if (fallDistance <= FALL_DAMAGE_THRESHOLD) {
    return 0;
  }
  
  // Calculate damage based on excess fall distance
  const excessDistance = fallDistance - FALL_DAMAGE_THRESHOLD;
  const damage = Math.floor(excessDistance * FALL_DAMAGE_RATE);
  
  // Apply damage to entity
  entity.hp = Math.max(0, entity.hp - damage);
  
  return damage;
}

/**
 * Complete movement processing for a single entity
 */
export function processEntityMovement(entity: Entity, input: Input, dt: number, worldTick: number, prng: PRNG, groundEntities: Entity[] = []): void {
  if (entity.type !== "player") return;
  
  // Handle crouch/sprint state changes first
  applyCrouchSlide(entity, input, dt);
  
  // Handle jump initiation
  jump(entity, input, worldTick);
  
  // Apply movement based on ground state
  if (entity.onGround) {
    applyGroundMovement(entity, input, dt, prng);
  } else {
    applyAirMovement(entity, input, dt);
  }
  
  // Apply gravity and ground collision
  applyGravity(entity, dt, groundEntities);
  
  // Compute fall damage if landing
  computeFallDamage(entity);
}