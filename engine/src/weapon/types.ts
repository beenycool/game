/**
 * Weapon system types and definitions.
 * Deterministic weapon configurations and types.
 */

export type WeaponType = "AR" | "Shotgun" | "Sniper" | "SMG" | "Pickaxe";

export interface WeaponStat {
  damage: number;
  rpm: number; // rounds per minute
  spread: number; // accuracy/spread angle in radians
  projectileSpeed: number; // units per second
  pellets: number; // for shotguns
  range: number; // maximum effective range
  headshotMultiplier: number;
  ammoPerShot: number;
  magazineSize: number;
  reloadTime: number; // ticks to reload
}

export interface WeaponConfig {
  id: string;
  type: WeaponType;
  stats: WeaponStat;
}

export interface WeaponState {
  weaponId: string;
  currentAmmo: number;
  isReloading: boolean;
  reloadTicksRemaining: number;
}

// Sample weapon configurations
export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  "ar_standard": {
    id: "ar_standard",
    type: "AR",
    stats: {
      damage: 25,
      rpm: 600,
      spread: 0.05,
      projectileSpeed: 50,
      pellets: 1,
      range: 100,
      headshotMultiplier: 1.5,
      ammoPerShot: 1,
      magazineSize: 30,
      reloadTime: 60 // 3 seconds at 20 tick rate
    }
  },
  "shotgun_pump": {
    id: "shotgun_pump",
    type: "Shotgun",
    stats: {
      damage: 20,
      rpm: 70,
      spread: 0.15,
      projectileSpeed: 40,
      pellets: 8,
      range: 20,
      headshotMultiplier: 1.25,
      ammoPerShot: 1,
      magazineSize: 6,
      reloadTime: 80 // 4 seconds at 20 tick rate
    }
  },
  "sniper_bolt": {
    id: "sniper_bolt",
    type: "Sniper",
    stats: {
      damage: 100,
      rpm: 40,
      spread: 0.01,
      projectileSpeed: 80,
      pellets: 1,
      range: 200,
      headshotMultiplier: 2.0,
      ammoPerShot: 1,
      magazineSize: 5,
      reloadTime: 100 // 5 seconds at 20 tick rate
    }
  },
  "smg_compact": {
    id: "smg_compact",
    type: "SMG",
    stats: {
      damage: 15,
      rpm: 900,
      spread: 0.08,
      projectileSpeed: 45,
      pellets: 1,
      range: 50,
      headshotMultiplier: 1.3,
      ammoPerShot: 1,
      magazineSize: 25,
      reloadTime: 50 // 2.5 seconds at 20 tick rate
    }
  },
  "pickaxe_standard": {
    id: "pickaxe_standard",
    type: "Pickaxe",
    stats: {
      damage: 75,
      rpm: 60,
      spread: 0.2,
      projectileSpeed: 0, // melee weapon
      pellets: 1,
      range: 2,
      headshotMultiplier: 1.0,
      ammoPerShot: 0, // infinite ammo
      magazineSize: 0,
      reloadTime: 0
    }
  }
};

export function getWeaponConfig(weaponId: string): WeaponConfig {
  const config = WEAPON_CONFIGS[weaponId];
  if (!config) {
    throw new Error(`Weapon config not found: ${weaponId}`);
  }
  return config;
}