import { describe, it, expect } from "vitest";
import { createWorld, createState, createPlayer, reconcile } from "../src";
import { computeStateChecksum } from "../src/sim/hash";

describe("tick loop determinism", () => {
  it("produces identical snapshots for identical inputs with seeded PRNG", () => {
    const inputsPerTick: Record<string, any>[] = [];
    // tick 0: p1 moves right, p2 moves left
    inputsPerTick.push({ p1: { seq: 0, clientId: "p1", dx: 1, dy: 0 }, p2: { seq: 0, clientId: "p2", dx: -1, dy: 0 } });
    // tick 1: p1 stops, p2 stops
    inputsPerTick.push({ p1: { seq: 1, clientId: "p1", dx: 0, dy: 0 }, p2: { seq: 1, clientId: "p2", dx: 0, dy: 0 } });
    // tick 2: p1 shoots (no movement), p2 stands
    inputsPerTick.push({ p1: { seq: 2, clientId: "p1", dx: 0, dy: 0, shoot: true }, p2: { seq: 2, clientId: "p2", dx: 0, dy: 0 } });

    function run(seed: number): { serialized: string; checksum: string; state: any } {
      const w = createWorld(seed, { tickRate: 20 });
      // initial state
      const s = createState(0, seed);
      s.entities.push(createPlayer("p1", 0, 0));
      s.entities.push(createPlayer("p2", 5, 0));
      w.setState(s);

      for (let t = 0; t < inputsPerTick.length; t++) {
        w.tick([inputsPerTick[t]]);
      }
      
      const finalState = w.state;
      return {
        serialized: w.serialize(),
        checksum: finalState.lastChecksum!,
        state: finalState
      };
    }

    // Test with same seed
    const seed = 12345;
    const result1 = run(seed);
    const result2 = run(seed);
    
    expect(result1.serialized).toBe(result2.serialized);
    expect(result1.checksum).toBe(result2.checksum);
    expect(result1.state.rng).toBe(result2.state.rng);

    // Test with different seeds produce different results
    const result3 = run(67890);
    expect(result1.checksum).not.toBe(result3.checksum);
  });

  it("validates determinism across multiple runs with state checksums", () => {
    const seed = 42;
    const inputs = [
      { p1: { seq: 0, clientId: "p1", dx: 1, dy: 0, shoot: true } },
      { p1: { seq: 1, clientId: "p1", dx: 0, dy: 0 } },
      { p1: { seq: 2, clientId: "p1", dx: -1, dy: 0, shoot: true } }
    ];

    const results = [];
    for (let i = 0; i < 3; i++) {
      const w = createWorld(seed, { tickRate: 20 });
      const s = createState(0, seed);
      s.entities.push(createPlayer("p1", 0, 0));
      w.setState(s);

      for (const input of inputs) {
        w.tick([input]);
        results.push({
          tick: w.state.tick,
          checksum: w.state.lastChecksum,
          rng: w.state.rng
        });
      }
    }

    // All runs should produce identical checksums and RNG states
    for (let i = 1; i < results.length; i++) {
      expect(results[i].checksum).toBe(results[0].checksum);
      expect(results[i].rng).toBe(results[0].rng);
    }
  });

  it("reconcile produces same state as live tick reapply", () => {
    const inputsPerTick: Record<string, any>[] = [];
    inputsPerTick.push({ p1: { seq: 0, clientId: "p1", dx: 1, dy: 0 } });
    inputsPerTick.push({ p1: { seq: 1, clientId: "p1", dx: 0, dy: 0 } });

    // live run
    const w = createWorld(undefined, { tickRate: 20 } as any);
    const s = createState(0);
    s.entities.push(createPlayer("p1", 0, 0));
    w.setState(s);
    // run one tick then take snapshot, then run second tick
    w.tick([inputsPerTick[0]]);
    const snap = w.serialize();
    w.tick([inputsPerTick[1]]);
    const finalLive = w.serialize();

    // reconcile from snapshot by reapplying buffered inputs (one input map for next tick)
    const recon = reconcile(snap, [inputsPerTick[1]], 20);
    const reconSerialized = JSON.stringify({ tick: recon.tick, entities: recon.entities.map((e) => ({ id: e.id, x: e.x, y: e.y, vx: e.vx, vy: e.vy, hp: e.hp })) });

    expect(reconSerialized).toBe(finalLive);
  });
});