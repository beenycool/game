import { createState, createPlayer, State, Input, serializeSnapshot } from "../src/state";
import { World } from "../src/sim/tick";
import { createPRNG } from "../src/sim/prng";
import { computeStateChecksum } from "../src/sim/hash";

describe("Deterministic Movement System", () => {
  function runTicksWithInputs(inputs: Record<string, Input>[], ticks: number, seed = 42) {
    const state = createState(0, seed);
    const player = createPlayer("p1", 0, 0);
    state.entities.push(player);
    const world = new World(state, 20, seed);
    let checksums: string[] = [];
    for (let i = 0; i < ticks; ++i) {
      world.tick([inputs[i] || {}]);
      checksums.push(computeStateChecksum(world.state));
    }
    return { world, checksums };
  }

  it("produces identical checksums for same seed/inputs", () => {
    const inputs: Record<string, Input>[] = [];
    for (let i = 0; i < 30; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 1, dy: 0, jump: i === 2, crouch: false, sprint: i > 10 && i < 20 }
      });
    }
    const run1 = runTicksWithInputs(inputs, 30, 123);
    const run2 = runTicksWithInputs(inputs, 30, 123);
    expect(run1.checksums).toEqual(run2.checksums);
  });

  it("applies jump and landing mechanics", () => {
    const inputs: Record<string, Input>[] = [];
    for (let i = 0; i < 20; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 0, dy: 0, jump: i === 1, crouch: false, sprint: false }
      });
    }
    const { world } = runTicksWithInputs(inputs, 20);
    const player = world.state.entities.find(e => e.id === "p1");
    expect(player?.onGround).toBe(true);
    expect(player?.vy).toBe(0);
    expect(player?.jumpState?.jumpStartTick).toBeDefined();
  });

  it("reduces air control while airborne", () => {
    const inputs: Record<string, Input>[] = [];
    for (let i = 0; i < 10; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 1, dy: 0, jump: i === 1, crouch: false, sprint: false }
      });
    }
    const { world } = runTicksWithInputs(inputs, 10);
    const player = world.state.entities.find(e => e.id === "p1");
    expect(player?.onGround).toBe(true);
    expect(player?.vx).toBeLessThanOrEqual(player?.maxWalkSpeed || 5.0);
  });

  it("applies crouch slide impulse and reduces speed after slide", () => {
    const inputs: Record<string, Input>[] = [];
    for (let i = 0; i < 20; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 1, dy: 0, jump: false, crouch: i === 10, sprint: i < 10 }
      });
    }
    const { world } = runTicksWithInputs(inputs, 20);
    const player = world.state.entities.find(e => e.id === "p1");
    expect(player?.isCrouching).toBe(true);
    expect(player?.movementMomentum).toBeLessThanOrEqual(player?.maxWalkSpeed || 5.0);
  });

  it("prevents falling through the floor (y >= 0)", () => {
    const inputs: Record<string, Input>[] = [];
    for (let i = 0; i < 30; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 0, dy: 0, jump: i === 1, crouch: false, sprint: false }
      });
    }
    const { world } = runTicksWithInputs(inputs, 30);
    const player = world.state.entities.find(e => e.id === "p1");
    expect(player?.y).toBeGreaterThanOrEqual(0);
  });

  it("applies fall damage only when expected", () => {
    const inputs: Record<string, Input>[] = [];
    // Simulate a high fall
    for (let i = 0; i < 5; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 0, dy: 0, jump: false, crouch: false, sprint: false }
      });
    }
    // Manually set player high up
    const { world } = runTicksWithInputs(inputs, 5);
    const player = world.state.entities.find(e => e.id === "p1");
    if (player) player.y = 50;
    // Now let them fall
    for (let i = 5; i < 30; ++i) {
      inputs.push({
        p1: { seq: i, clientId: "p1", dx: 0, dy: 0, jump: false, crouch: false, sprint: false }
      });
    }
    const { world: world2 } = runTicksWithInputs(inputs, 30);
    const player2 = world2.state.entities.find(e => e.id === "p1");
    expect(player2?.hp).toBeLessThan(100);
  });
});
