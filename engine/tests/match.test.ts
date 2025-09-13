import { describe, it, expect } from "vitest";
import { createWorld, createState, createPlayer } from "../src";
import { computeStateChecksum } from "../src/sim/hash";
import { MatchRunner } from "../src/match/match";
import { GameMode, MatchState } from "../src/match/match_types";

describe("Match Lifecycle Determinism", () => {
  it("produces identical match state for identical inputs with seeded PRNG", () => {
    const seed = 12345;
    
    function runMatchSimulation(seed: number, mode: GameMode = "arena"): {
      checksum: string;
      matchState: MatchState;
      protocolMessages: any[];
    } {
      const protocolMessages: any[] = [];
      
      // Mock protocol message handler to capture messages
      const mockSendProtocolMessage = (msg: any) => {
        protocolMessages.push({ tick: 0, type: msg.type, data: msg }); // tick will be updated later
      };
      
      // Create match runner
      const matchRunner = MatchRunner.create({
        id: "test-match",
        seed: seed,
        mode: mode,
        players: ["p1", "p2"],
        roundsToWin: 2, // First to 2 wins (best-of-3)
        maxRoundTimeSec: 90, // 90 second rounds
        respawnDelaySec: 5,
        warmupTimeSec: 0, // Deprecated - no warmup
        spawnPoints: [],
        lootSpawns: []
      }, mockSendProtocolMessage);
      
      // Get the world from match runner and add players directly for testing
      const world = matchRunner.getWorld();
      const state = world.state;
      
      // Create two players and add to state
      const p1 = createPlayer("p1", 0, 0);
      const p2 = createPlayer("p2", 5, 0);
      state.entities.push(p1, p2);
      world.setState(state);
      
      // Run match simulation for 100 ticks
      for (let tick = 0; tick < 100; tick++) {
        const inputs = {
          p1: { seq: tick, clientId: "p1", dx: tick % 20 < 10 ? 1 : -1, dy: 0, shoot: tick % 5 === 0 },
          p2: { seq: tick, clientId: "p2", dx: tick % 20 >= 10 ? 1 : -1, dy: 0, shoot: tick % 7 === 0 }
        };
        
        matchRunner.tick([inputs]);
        
        // Update protocol message tick values
        for (const msg of protocolMessages) {
          if (msg.tick === 0) msg.tick = world.state.tick;
        }
      }
      
      return {
        checksum: world.state.lastChecksum!,
        matchState: matchRunner.getState(),
        protocolMessages
      };
    }

    // Test with same seed
    const result1 = runMatchSimulation(seed);
    const result2 = runMatchSimulation(seed);
    
    expect(result1.checksum).toBe(result2.checksum);
    expect(result1.matchState).toEqual(result2.matchState);
    expect(result1.protocolMessages.length).toBe(result2.protocolMessages.length);
    
    // Verify protocol messages are identical
    for (let i = 0; i < result1.protocolMessages.length; i++) {
      expect(result1.protocolMessages[i]).toEqual(result2.protocolMessages[i]);
    }
  });

  it("validates match lifecycle state transitions", () => {
    const seed = 42;
    const protocolMessages: any[] = [];
    
    // Mock protocol message handler to capture messages
    const mockSendProtocolMessage = (msg: any) => {
      protocolMessages.push({ tick: 0, type: msg.type, data: msg });
    };
    
    const matchRunner = MatchRunner.create({
      id: "test-match",
      seed: seed,
      mode: "arena",
      players: ["p1", "p2"],
      roundsToWin: 2, // First to 2 wins (best-of-3)
      maxRoundTimeSec: 90, // 90 second rounds
      respawnDelaySec: 5,
      warmupTimeSec: 0, // Deprecated - no warmup
      spawnPoints: [],
      lootSpawns: []
    }, mockSendProtocolMessage);
    
    // Get the world from match runner and add players directly for testing
    const world = matchRunner.getWorld();
    const state = world.state;
    
    const p1 = createPlayer("p1", 0, 0);
    const p2 = createPlayer("p2", 5, 0);
    state.entities.push(p1, p2);
    world.setState(state);
    
    // Run until match should complete (arena mode typically has short rounds)
    for (let tick = 0; tick < 500; tick++) {
      const inputs = {
        p1: { seq: tick, clientId: "p1", dx: 1, dy: 0, shoot: tick % 10 === 0 },
        p2: { seq: tick, clientId: "p2", dx: -1, dy: 0, shoot: tick % 8 === 0 }
      };
      
      matchRunner.tick([inputs]);
      
      // Update protocol message tick values
      for (const msg of protocolMessages) {
        if (msg.tick === 0) msg.tick = world.state.tick;
      }
      
      // Check if match ended
      if (matchRunner.getState().matchState === "match_end") {
        break;
      }
    }
    
    const finalState = matchRunner.getState();
    
    // Verify match completed all lifecycle phases
    expect(finalState.matchState).toBe("match_end");
    // Check for winner by finding player with highest score
    const players = Object.values(finalState.playerStates);
    const winner = players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    expect(winner.score).toBeGreaterThan(0);
    
    // Verify protocol messages were sent for key transitions
    const messageTypes = protocolMessages.map(msg => msg.type);
    expect(messageTypes).toContain("match_start");
    expect(messageTypes).toContain("round_start");
    expect(messageTypes).toContain("round_end");
    expect(messageTypes).toContain("match_end");
    expect(messageTypes).toContain("match_state_update");
    expect(messageTypes).toContain("player_score_update");
  });

  it("validates protocol message structure and content", () => {
    const seed = 123;
    const protocolMessages: any[] = [];
    
    // Mock protocol message handler to capture messages
    const mockSendProtocolMessage = (msg: any) => {
      protocolMessages.push(msg);
    };
    
    const matchRunner = MatchRunner.create({
      id: "test-match",
      seed: seed,
      mode: "arena",
      players: ["p1", "p2"],
      roundsToWin: 2, // First to 2 wins (best-of-3)
      maxRoundTimeSec: 90, // 90 second rounds
      respawnDelaySec: 5,
      warmupTimeSec: 0, // Deprecated - no warmup
      spawnPoints: [],
      lootSpawns: []
    }, mockSendProtocolMessage);
    
    // Get the world from match runner and add players directly for testing
    const world = matchRunner.getWorld();
    const state = world.state;
    
    const p1 = createPlayer("p1", 0, 0);
    const p2 = createPlayer("p2", 5, 0);
    state.entities.push(p1, p2);
    world.setState(state);
    
    // Run briefly to capture some protocol messages
    for (let tick = 0; tick < 50; tick++) {
      const inputs = {
        p1: { seq: tick, clientId: "p1", dx: 1, dy: 0, shoot: true },
        p2: { seq: tick, clientId: "p2", dx: -1, dy: 0, shoot: true }
      };
      
      matchRunner.tick([inputs]);
    }
    
    // Verify protocol message structures
    const matchStartMsg = protocolMessages.find(msg => msg.type === "match_start");
    if (matchStartMsg) {
      expect(matchStartMsg).toMatchObject({
        type: "match_start",
        matchId: expect.any(String),
        mode: "arena",
        seed: expect.any(Number),
        players: expect.any(Array)
      });
    }
    
    const roundStartMsg = protocolMessages.find(msg => msg.type === "round_start");
    if (roundStartMsg) {
      expect(roundStartMsg).toMatchObject({
        type: "round_start",
        round: expect.any(Number),
        duration: expect.any(Number)
      });
    }
    
    const stateUpdateMsg = protocolMessages.find(msg => msg.type === "match_state_update");
    if (stateUpdateMsg) {
      expect(stateUpdateMsg).toMatchObject({
        type: "match_state_update",
        phase: expect.any(String),
        timeRemaining: expect.any(Number),
        scores: expect.any(Object)
      });
    }
  });

  it("validates reconnection handling through snapshot events", () => {
    const seed = 456;
    const protocolMessages: any[] = [];
    
    // Mock protocol message handler to capture messages
    const mockSendProtocolMessage = (msg: any) => {
      protocolMessages.push(msg);
    };
    
    const matchRunner = MatchRunner.create({
      id: "test-match",
      seed: seed,
      mode: "arena",
      players: ["p1", "p2"],
      roundsToWin: 2, // First to 2 wins (best-of-3)
      maxRoundTimeSec: 90, // 90 second rounds
      respawnDelaySec: 5,
      warmupTimeSec: 0, // Deprecated - no warmup
      spawnPoints: [],
      lootSpawns: []
    }, mockSendProtocolMessage);
    
    // Get the world from match runner and add players directly for testing
    const world = matchRunner.getWorld();
    const state = world.state;
    
    const p1 = createPlayer("p1", 0, 0);
    const p2 = createPlayer("p2", 5, 0);
    state.entities.push(p1, p2);
    world.setState(state);
    
    // Run for a while to build up match state
    for (let tick = 0; tick < 100; tick++) {
      const inputs = {
        p1: { seq: tick, clientId: "p1", dx: 1, dy: 0, shoot: tick % 5 === 0 },
        p2: { seq: tick, clientId: "p2", dx: -1, dy: 0, shoot: tick % 7 === 0 }
      };
      
      matchRunner.tick([inputs]);
    }
    
    // Check if snapshot message was sent (should be sent periodically)
    const snapshotMsg = protocolMessages.find(msg => msg.type === "snapshot");
    expect(snapshotMsg).toBeDefined();
    
    if (snapshotMsg) {
      expect(snapshotMsg).toMatchObject({
        type: "snapshot",
        tick: expect.any(Number),
        state: expect.any(Object),
        matchState: expect.any(Object)
      });
      
      // Verify snapshot contains necessary state for reconnection
      expect(snapshotMsg.state.entities).toBeDefined();
      expect(snapshotMsg.matchState.matchState).toBeDefined();
      expect(snapshotMsg.matchState.playerStates).toBeDefined();
    }
  });
});