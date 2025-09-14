/**
 * Movement system integration for tick processing.
 * Processes movement for all player entities in deterministic order.
 */

import { State, Entity, Input } from "../state";
import { PRNG } from "./prng";
import { processEntityMovement } from "../player/movement";

/**
 * Process movement for all player entities in the state.
 * Called during tick processing after inputs are applied but before collision resolution.
 * 
 * @param state - Current game state
 * @param inputs - Input mapping for this tick
 * @param dt - Delta time for this tick
 * @param worldTick - Current world tick number
 * @param prng - Seeded PRNG instance
 */
export function processMovement(
  state: State, 
  inputs: Record<string, Input>, 
  dt: number, 
  worldTick: number, 
  prng: PRNG
): void {
  // Get all player entities and sort by ID for deterministic processing order
  const players = state.entities
    .filter((e) => e.type === "player")
    .sort((a, b) => a.id.localeCompare(b.id));

  // Get all potential ground entities (build pieces, etc.)
  const groundEntities = state.entities.filter((e) => 
    e.type === "build_piece" || (e.type === "player" && e.id !== "current_player")
  );

  // Process movement for each player entity
  for (const player of players) {
    const input = inputs[player.id];
    
    // Use default input if none provided for this player
    const playerInput: Input = input || {
      seq: 0,
      clientId: player.id,
      dx: 0,
      dy: 0,
      shoot: false,
      jump: false,
      crouch: false,
      sprint: false
    };

    // Process movement for this player
    processEntityMovement(player, playerInput, dt, worldTick, prng, groundEntities);
    
    // Update position based on final velocity (after movement processing)
    player.x += player.vx * dt;
    player.y += player.vy * dt;
  }
}