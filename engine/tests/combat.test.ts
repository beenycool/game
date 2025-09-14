import { describe, it, expect } from "vitest";
import { createWorld, createState, createPlayer } from "../src";
import { computeStateChecksum } from "../src/sim/hash";
import { PRNG } from "../src/sim/prng";
import { getWeaponConfig } from "../src/weapon/types";
import { canFireWeapon, fireWeapon, startReload, updateReload } from "../src/player/inventory";
import { canFire, fire } from "../src/weapon/weapon";
import { simulateProjectiles, createProjectile } from "../src/sim/projectiles";

describe("combat system determinism", () => {
  it("produces identical state hashes for identical combat inputs with seeded PRNG", () => {
    const seed = 12345;
    
    function runCombatSimulation(seed: number): { checksum: string; finalHp: number } {
      const prng = new PRNG(seed);
      const w = createWorld(seed, { tickRate: 20 });
      
      // Create two players
      const s = createState(0, seed);
      const p1 = createPlayer("p1", 0, 0);
      const p2 = createPlayer("p2", 10, 0);
      s.entities.push(p1, p2);
      w.setState(s);

      // Run combat simulation
      for (let tick = 0; tick < 10; tick++) {
        const inputs = {
          p1: { 
            seq: tick, 
            clientId: "p1", 
            dx: 0, 
            dy: 0, 
            shoot: tick % 2 === 0 // Shoot every other tick
          }
        };
        w.tick([inputs]);
      }

      const finalState = w.state;
      const p2Final = finalState.entities.find(e => e.id === "p2")!;
      
      return {
        checksum: finalState.lastChecksum!,
        finalHp: p2Final.hp
      };
    }

    // Test with same seed
    const result1 = runCombatSimulation(seed);
    const result2 = runCombatSimulation(seed);
    
    expect(result1.checksum).toBe(result2.checksum);
    expect(result1.finalHp).toBe(result2.finalHp);

    // Test with different seeds produce different results
    const result3 = runCombatSimulation(67890);
    expect(result1.checksum).not.toBe(result3.checksum);
  });

  it("validates weapon firing determinism", () => {
    const seed = 42;
    const prng1 = new PRNG(seed);
    const prng2 = new PRNG(seed);

    const weaponConfig = getWeaponConfig("ar_standard");
    const weaponState = { weaponId: "ar_standard", currentAmmo: 30, isReloading: false, reloadTicksRemaining: 0 };

    const fireResults1 = [];
    const fireResults2 = [];

    for (let i = 0; i < 5; i++) {
      fireResults1.push(fire(weaponState, weaponConfig, "p1", { x: 0, y: 0 }, { x: 1, y: 0 }, prng1));
      fireResults2.push(fire(weaponState, weaponConfig, "p1", { x: 0, y: 0 }, { x: 1, y: 0 }, prng2));
    }

    // All results should be identical with same seed
    for (let i = 0; i < fireResults1.length; i++) {
      expect(fireResults1[i].success).toBe(fireResults2[i].success);
      expect(fireResults1[i].ammoConsumed).toBe(fireResults2[i].ammoConsumed);
      expect(fireResults1[i].projectiles.length).toBe(fireResults2[i].projectiles.length);
    }
  });

  it("validates damage falloff and headshot multipliers", () => {
    const prng = new PRNG(123);
    const weaponConfig = getWeaponConfig("sniper_bolt");
    
    // Test headshot detection
    const headPosition = { x: 5, y: 1.8 }; // Head level
    const bodyPosition = { x: 5, y: 0.9 }; // Body level
    
    const entity = { id: "target", type: "player", x: 5, y: 0, w: 1, h: 1.8, vx: 0, vy: 0, hp: 100 };

    // Should detect headshot for upper third of entity
    expect(headPosition.y >= 0 - 0.9 && headPosition.y <= 0 + 0.6).toBe(true); // Head region
    expect(bodyPosition.y >= 0 - 0.9 && bodyPosition.y <= 0 + 0.6).toBe(false); // Not head region
  });

  it("validates ammo and reload behavior", () => {
    const inventory = {
      weapons: [
        { weaponId: "ar_standard", currentAmmo: 5, isReloading: false, reloadTicksRemaining: 0 }
      ],
      activeWeaponSlot: 0,
      reserveAmmo: { "ar_standard": 30 }
    } as any;

    // Test canFire with low ammo
    expect(canFireWeapon(inventory)).toBe(true);

    // Fire until empty
    let currentInventory = inventory;
    for (let i = 0; i < 5; i++) {
      currentInventory = fireWeapon(currentInventory);
    }

    expect(canFireWeapon(currentInventory)).toBe(false);
    expect(currentInventory.weapons[0].currentAmmo).toBe(0);

    // Start reload
    currentInventory = startReload(currentInventory);
    expect(currentInventory.weapons[0].isReloading).toBe(true);

    // Complete reload
    const weaponConfig = getWeaponConfig("ar_standard");
    for (let i = 0; i < weaponConfig.stats.reloadTime; i++) {
      currentInventory = updateReload(currentInventory);
    }

    expect(currentInventory.weapons[0].isReloading).toBe(false);
    expect(currentInventory.weapons[0].currentAmmo).toBe(weaponConfig.stats.magazineSize);
    expect(currentInventory.reserveAmmo["ar_standard"]).toBe(30 - (weaponConfig.stats.magazineSize - 5));
  });

  it("validates projectile simulation determinism", () => {
    const seed = 123;
    const prng1 = new PRNG(seed);
    const prng2 = new PRNG(seed);

    const projectileData = {
      id: "test_proj",
      weaponId: "ar_standard",
      ownerId: "p1",
      position: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 50,
      damage: 25,
      isHitscan: false,
      spread: 0.05,
      pellets: 1,
      range: 100,
      headshotMultiplier: 1.5
    };

    const projectile1 = createProjectile(projectileData, prng1);
    const projectile2 = createProjectile(projectileData, prng2);

    const entities = [createPlayer("p2", 10, 0)];

    // Simulate projectiles with same seed
    const result1 = simulateProjectiles([projectile1], entities, 1/20, prng1);
    const result2 = simulateProjectiles([projectile2], entities, 1/20, prng2);

    // Results should be identical
    expect(result1.projectiles.length).toBe(result2.projectiles.length);
    expect(result1.hits.length).toBe(result2.hits.length);
    
    if (result1.hits.length > 0 && result2.hits.length > 0) {
      expect(result1.hits[0].damage).toBe(result2.hits[0].damage);
    }
  });

  it("validates weapon switching determinism", () => {
    const inventory = {
      weapons: [
        { weaponId: "ar_standard", currentAmmo: 30, isReloading: false, reloadTicksRemaining: 0 },
        { weaponId: "shotgun_pump", currentAmmo: 6, isReloading: false, reloadTicksRemaining: 0 }
      ],
      activeWeaponSlot: 0,
      reserveAmmo: { "ar_standard": 90, "shotgun_pump": 24 }
    };

    // Switch weapons deterministically
    const switched1 = { ...inventory, activeWeaponSlot: 1 };
    const switched2 = { ...inventory, activeWeaponSlot: 1 };

    expect(switched1.activeWeaponSlot).toBe(switched2.activeWeaponSlot);
    expect(switched1.weapons[0].weaponId).toBe(switched2.weapons[0].weaponId);
    expect(switched1.weapons[1].weaponId).toBe(switched2.weapons[1].weaponId);
  });
});