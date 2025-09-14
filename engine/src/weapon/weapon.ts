/**
 * Weapon logic and ammo management system.
 * Handles firing, reloading, and weapon state management deterministically.
 */

import { PRNG } from "../sim/prng";
import { getWeaponConfig, WeaponConfig, WeaponState } from "./types";
import { canFireWeapon, fireWeapon, startReload, updateReload } from "../player/inventory";

export interface FireResult {
  success: boolean;
  projectiles: ProjectileData[];
  ammoConsumed: number;
}

export interface ProjectileData {
  id: string;
  weaponId: string;
  ownerId: string;
  position: { x: number; y: number };
  direction: { x: number; y: number };
  speed: number;
  damage: number;
  isHitscan: boolean;
  spread: number;
  pellets: number;
  range: number;
  headshotMultiplier: number;
}

export function canFire(weaponState: WeaponState, weaponConfig: WeaponConfig): boolean {
  if (weaponState.isReloading) {
    return false;
  }

  if (weaponConfig.stats.ammoPerShot === 0) {
    return true; // Infinite ammo weapons
  }

  return weaponState.currentAmmo >= weaponConfig.stats.ammoPerShot;
}

export function fire(
  weaponState: WeaponState,
  weaponConfig: WeaponConfig,
  ownerId: string,
  position: { x: number; y: number },
  aimDirection: { x: number; y: number },
  prng: PRNG
): FireResult {
  if (!canFire(weaponState, weaponConfig)) {
    return { success: false, projectiles: [], ammoConsumed: 0 };
  }

  const projectiles: ProjectileData[] = [];
  const stats = weaponConfig.stats;

  // Calculate base direction
  const baseDirX = aimDirection.x;
  const baseDirY = aimDirection.y;
  const baseMag = Math.sqrt(baseDirX * baseDirX + baseDirY * baseDirY) || 1;

  // Generate projectiles based on weapon type
  if (weaponConfig.type === "Shotgun") {
    // Shotgun fires multiple pellets with spread
    for (let i = 0; i < stats.pellets; i++) {
      const spreadAngle = (prng.nextFloat() - 0.5) * stats.spread;
      const pelletDirX = baseDirX * Math.cos(spreadAngle) - baseDirY * Math.sin(spreadAngle);
      const pelletDirY = baseDirX * Math.sin(spreadAngle) + baseDirY * Math.cos(spreadAngle);
      
      const pelletMag = Math.sqrt(pelletDirX * pelletDirX + pelletDirY * pelletDirY) || 1;
      
      projectiles.push({
        id: `proj_${ownerId}_${prng.nextInt(0, 1000000)}`,
        weaponId: weaponConfig.id,
        ownerId,
        position: { ...position },
        direction: { x: pelletDirX / pelletMag, y: pelletDirY / pelletMag },
        speed: stats.projectileSpeed,
        damage: stats.damage,
        isHitscan: false,
        spread: 0,
        pellets: 1,
        range: stats.range,
        headshotMultiplier: stats.headshotMultiplier
      });
    }
  } else {
    // Other weapons fire single projectiles
    const spreadAngle = (prng.nextFloat() - 0.5) * stats.spread;
    const finalDirX = baseDirX * Math.cos(spreadAngle) - baseDirY * Math.sin(spreadAngle);
    const finalDirY = baseDirX * Math.sin(spreadAngle) + baseDirY * Math.cos(spreadAngle);
    
    const finalMag = Math.sqrt(finalDirX * finalDirX + finalDirY * finalDirY) || 1;

    projectiles.push({
      id: `proj_${ownerId}_${prng.nextInt(0, 1000000)}`,
      weaponId: weaponConfig.id,
      ownerId,
      position: { ...position },
      direction: { x: finalDirX / finalMag, y: finalDirY / finalMag },
      speed: stats.projectileSpeed,
      damage: stats.damage,
      isHitscan: weaponConfig.type !== "Pickaxe" && stats.projectileSpeed === 0,
      spread: stats.spread,
      pellets: 1,
      range: stats.range,
      headshotMultiplier: stats.headshotMultiplier
    });
  }

  return {
    success: true,
    projectiles,
    ammoConsumed: stats.ammoPerShot
  };
}

export function updateWeaponState(
  weaponState: WeaponState,
  dt: number
): WeaponState {
  if (weaponState.isReloading) {
    const newReloadTicks = weaponState.reloadTicksRemaining - 1;
    if (newReloadTicks <= 0) {
      return {
        ...weaponState,
        isReloading: false,
        reloadTicksRemaining: 0
      };
    } else {
      return {
        ...weaponState,
        reloadTicksRemaining: newReloadTicks
      };
    }
  }
  return weaponState;
}

export function getFireRateDelay(weaponConfig: WeaponConfig): number {
  // Convert RPM to delay between shots in seconds
  return 60 / weaponConfig.stats.rpm;
}

export function getTimeUntilNextShot(weaponState: WeaponState, weaponConfig: WeaponConfig, lastFireTick: number, currentTick: number): number {
  if (weaponState.isReloading) {
    return Infinity; // Can't fire while reloading
  }

  const fireRateDelay = getFireRateDelay(weaponConfig);
  const ticksSinceLastFire = (currentTick - lastFireTick) / 20; // Convert ticks to seconds assuming 20 tick rate
  return Math.max(0, fireRateDelay - ticksSinceLastFire);
}

export function shouldAutoReload(weaponState: WeaponState, weaponConfig: WeaponConfig): boolean {
  if (weaponState.isReloading) {
    return false; // Already reloading
  }

  if (weaponConfig.stats.ammoPerShot === 0) {
    return false; // Infinite ammo weapons don't need reloading
  }

  return weaponState.currentAmmo === 0;
}