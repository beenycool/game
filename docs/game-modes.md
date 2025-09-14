# Game modes design

This document defines rules, server lifecycle, spawn and loot systems, interfaces, pseudocode, protocol additions, file mappings, and a deterministic test plan for implementing game modes: 1v1 arena, Box Fight, Build Fight, Zone Wars, and Aim Training.

Sources and mappings

- Core tick and determinism: [`engine/src/sim/tick.ts`](engine/src/sim/tick.ts:1)
- State model and serialization: [`engine/src/state.ts`](engine/src/state.ts:1)
- Networking contract: [`networking/src/protocol.ts`](networking/src/protocol.ts:1)
- Realtime design guidance: [`docs/realtime-design.md`](docs/realtime-design.md:1)

Design goals

- Server-authoritative matches with deterministic simulation using PRNG seed per match.
- Mode-specific rules composed from shared subsystems (spawn, loot, weapon, build).
- Reproducible deterministic tests (seeded RNG, fixed tick).

Mode rules and flow

1) 1v1 arena

- Matchmaking: pair two players into a match instance; assign matchId and seed.
- Round flow:
  - Best of N rounds (configurable, default N=3).
  - Each round has a time limit (default 120 seconds).
  - At round start players are teleported to opposing spawn points.
- Respawn rules: no respawn during round; eliminated players spectate until round end.
- Win conditions:
  - First player to reduce opponent HP to 0 wins the round.
  - If time expires, higher HP wins; tie -> sudden death (30s).
- Round transition: 5s scoreboard, reset player states, refill ammo, re-equip.

2) Box fight

- Small contained arena with immediate combat.
- Auto-equip preset loadout on spawn.
- Round time: short rounds (default 90s) with instant respawn after 3s.
- Build rules: builds limited to inside box; limited pieces per player.
- Win: highest eliminations or last-man-standing.

3) Build fight

- Build-focused with pre-placed mats and enabled edits.
- Materials: unlimited placement but per-piece cooldown (e.g., 100ms).
- Round time: default 180s with respawn after 5s.
- Pre-placed mats and resources placed deterministically by match seed.
- Win: highest eliminations or survival on time expiry.

4) Zone wars

- Shrinking circle mechanics with safe and damage zones.
- Circle schedule: deterministic array of {center,radius,duration,damagePerTick} seeded per match.
- Players outside safe zone take periodic damage.
- Loot: initial loot seeded; scheduled supply drops at specific ticks.
- Win: last alive or top survival score.

5) Aim training

- Targets spawn in seed-driven patterns (static, moving, pop-up).
- Scoring: hits, accuracy, time-to-hit, streaks.
- Sessions configurable by duration or target count.

Server-authoritative match lifecycle

States: Lobby -> MatchInit -> RoundStart -> InRound -> RoundEnd -> MatchEnd -> Spectator

- Lobby: players join; host or matchmaker creates match and seed.
- MatchInit: allocate spawn points, pre-place mats/loot using PRNG seeded by match seed.
- RoundStart: reset player HP/inventory, emit reliable spawn messages, start tick loop.
- InRound: run deterministic ticks, process inputs, spawn projectiles, evaluate zone damage, handle respawns per mode.
- RoundEnd: compute round results, emit reliable round_result and update match state.
- MatchEnd: compute final standings, persist telemetry, transition players to PostMatchLobby or Spectator.

Spawn system

Spawn point types:

- Team/Slot spawn: fixed positions for team-based or 1v1 sides.
- Random/Distributed spawn: sampled from allowed spawn regions using PRNG.
- Safe spawn: variant that validates immediate safety (no enemy overlap and clear LOS optionally).

Spawn workflow:

1. On MatchInit use matchSeed and PRNG to pick spawn points and deterministic loot spawns.
2. On spawn request choose spawn point type based on mode and run safe-spawn check.
3. If safe-spawn fails, attempt N retries with PRNG offsets; fallback to forced spawn with temporary invulnerability (e.g., 1s).

Respawn delays:

- 1v1 arena: no respawn.
- Box fight: 3s.
- Build fight: 5s.
- Zone wars: immediate respawn optional (configurable) or spectator on death.
- Aim training: immediate respawn.

Safe spawn checks:

- Check nearby enemy AABBs within radius R; ensure no intersect and no incoming projectile predicted to hit within M ticks (simple raycast sample).
- If unavoidable, grant short spawn invulnerability (1s) and spawn with minimal safe velocity.

Loot & weapon spawn rules (per mode)

Determinism:

- All spawn/loot placement uses the match PRNG from [`engine/src/sim/prng.ts`](engine/src/sim/prng.ts:1) seeded with matchSeed.
- Spawn schedules and loot tables are derived from the PRNG so identical seeds reproduce the same sequence.

Mode rules:

- 1v1 arena:
  - No ground loot. Players start equipped with configured loadout; ammo refills at round start.
- Box fight:
  - Predefined spawn points for weapon crates (deterministic).
  - Periodic small loot respawns every T seconds into fixed crate locations.
- Build fight:
  - Weapon mats pre-placed; pickups deterministic by seed. Players start with melee and build tools.
- Zone wars:
  - Initial loot distributed across map using seeded positions.
  - Supply drops: scheduled ticks contain crates that spawn at seeded positions; crates last L seconds.
- Aim training:
  - Weapons are auto-equipped; no ammo pickups. Targets spawn based on seeded patterns.

Integration points with engine subsystems

- Deterministic tick: implement match tick loop using [`engine/src/sim/tick.ts`](engine/src/sim/tick.ts:1) World; create new match wrapper in [`engine/src/match/`](engine/src/sim/tick.ts:1) to manage match state, rounds, PRNG seeding.
- PRNG: use [`engine/src/sim/prng.ts`](engine/src/sim/prng.ts:1) and store seed in [`State.rng`](engine/src/state.ts:1).
- Entity types: spawn points and loot modeled as `Entity` (type build_piece or new type loot) in [`engine/src/state.ts`](engine/src/state.ts:1).
- Protocol hooks: emit reliable messages for spawn/despawn/round_result via messages added to [`networking/src/protocol.ts`](networking/src/protocol.ts:1).
- UI events: emit spectator transitions and round timers as reliable events to clients.

Telemetry & stats

Per-match telemetry to record:

- playerId, matchId, roundId, Kills, Deaths, Assists, DamageDealt, DamageTaken, Accuracy (shots/hits), TimeAlive, Win/Loss, Score.
- Round duration, match duration, seed, final checksum for determinism auditing.

Recording approach:

- Server accumulates per-player counters in match state; on RoundEnd/MatchEnd emit reliable telemetry event and persist to DB asynchronously.
- Emit periodic heartbeat telemetry (low frequency) with aggregated scoreboard to UI.

TypeScript interfaces (enough to implement)

[`typescript.interface()`](docs/game-modes.md:1)

```typescript
export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  type: 'team' | 'random' | 'safe';
  team?: number;
  radius?: number; // search radius for random spawn
}

export interface LootSpawn {
  id: string;
  x: number;
  y: number;
  table: string; // loot table id
  respawnTicks?: number; // zero = no respawn
  lastSpawnTick?: number;
}

export interface Round {
  id: string;
  index: number;
  startTick?: number;
  durationTicks: number;
  timeLimitSec: number;
  state: 'pending' | 'active' | 'ended';
  winners?: string[]; // player ids
}

export interface Match {
  id: string;
  seed: number;
  mode: '1v1' | 'box' | 'build' | 'zone' | 'aim';
  players: string[]; // client ids
  rounds: Round[];
  currentRoundIndex: number;
  spawnPoints: SpawnPoint[];
  lootSpawns: LootSpawn[];
  prngState?: number;
  telemetry?: Record<string, any>;
}
```

Example match lifecycle pseudocode (server-side)

[`typescript()`](docs/game-modes.md:1)

```typescript
// match runner (simplified)
async function runMatch(match: Match) {
  const world = createWorld(match.seed, { tickRate: 20 }); // uses [`engine/src/sim/tick.ts`](engine/src/sim/tick.ts:1)
  match.currentRoundIndex = 0;
  for (const round of match.rounds) {
    round.state = 'active';
    round.startTick = world.state.tick;
    // spawn players deterministically
    for (const pid of match.players) {
      const sp = pickSpawnPoint(match, pid, round.index);
      const playerEnt = createPlayer(pid, sp.x, sp.y); // [`engine/src/state.ts`](engine/src/state.ts:1)
      world.state.entities.push(playerEnt);
      // emit reliable spawn
      emitReliable({ type: 'match.spawn', tick: world.state.tick, entityId: playerEnt.id, x: sp.x, y: sp.y });
    }

    // per-tick loop
    while (!roundEnded(round, world)) {
      const inputs = collectInputsForTick(world.state.tick); // from network buffers
      world.tick([inputs]);
      // evaluate hits and HP -> emit damage events (existing projectiles code)
      emitSnapshotsIfNeeded(world);
    }

    // round end
    round.state = 'ended';
    const results = computeRoundResults(world);
    emitReliable({ type: 'match.round_result', roundIndex: round.index, results });
    // cleanup entities for next round
    removeRoundEntities(world);
  }

  // match end
  emitReliable({ type: 'match.end', matchId: match.id, standings: computeStandings(match) });
}

// reconnection handling
function handleReconnect(clientId: string, matchId: string) {
  const match = getMatch(matchId);
  if (!match) return sendError();
  // send latest snapshot and reliable history (match config, round states)
  sendReliable(clientId, { type: 'match.snapshot', snapshot: serializeSnapshot(match) });
}
```

Protocol message additions (to add conceptually to [`networking/src/protocol.ts`](networking/src/protocol.ts:1))

- match.spawn
  - { type: 'match.spawn'; tick: number; entityId: string; x:number; y:number; spawnPointId?: string; invulnerableMs?: number }
- match.despawn
  - { type: 'match.despawn'; tick: number; entityId: string }
- match.round_result
  - { type: 'match.round_result'; matchId: string; roundIndex: number; results: any }
- match.end
  - { type: 'match.end'; matchId: string; standings: { playerId:string; score:number }[] }
- match.spectate
  - { type: 'match.spectate'; clientId: string; spectating: boolean; target?: string }
- match.snapshot (reliable snapshot for reconnection)
  - { type: 'match.snapshot'; tick: number; snapshot: Snapshot; matchId: string }
- match.loot_spawn
  - { type: 'match.loot_spawn'; tick: number; lootId: string; x:number; y:number; table:string }

Acceptance criteria and file mappings

- Document is actionable by Code mode to implement modes without further clarification.
- Files to add/modify:
  - engine/src/match/  -> match runner, match state manager, lobby hooks
  - engine/src/sim/spawn.ts -> spawn selection, safe-spawn checks, loot schedules
  - engine/src/sim/match_runner.ts -> orchestrate rounds using World from [`engine/src/sim/tick.ts`](engine/src/sim/tick.ts:1)
  - engine/src/state.ts -> add `loot` entity type and extend `State` with telemetry fields
  - networking/src/protocol.ts -> add message types listed above (do not edit now; list for implementers)

Short deterministic test plan

- Test 1: seed-based spawn reproducibility
  - Given seed S and match config, run match init twice and assert spawnPoints and lootSpawns are identical and checksums match.
- Test 2: match end conditions
  - Simulate fixed input sequences for two players in 1v1 and assert round results match expected outcomes deterministically.
- Test 3: loot respawn schedule
  - Advance ticks deterministically and assert loot spawns at expected ticks and positions based on seed.
- Test 4: reconnection snapshot
  - Simulate client disconnect and reconnect; verify match.snapshot sent and client can re-sync with pending inputs.

Mapping to tests and CI

- Add engine/tests/match.determinism.test.ts for seed reproducibility.
- Add engine/tests/match.lifecycle.test.ts for round transitions and reconnection.
- CI: run deterministic tests with fixed Node version and fail on checksum mismatches.

Implementation notes and constraints

- Always use match PRNG (never Math.random) inside match initialization and spawn selection.
- Keep per-tick emitted events minimal; large reliable payloads (snapshots) only when needed (reconnect).
- For performance, compact snapshots and delta encode; implement as later enhancement.

End of design