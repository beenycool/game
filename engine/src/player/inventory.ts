/**
 * Inventory management system for players.
 * Handles weapon switching, ammo management, and reloading deterministically.
 */

import { PRNG } from "../sim/prng";
import { WeaponState, WEAPON_CONFIGS, getWeaponConfig } from "../weapon/types";

export interface InventoryState {
  weapons: WeaponState[];
  activeWeaponSlot: number;
  reserveAmmo: Record<string, number>;
}

export function createDefaultInventory(): InventoryState {
  return {
    weapons: [
      {
        weaponId: "pickaxe_standard",
        currentAmmo: 0,
        isReloading: false,
        reloadTicksRemaining: 0
      },
      {
        weaponId: "ar_standard",
        currentAmmo: 30,
        isReloading: false,
        reloadTicksRemaining: 0
      }
    ],
    activeWeaponSlot: 0,
    reserveAmmo: {
      "ar_standard": 90
    }
  };
}

export function getActiveWeapon(inventory: InventoryState): WeaponState {
  return inventory.weapons[inventory.activeWeaponSlot];
}

export function getWeaponConfigForSlot(inventory: InventoryState, slot: number) {
  const weaponState = inventory.weapons[slot];
  return getWeaponConfig(weaponState.weaponId);
}

export function switchWeapon(inventory: InventoryState, slot: number): InventoryState {
  if (slot < 0 || slot >= inventory.weapons.length) {
    return inventory; // Invalid slot, no change
  }

  return {
    ...inventory,
    activeWeaponSlot: slot
  };
}

export function canFireWeapon(inventory: InventoryState): boolean {
  const weapon = getActiveWeapon(inventory);
  const config = getWeaponConfig(weapon.weaponId);
  
  if (weapon.isReloading) {
    return false;
  }

  if (config.stats.ammoPerShot === 0) {
    return true; // Infinite ammo weapons
  }

  return weapon.currentAmmo >= config.stats.ammoPerShot;
}

export function fireWeapon(inventory: InventoryState): InventoryState {
  const weapon = getActiveWeapon(inventory);
  const config = getWeaponConfig(weapon.weaponId);
  
  if (!canFireWeapon(inventory)) {
    return inventory;
  }

  const newWeapons = [...inventory.weapons];
  newWeapons[inventory.activeWeaponSlot] = {
    ...weapon,
    currentAmmo: weapon.currentAmmo - config.stats.ammoPerShot
  };

  return {
    ...inventory,
    weapons: newWeapons
  };
}

export function startReload(inventory: InventoryState): InventoryState {
  const weapon = getActiveWeapon(inventory);
  const config = getWeaponConfig(weapon.weaponId);
  
  if (weapon.isReloading || weapon.currentAmmo === config.stats.magazineSize) {
    return inventory; // Already reloading or full
  }

  const reserveAmmo = inventory.reserveAmmo[weapon.weaponId] || 0;
  if (reserveAmmo <= 0) {
    return inventory; // No ammo to reload
  }

  const newWeapons = [...inventory.weapons];
  newWeapons[inventory.activeWeaponSlot] = {
    ...weapon,
    isReloading: true,
    reloadTicksRemaining: config.stats.reloadTime
  };

  return {
    ...inventory,
    weapons: newWeapons
  };
}

export function updateReload(inventory: InventoryState): InventoryState {
  const weapon = getActiveWeapon(inventory);
  
  if (!weapon.isReloading) {
    return inventory;
  }

  const newWeapons = [...inventory.weapons];
  const newReloadTicks = weapon.reloadTicksRemaining - 1;
  
  if (newReloadTicks <= 0) {
    // Reload complete
    const config = getWeaponConfig(weapon.weaponId);
    const reserveAmmo = inventory.reserveAmmo[weapon.weaponId] || 0;
    const ammoNeeded = config.stats.magazineSize - weapon.currentAmmo;
    const ammoToAdd = Math.min(ammoNeeded, reserveAmmo);
    
    newWeapons[inventory.activeWeaponSlot] = {
      ...weapon,
      currentAmmo: weapon.currentAmmo + ammoToAdd,
      isReloading: false,
      reloadTicksRemaining: 0
    };

    const newReserveAmmo = { ...inventory.reserveAmmo };
    newReserveAmmo[weapon.weaponId] = reserveAmmo - ammoToAdd;

    return {
      ...inventory,
      weapons: newWeapons,
      reserveAmmo: newReserveAmmo
    };
  } else {
    // Still reloading
    newWeapons[inventory.activeWeaponSlot] = {
      ...weapon,
      reloadTicksRemaining: newReloadTicks
    };

    return {
      ...inventory,
      weapons: newWeapons
    };
  }
}

export function addAmmo(inventory: InventoryState, weaponId: string, amount: number): InventoryState {
  const newReserveAmmo = { ...inventory.reserveAmmo };
  newReserveAmmo[weaponId] = (newReserveAmmo[weaponId] || 0) + amount;

  return {
    ...inventory,
    reserveAmmo: newReserveAmmo
  };
}

export function addWeapon(inventory: InventoryState, weaponId: string, prng?: PRNG): InventoryState {
  const config = WEAPON_CONFIGS[weaponId];
  if (!config) {
    return inventory; // Invalid weapon
  }

  // Check if weapon already exists
  const existingIndex = inventory.weapons.findIndex(w => w.weaponId === weaponId);
  if (existingIndex !== -1) {
    return inventory; // Already have this weapon
  }

  // Add new weapon with full ammo
  const newWeapon: WeaponState = {
    weaponId,
    currentAmmo: config.stats.magazineSize,
    isReloading: false,
    reloadTicksRemaining: 0
  };

  const newWeapons = [...inventory.weapons, newWeapon];
  
  // Add reserve ammo
  const newReserveAmmo = { ...inventory.reserveAmmo };
  newReserveAmmo[weaponId] = (newReserveAmmo[weaponId] || 0) + config.stats.magazineSize * 2;

  return {
    ...inventory,
    weapons: newWeapons,
    reserveAmmo: newReserveAmmo
  };
}