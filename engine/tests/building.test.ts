/**
 * Building system tests
 * 
 * Tests deterministic behavior, grid snapping, material HP differences,
 * turbo building, and preview functionality.
 */

import { 
  createState, 
  createPlayer, 
  State, 
  Entity, 
  serializeSnapshot, 
  deserializeSnapshot 
} from "../src/state";
import { createPRNG, PRNG } from "../src/sim/prng";
import { computeStateChecksum } from "../src/sim/hash";
import {
  placeBuild,
  editBuild,
  removeBuild,
  previewBuild,
  processTurboBuild,
  snapToGrid,
  gridToWorld,
  isGridPositionOccupied,
  validateBuildPlacement
} from "../src/build/system";
import {
  BuildType,
  MaterialType,
  BuildEditType,
  MATERIAL_CONFIGS,
  BUILD_GRID_SIZE,
  BUILD_DIMENSIONS,
  hasEdit,
  addEdit,
  EditFlags
} from "../src/build/types";
import {
  processBuildingInputs,
  ExtendedInput,
  stripBuildInput
} from "../src/sim/building";

/**
 * Helper function to create test state with players
 */
function createTestState(): State {
  const state = createState(100, 12345);
  state.entities.push(createPlayer("player1", 5, 5));
  state.entities.push(createPlayer("player2", 15, 15));
  return state;
}

/**
 * Helper function to create extended input with building action
 */
function createBuildInput(
  clientId: string,
  action: string,
  params: any = {}
): ExtendedInput {
  return {
    seq: 1,
    clientId,
    dx: 0,
    dy: 0,
    build: {
      action: action as any,
      ...params
    }
  };
}

describe("Building System", () => {
  
  describe("Grid and World Coordinate Conversion", () => {
    it("should snap world coordinates to grid", () => {
      expect(snapToGrid(1.7, 2.3)).toEqual({ x: 1, y: 1 });
      expect(snapToGrid(3.9, 7.1)).toEqual({ x: 2, y: 4 });
      expect(snapToGrid(-0.6, -1.4)).toEqual({ x: 0, y: -1 });
    });

    it("should convert grid to world coordinates", () => {
      expect(gridToWorld({ x: 2, y: 3 })).toEqual({ x: 4, y: 6 });
      expect(gridToWorld({ x: -1, y: 0 })).toEqual({ x: -2, y: 0 });
    });

    it("should maintain round-trip consistency", () => {
      const worldPos = { x: 7.3, y: 12.8 };
      const gridPos = snapToGrid(worldPos.x, worldPos.y);
      const backToWorld = gridToWorld(gridPos);
      const backToGrid = snapToGrid(backToWorld.x, backToWorld.y);
      
      expect(backToGrid).toEqual(gridPos);
    });
  });

  describe("Material Properties", () => {
    it("should have different HP values for different materials", () => {
      expect(MATERIAL_CONFIGS.wood.hp).toBe(100);
      expect(MATERIAL_CONFIGS.brick.hp).toBe(200);
      expect(MATERIAL_CONFIGS.metal.hp).toBe(400);
      
      // Verify ordering: wood < brick < metal
      expect(MATERIAL_CONFIGS.wood.hp).toBeLessThan(MATERIAL_CONFIGS.brick.hp);
      expect(MATERIAL_CONFIGS.brick.hp).toBeLessThan(MATERIAL_CONFIGS.metal.hp);
    });

    it("should have different build times for different materials", () => {
      expect(MATERIAL_CONFIGS.wood.buildTime).toBe(20);
      expect(MATERIAL_CONFIGS.brick.buildTime).toBe(40);
      expect(MATERIAL_CONFIGS.metal.buildTime).toBe(60);
    });
  });

  describe("Build Placement", () => {
    let state: State;
    let prng: PRNG;

    beforeEach(() => {
      state = createTestState();
      prng = createPRNG(12345);
    });

    it("should place a build piece successfully", () => {
      const gridPos = { x: 10, y: 10 };
      const result = placeBuild(state, "player1", "wall", "wood", gridPos, 0, prng);
      
      expect(result.success).toBe(true);
      expect(result.entity).toBeDefined();
      expect(result.entity!.type).toBe("build_piece");
      expect(result.entity!.owner).toBe("player1");
      expect(result.entity!.buildType).toBe("wall");
      expect(result.entity!.material).toBe("wood");
      expect(result.entity!.hp).toBe(MATERIAL_CONFIGS.wood.hp);
      expect(result.entity!.rot).toBe(0);
    });

    it("should respect build dimensions", () => {
      const gridPos = { x: 5, y: 5 };
      const result = placeBuild(state, "player1", "wall", "brick", gridPos, 90, prng);
      
      expect(result.success).toBe(true);
      const entity = result.entity!;
      expect(entity.w).toBe(BUILD_DIMENSIONS.wall.w * BUILD_GRID_SIZE);
      expect(entity.h).toBe(BUILD_DIMENSIONS.wall.h * BUILD_GRID_SIZE);
    });

    it("should prevent overlapping placements", () => {
      const gridPos = { x: 8, y: 8 };
      
      // Place first build piece
      const result1 = placeBuild(state, "player1", "wall", "wood", gridPos, 0, prng);
      expect(result1.success).toBe(true);
      
      // Add to state to test collision
      state.entities.push(result1.entity!);
      
      // Try to place overlapping piece
      const result2 = placeBuild(state, "player2", "wall", "brick", gridPos, 0, prng);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain("occupied");
    });

    it("should validate rotation values", () => {
      const gridPos = { x: 3, y: 3 };
      
      // Valid rotations
      expect(validateBuildPlacement(state, "player1", "wall", "wood", gridPos, 0).valid).toBe(true);
      expect(validateBuildPlacement(state, "player1", "wall", "wood", gridPos, 90).valid).toBe(true);
      expect(validateBuildPlacement(state, "player1", "wall", "wood", gridPos, 180).valid).toBe(true);
      expect(validateBuildPlacement(state, "player1", "wall", "wood", gridPos, 270).valid).toBe(true);
      
      // Invalid rotation
      expect(validateBuildPlacement(state, "player1", "wall", "wood", gridPos, 45).valid).toBe(false);
    });
  });

  describe("Build Editing", () => {
    let state: State;
    let prng: PRNG;
    let buildEntity: Entity;

    beforeEach(() => {
      state = createTestState();
      prng = createPRNG(12345);
      
      const result = placeBuild(state, "player1", "wall", "brick", { x: 5, y: 5 }, 0, prng);
      buildEntity = result.entity!;
      state.entities.push(buildEntity);
    });

    it("should apply window edit and reduce HP", () => {
      const originalHp = buildEntity.hp;
      const result = editBuild(state, "player1", buildEntity.id, "window");
      
      expect(result.success).toBe(true);
      expect(result.entity!.hp).toBeLessThan(originalHp);
      expect(hasEdit(result.entity!.editState!, "window")).toBe(true);
    });

    it("should apply door edit and reduce HP more than window", () => {
      const windowResult = editBuild(state, "player1", buildEntity.id, "window");
      const doorEntity = { ...buildEntity };
      const doorResult = editBuild(state, "player1", doorEntity.id, "door");
      
      expect(windowResult.success).toBe(true);
      expect(doorResult.success).toBe(true);
      expect(doorResult.entity!.hp).toBeLessThan(windowResult.entity!.hp);
    });

    it("should prevent duplicate edits", () => {
      // Apply window edit
      const result1 = editBuild(state, "player1", buildEntity.id, "window");
      expect(result1.success).toBe(true);
      
      // Update entity in state
      const entityIndex = state.entities.findIndex(e => e.id === buildEntity.id);
      state.entities[entityIndex] = result1.entity!;
      
      // Try to apply window edit again
      const result2 = editBuild(state, "player1", buildEntity.id, "window");
      expect(result2.success).toBe(false);
      expect(result2.error).toContain("already applied");
    });

    it("should enforce ownership for edits", () => {
      const result = editBuild(state, "player2", buildEntity.id, "window");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Not authorized");
    });
  });

  describe("Turbo Building", () => {
    let state: State;
    let prng: PRNG;

    beforeEach(() => {
      state = createTestState();
      prng = createPRNG(12345);
    });

    it("should place multiple pieces in a line", () => {
      const startPos = { x: 0, y: 0 };
      const endPos = { x: 3, y: 0 };
      
      const results = processTurboBuild(
        state, 
        "player1", 
        "wall", 
        "wood", 
        startPos, 
        endPos, 
        0, 
        prng
      );
      
      expect(results.length).toBe(4); // 0, 1, 2, 3
      expect(results.every(r => r.success)).toBe(true);
      
      // Check positions
      results.forEach((result, index) => {
        expect(result.entity!.x).toBe(index * BUILD_GRID_SIZE);
        expect(result.entity!.y).toBe(0);
      });
    });

    it("should handle diagonal turbo building", () => {
      const startPos = { x: 0, y: 0 };
      const endPos = { x: 2, y: 2 };
      
      const results = processTurboBuild(
        state, 
        "player1", 
        "floor", 
        "wood", 
        startPos, 
        endPos, 
        0, 
        prng
      );
      
      expect(results.length).toBe(3); // Distance is max(2,2) = 2, so 3 pieces
      expect(results.every(r => r.success)).toBe(true);
    });

    it("should stop on collision during turbo building", () => {
      // Place obstacle
      const obstacle = placeBuild(state, "player2", "wall", "metal", { x: 1, y: 0 }, 0, prng);
      state.entities.push(obstacle.entity!);
      
      const startPos = { x: 0, y: 0 };
      const endPos = { x: 3, y: 0 };
      
      const results = processTurboBuild(
        state, 
        "player1", 
        "wall", 
        "wood", 
        startPos, 
        endPos, 
        0, 
        prng
      );
      
      // Should place at x=0, fail at x=1 (occupied), then succeed at x=2,3
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(true);
    });
  });

  describe("Preview System", () => {
    let state: State;

    beforeEach(() => {
      state = createTestState();
    });

    it("should generate preview without modifying state", () => {
      const originalEntityCount = state.entities.length;
      
      const preview = previewBuild(state, "player1", "wall", "wood", 5.7, 3.2, 90);
      
      expect(preview.success).toBe(true);
      expect(state.entities.length).toBe(originalEntityCount); // State unchanged
      expect(preview.entity).toBeDefined();
      expect(preview.gridPos).toEqual({ x: 3, y: 2 }); // Snapped
      expect(preview.worldPos).toEqual({ x: 6, y: 4 }); // Grid to world
    });

    it("should detect collisions in preview", () => {
      // Place build piece
      const existing = placeBuild(createState(), "player2", "wall", "brick", { x: 5, y: 5 }, 0, createPRNG());
      state.entities.push(existing.entity!);
      
      const preview = previewBuild(state, "player1", "wall", "wood", 10, 10, 0);
      
      expect(preview.success).toBe(false);
      expect(preview.error).toContain("occupied");
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce identical results with same seed and inputs", () => {
      const seed = 42;
      
      // Run simulation twice with same inputs
      const results: string[] = [];
      
      for (let run = 0; run < 2; run++) {
        const state = createState(0, seed);
        state.entities.push(createPlayer("player1", 0, 0));
        
        const prng = createPRNG(seed);
        
        // Place several build pieces
        for (let i = 0; i < 5; i++) {
          const result = placeBuild(
            state, 
            "player1", 
            "wall", 
            "wood", 
            { x: i, y: 0 }, 
            0, 
            prng
          );
          if (result.success && result.entity) {
            state.entities.push(result.entity);
          }
        }
        
        // Compute state checksum
        const checksum = computeStateChecksum(state);
        results.push(checksum);
      }
      
      expect(results[0]).toBe(results[1]);
    });

    it("should maintain deterministic processing order", () => {
      const state = createTestState();
      const prng = createPRNG(12345);
      
      // Create inputs from multiple clients (unsorted order)
      const inputs: Record<string, ExtendedInput> = {
        "charlie": createBuildInput("charlie", "place", { 
          buildType: "wall", 
          material: "wood", 
          worldX: 6, 
          worldY: 6 
        }),
        "alice": createBuildInput("alice", "place", { 
          buildType: "wall", 
          material: "brick", 
          worldX: 2, 
          worldY: 2 
        }),
        "bob": createBuildInput("bob", "place", { 
          buildType: "wall", 
          material: "metal", 
          worldX: 4, 
          worldY: 4 
        })
      };
      
      const result = processBuildingInputs(state, inputs, prng);
      
      // Should process in alphabetical order: alice, bob, charlie
      expect(result.placedEntities.length).toBe(3);
      expect(result.placedEntities[0].owner).toBe("alice");
      expect(result.placedEntities[1].owner).toBe("bob");
      expect(result.placedEntities[2].owner).toBe("charlie");
    });
  });

  describe("Input Processing Integration", () => {
    let state: State;
    let prng: PRNG;

    beforeEach(() => {
      state = createTestState();
      prng = createPRNG(54321);
    });

    it("should process place action", () => {
      const inputs = {
        "player1": createBuildInput("player1", "place", {
          buildType: "wall",
          material: "brick",
          worldX: 8,
          worldY: 10,
          rotation: 90
        })
      };
      
      const result = processBuildingInputs(state, inputs, prng);
      
      expect(result.placedEntities.length).toBe(1);
      expect(state.entities.length).toBe(3); // 2 players + 1 build
      
      const buildPiece = result.placedEntities[0];
      expect(buildPiece.buildType).toBe("wall");
      expect(buildPiece.material).toBe("brick");
      expect(buildPiece.rot).toBe(90);
    });

    it("should process edit action", () => {
      // First place a build piece
      const placeInputs = {
        "player1": createBuildInput("player1", "place", {
          buildType: "wall",
          material: "wood",
          worldX: 4,
          worldY: 6
        })
      };
      
      const placeResult = processBuildingInputs(state, placeInputs, prng);
      const buildId = placeResult.placedEntities[0].id;
      
      // Then edit it
      const editInputs = {
        "player1": createBuildInput("player1", "edit", {
          buildId,
          editType: "door"
        })
      };
      
      const editResult = processBuildingInputs(state, editInputs, prng);
      
      expect(editResult.editedEntities.length).toBe(1);
      expect(hasEdit(editResult.editedEntities[0].editState!, "door")).toBe(true);
    });

    it("should process remove action", () => {
      // Place and then remove
      const placeInputs = {
        "player1": createBuildInput("player1", "place", {
          buildType: "floor",
          material: "metal",
          worldX: 12,
          worldY: 8
        })
      };
      
      const placeResult = processBuildingInputs(state, placeInputs, prng);
      const buildId = placeResult.placedEntities[0].id;
      
      const removeInputs = {
        "player1": createBuildInput("player1", "remove", {
          buildId
        })
      };
      
      const removeResult = processBuildingInputs(state, removeInputs, prng);
      
      expect(removeResult.removedEntityIds).toContain(buildId);
      expect(state.entities.find(e => e.id === buildId)).toBeUndefined();
    });

    it("should process preview action without state mutation", () => {
      const originalEntityCount = state.entities.length;
      
      const inputs = {
        "player1": createBuildInput("player1", "preview", {
          buildType: "ramp",
          material: "brick",
          worldX: 7.3,
          worldY: 11.8
        })
      };
      
      const result = processBuildingInputs(state, inputs, prng);
      
      expect(result.previewResults.length).toBe(1);
      expect(result.previewResults[0].clientId).toBe("player1");
      expect(state.entities.length).toBe(originalEntityCount);
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize build pieces correctly", () => {
      const state = createTestState();
      const prng = createPRNG(98765);
      
      // Add build pieces
      const wall = placeBuild(state, "player1", "wall", "brick", { x: 3, y: 4 }, 180, prng);
      const floor = placeBuild(state, "player2", "floor", "metal", { x: 7, y: 2 }, 0, prng);
      
      state.entities.push(wall.entity!, floor.entity!);
      
      // Serialize and deserialize
      const serialized = serializeSnapshot(state);
      const deserialized = deserializeSnapshot(serialized);
      
      // Check build pieces preserved
      const deserializedBuilds = deserialized.entities.filter(e => e.type === "build_piece");
      expect(deserializedBuilds.length).toBe(2);
      
      const deserializedWall = deserializedBuilds.find(e => e.buildType === "wall");
      const deserializedFloor = deserializedBuilds.find(e => e.buildType === "floor");
      
      expect(deserializedWall).toBeDefined();
      expect(deserializedWall!.material).toBe("brick");
      expect(deserializedWall!.rot).toBe(180);
      
      expect(deserializedFloor).toBeDefined();
      expect(deserializedFloor!.material).toBe("metal");
      expect(deserializedFloor!.rot).toBe(0);
    });
  });
});