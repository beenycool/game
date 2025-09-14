/**
 * Building system tick integration
 * 
 * Processes building-related inputs deterministically during each tick.
 * Maintains stable processing order and integrates with the main tick loop.
 */

import { State, Entity, Input } from "../state";
import { PRNG } from "./prng";
import { 
  placeBuild, 
  editBuild, 
  removeBuild, 
  previewBuild,
  processTurboBuild,
  snapToGrid,
  BuildResult
} from "../build/system";
import { BuildType, MaterialType, BuildEditType } from "../build/types";

/**
 * Building input actions that can be sent by clients
 */
export interface BuildInput {
  action: "place" | "edit" | "remove" | "preview";
  buildType?: BuildType;
  material?: MaterialType;
  worldX?: number;
  worldY?: number;
  gridX?: number;
  gridY?: number;
  rotation?: number;
  buildId?: string;
  editType?: BuildEditType;
  turbo?: boolean;
  turboEndX?: number;
  turboEndY?: number;
}

/**
 * Extended input type that includes building actions
 */
export interface ExtendedInput extends Input {
  build?: BuildInput;
}

/**
 * Result of processing building inputs for a tick
 */
export interface BuildTickResult {
  placedEntities: Entity[];
  editedEntities: Entity[];
  removedEntityIds: string[];
  previewResults: Array<{ clientId: string; result: any }>;
}

/**
 * Process building inputs for a single tick deterministically
 * 
 * Processing order:
 * 1. Sort client IDs alphabetically for deterministic order
 * 2. Process each client's building input in order
 * 3. Apply changes to state immediately to affect subsequent processing
 */
export function processBuildingInputs(
  state: State,
  inputs: Record<string, ExtendedInput>,
  prng: PRNG
): BuildTickResult {
  const result: BuildTickResult = {
    placedEntities: [],
    editedEntities: [],
    removedEntityIds: [],
    previewResults: []
  };

  // Sort client IDs for deterministic processing order
  const clientIds = Object.keys(inputs).sort();

  for (const clientId of clientIds) {
    const input = inputs[clientId];
    if (!input.build) continue;

    const buildInput = input.build;
    
    // Process the building action based on type
    switch (buildInput.action) {
      case "place":
        processBuildPlace(state, clientId, buildInput, prng, result);
        break;
      case "edit":
        processBuildEdit(state, clientId, buildInput, result);
        break;
      case "remove":
        processBuildRemove(state, clientId, buildInput, result);
        break;
      case "preview":
        processBuildPreview(state, clientId, buildInput, result);
        break;
    }
  }

  return result;
}

/**
 * Process a build placement input
 */
function processBuildPlace(
  state: State,
  clientId: string,
  buildInput: BuildInput,
  prng: PRNG,
  result: BuildTickResult
): void {
  if (!buildInput.buildType || !buildInput.material) {
    console.warn(`Invalid build place input from ${clientId}: missing buildType or material`);
    return;
  }

  const worldX = buildInput.worldX || 0;
  const worldY = buildInput.worldY || 0;
  const rotation = buildInput.rotation || 0;

  if (buildInput.turbo && buildInput.turboEndX !== undefined && buildInput.turboEndY !== undefined) {
    // Process turbo building
    const startGrid = snapToGrid(worldX, worldY);
    const endGrid = snapToGrid(buildInput.turboEndX, buildInput.turboEndY);
    
    const turboResults = processTurboBuild(
      state,
      clientId,
      buildInput.buildType,
      buildInput.material,
      startGrid,
      endGrid,
      rotation,
      prng
    );

    for (const buildResult of turboResults) {
      if (buildResult.success && buildResult.entity) {
        result.placedEntities.push(buildResult.entity);
        // Note: Entity is already added to state by processTurboBuild
      }
    }
  } else {
    // Single build placement
    const gridPos = snapToGrid(worldX, worldY);
    const buildResult = placeBuild(
      state,
      clientId,
      buildInput.buildType,
      buildInput.material,
      gridPos,
      rotation,
      prng
    );

    if (buildResult.success && buildResult.entity) {
      result.placedEntities.push(buildResult.entity);
      state.entities.push(buildResult.entity);
    }
  }
}

/**
 * Process a build edit input
 */
function processBuildEdit(
  state: State,
  clientId: string,
  buildInput: BuildInput,
  result: BuildTickResult
): void {
  if (!buildInput.buildId || !buildInput.editType) {
    console.warn(`Invalid build edit input from ${clientId}: missing buildId or editType`);
    return;
  }

  const editResult = editBuild(state, clientId, buildInput.buildId, buildInput.editType);
  
  if (editResult.success && editResult.entity) {
    // Find and replace the entity in state
    const entityIndex = state.entities.findIndex(e => e.id === buildInput.buildId);
    if (entityIndex >= 0) {
      state.entities[entityIndex] = editResult.entity;
      result.editedEntities.push(editResult.entity);
    }
  }
}

/**
 * Process a build removal input
 */
function processBuildRemove(
  state: State,
  clientId: string,
  buildInput: BuildInput,
  result: BuildTickResult
): void {
  if (!buildInput.buildId) {
    console.warn(`Invalid build remove input from ${clientId}: missing buildId`);
    return;
  }

  const removeResult = removeBuild(state, clientId, buildInput.buildId);
  
  if (removeResult.success) {
    // Remove entity from state
    const entityIndex = state.entities.findIndex(e => e.id === buildInput.buildId);
    if (entityIndex >= 0) {
      state.entities.splice(entityIndex, 1);
      result.removedEntityIds.push(buildInput.buildId);
    }
  }
}

/**
 * Process a build preview input (does not modify state)
 */
function processBuildPreview(
  state: State,
  clientId: string,
  buildInput: BuildInput,
  result: BuildTickResult
): void {
  if (!buildInput.buildType || !buildInput.material) {
    console.warn(`Invalid build preview input from ${clientId}: missing buildType or material`);
    return;
  }

  const worldX = buildInput.worldX || 0;
  const worldY = buildInput.worldY || 0;
  const rotation = buildInput.rotation || 0;

  const previewResult = previewBuild(
    state,
    clientId,
    buildInput.buildType,
    buildInput.material,
    worldX,
    worldY,
    rotation
  );

  result.previewResults.push({
    clientId,
    result: previewResult
  });
}

/**
 * Process collision detection between build pieces and other entities
 * Called during physics resolution in the main tick loop
 */
export function processBuildCollisions(state: State): void {
  const buildPieces = state.entities.filter(e => e.type === "build_piece");
  const otherEntities = state.entities.filter(e => e.type !== "build_piece");

  // Simple collision resolution - just check if entities overlap with build pieces
  // and handle basic collision response (stopping movement)
  for (const entity of otherEntities) {
    for (const buildPiece of buildPieces) {
      if (entitiesOverlap(entity, buildPiece)) {
        // Simple collision response - stop movement for now
        // More sophisticated resolution could be added later
        entity.vx = 0;
        entity.vy = 0;
        
        // Move entity out of build piece (simple separation)
        const dx = entity.x - buildPiece.x;
        const dy = entity.y - buildPiece.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const separationDistance = 0.1; // Small separation
          entity.x = buildPiece.x + (dx / distance) * (buildPiece.w / 2 + entity.w / 2 + separationDistance);
          entity.y = buildPiece.y + (dy / distance) * (buildPiece.h / 2 + entity.h / 2 + separationDistance);
        }
      }
    }
  }
}

/**
 * Check if two entities overlap (simple AABB collision)
 */
function entitiesOverlap(a: Entity, b: Entity): boolean {
  return !(a.x + a.w <= b.x || 
           b.x + b.w <= a.x || 
           a.y + a.h <= b.y || 
           b.y + b.h <= a.y);
}

/**
 * Convert ExtendedInput to regular Input (strip build data)
 */
export function stripBuildInput(extendedInput: ExtendedInput): Input {
  const { build, ...regularInput } = extendedInput;
  return regularInput;
}