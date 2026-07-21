/**
 * GAME.CON touch-pickups — weapons, ammo, health, inventory.
 */
import {
  ACCESSCARD,
  AIRTANK,
  AMMO,
  AMMOLOTS,
  ATOMICHEALTH,
  BATTERYAMMO,
  BOOTS,
  CHAINGUNSPRITE,
  COLA,
  CRYSTALAMMO,
  DEVISTATORAMMO,
  DEVISTATORSPRITE,
  FIRSTAID,
  FIRSTGUNSPRITE,
  FREEZEAMMO,
  FREEZESPRITE,
  GROWAMMO,
  HBOMBAMMO,
  HEATSENSOR,
  HOLODUKE,
  JETPACK,
  RPGAMMO,
  RPGSPRITE,
  SHIELD,
  SHOTGUNAMMO,
  SHOTGUNSPRITE,
  SHRINKERSPRITE,
  SIXPAK,
  STEROIDS,
} from './Names.js';
import { isItemPic } from './SpawnSetup.js';
import { nsqrtasm } from '../math/fixed.js';
import { EYEHEIGHT } from '../engine/SectorQuery.js';

/** USER.CON RETRIEVEDISTANCE */
export const RETRIEVEDISTANCE = 844;

const PISTOLAMMOAMOUNT = 12;
const SHOTGUNAMMOAMOUNT = 10;
const CHAINGUNAMMOAMOUNT = 50;
const RPGAMMOBOX = 5;
const CRYSTALAMMOAMOUNT = 5;
const GROWCRYSTALAMMOAMOUNT = 20;
const DEVISTATORAMMOAMOUNT = 15;
const FREEZEAMMOAMOUNT = 25;
const HANDBOMBBOX = 5;

export const PISTOL_WEAPON = 1;
export const SHOTGUN_WEAPON = 2;
export const CHAINGUN_WEAPON = 3;
export const RPG_WEAPON = 4;
export const HANDBOMB_WEAPON = 5;
export const SHRINKER_WEAPON = 6;
export const DEVISTATOR_WEAPON = 7;
export const TRIPBOMB_WEAPON = 8;
export const FREEZE_WEAPON = 10;

const MAX_AMMO = [0, 200, 50, 200, 50, 50, 50, 99, 10, 0, 99, 0];
const MAX_PLAYER_HEALTH = 100;
const MAX_ARMOUR = 100;

/**
 * @param {import('../engine/Board.js').Sprite} sp
 */
function hideSprite(sp) {
  sp.cstat = (sp.cstat | 32768) | 0;
  sp.xrepeat = 0;
  sp.yrepeat = 0;
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player} p
 * @param {import('../platform/input/Keyboard.js').Keyboard|null} [kb]
 */
export function processPickups(board, p, kb = null) {
  if (!board || p.cursectnum < 0) return;

  ensureInv(p);
  if ((p.invdisptime | 0) > 0) p.invdisptime--;
  if (kb) cycleInventory(p, kb);

  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.xrepeat | 0) === 0) continue;
    if ((sp.cstat | 0) & 32768) continue;

    const pic = sp.picnum & 0xffff;
    if (!isItemPic(pic)) continue;

    // SECTOR.C ldist (2D) + small z gate — more reliable than full 3D eye dist
    const dx = (sp.x | 0) - (p.posx | 0);
    const dy = (sp.y | 0) - (p.posy | 0);
    const dist = (nsqrtasm(Math.imul(dx, dx) + Math.imul(dy, dy)) + 1) | 0;
    if (dist >= RETRIEVEDISTANCE) continue;

    const footZ = ((p.posz | 0) + EYEHEIGHT) | 0;
    const dz = (sp.z | 0) - footZ;
    if (dz > (48 << 8) || dz < -(64 << 8)) continue;

    if (tryTake(p, pic, sp)) {
      hideSprite(sp);
      p.last_extra = p.extra | 0;
      p.lastUse = `got ${pic}`;
    }
  }
}

/**
 * @param {import('./Player.js').Player} p
 */
function ensureInv(p) {
  if (p.extra == null) p.extra = MAX_PLAYER_HEALTH;
  if (p.last_extra == null) p.last_extra = p.extra;
  if (p.shield_amount == null) p.shield_amount = 0;
  if (p.firstaid_amount == null) p.firstaid_amount = 0;
  if (p.steroids_amount == null) p.steroids_amount = 0;
  if (p.jetpack_amount == null) p.jetpack_amount = 0;
  if (p.scuba_amount == null) p.scuba_amount = 0;
  if (p.heat_amount == null) p.heat_amount = 0;
  if (p.holoduke_amount == null) p.holoduke_amount = 0;
  if (p.boot_amount == null) p.boot_amount = 0;
  if (p.inven_icon == null) p.inven_icon = 0;
  if (p.invdisptime == null) p.invdisptime = 0;
  if (p.got_access == null) p.got_access = 0;
  p.ammo_amount = p.ammo_amount || [];
  p.gotweapon = p.gotweapon || [];
  for (let i = 0; i < 12; i++) {
    if (p.ammo_amount[i] == null) p.ammo_amount[i] = 0;
    if (p.gotweapon[i] == null) p.gotweapon[i] = 0;
  }
}

/**
 * SECTOR.C inventory cycle — [ / ]
 * @param {import('./Player.js').Player} p
 * @param {import('../platform/input/Keyboard.js').Keyboard} kb
 */
function cycleInventory(p, kb) {
  const next = kb.wasPressed('BracketRight');
  const prev = kb.wasPressed('BracketLeft');
  if (!next && !prev) return;

  /** @type {number[]} */
  const bits = [];
  if ((p.firstaid_amount | 0) > 0) bits.push(1);
  if ((p.steroids_amount | 0) > 0) bits.push(2);
  if ((p.holoduke_amount | 0) > 0) bits.push(3);
  if ((p.jetpack_amount | 0) > 0) bits.push(4);
  if ((p.heat_amount | 0) > 0) bits.push(5);
  if ((p.scuba_amount | 0) > 0) bits.push(6);
  if ((p.boot_amount | 0) > 0) bits.push(7);
  if (!bits.length) return;

  p.invdisptime = 52;
  let idx = bits.indexOf(p.inven_icon | 0);
  if (idx < 0) idx = next ? -1 : 0;
  if (next) idx = (idx + 1) % bits.length;
  else idx = (idx - 1 + bits.length) % bits.length;
  p.inven_icon = bits[idx];
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} icon
 */
function setInven(p, icon) {
  p.inven_icon = icon | 0;
  p.invdisptime = 40;
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} weapon
 */
function selectWeapon(p, weapon) {
  p.gotweapon[weapon] = 1;
  p.curr_weapon = weapon | 0;
  p.weapon_pos = -9;
  p.kickback_pic = 0;
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} pic
 * @param {import('../engine/Board.js').Sprite} [sp]
 */
function tryTake(p, pic, sp) {
  switch (pic) {
    case AMMO:
      return addAmmo(p, PISTOL_WEAPON, PISTOLAMMOAMOUNT);
    case AMMOLOTS:
      return addAmmo(p, PISTOL_WEAPON, 48);
    case SHOTGUNAMMO:
      return addAmmo(p, SHOTGUN_WEAPON, SHOTGUNAMMOAMOUNT);
    case BATTERYAMMO:
      return addAmmo(p, CHAINGUN_WEAPON, CHAINGUNAMMOAMOUNT);
    case RPGAMMO:
      return addAmmo(p, RPG_WEAPON, RPGAMMOBOX);
    case HBOMBAMMO: {
      if (!addAmmo(p, HANDBOMB_WEAPON, HANDBOMBBOX)) return false;
      selectWeapon(p, HANDBOMB_WEAPON);
      return true;
    }
    case CRYSTALAMMO:
      return addAmmo(p, SHRINKER_WEAPON, CRYSTALAMMOAMOUNT);
    case GROWAMMO:
      return addAmmo(p, SHRINKER_WEAPON, GROWCRYSTALAMMOAMOUNT);
    case DEVISTATORAMMO:
      return addAmmo(p, DEVISTATOR_WEAPON, DEVISTATORAMMOAMOUNT);
    case FREEZEAMMO:
      return addAmmo(p, FREEZE_WEAPON, FREEZEAMMOAMOUNT);
    case FIRSTGUNSPRITE: {
      if (!addAmmo(p, PISTOL_WEAPON, 48)) return false;
      selectWeapon(p, PISTOL_WEAPON);
      return true;
    }
    case SHOTGUNSPRITE: {
      if (!addAmmo(p, SHOTGUN_WEAPON, SHOTGUNAMMOAMOUNT)) return false;
      selectWeapon(p, SHOTGUN_WEAPON);
      return true;
    }
    case CHAINGUNSPRITE: {
      if (!addAmmo(p, CHAINGUN_WEAPON, 50)) return false;
      selectWeapon(p, CHAINGUN_WEAPON);
      return true;
    }
    case RPGSPRITE: {
      if (!addAmmo(p, RPG_WEAPON, RPGAMMOBOX)) return false;
      selectWeapon(p, RPG_WEAPON);
      return true;
    }
    case SHRINKERSPRITE: {
      if (!addAmmo(p, SHRINKER_WEAPON, 10)) return false;
      selectWeapon(p, SHRINKER_WEAPON);
      return true;
    }
    case FREEZESPRITE: {
      if (!addAmmo(p, FREEZE_WEAPON, FREEZEAMMOAMOUNT)) return false;
      selectWeapon(p, FREEZE_WEAPON);
      return true;
    }
    case DEVISTATORSPRITE: {
      if (!addAmmo(p, DEVISTATOR_WEAPON, DEVISTATORAMMOAMOUNT)) return false;
      selectWeapon(p, DEVISTATOR_WEAPON);
      return true;
    }
    case COLA:
      return addHealth(p, 10);
    case SIXPAK:
      return addHealth(p, 30);
    case ATOMICHEALTH:
      return addHealth(p, 50);
    case FIRSTAID:
      if ((p.firstaid_amount | 0) >= 100) return false;
      p.firstaid_amount = 100;
      setInven(p, 1);
      return true;
    case SHIELD: {
      if ((p.shield_amount | 0) >= MAX_ARMOUR) return false;
      p.shield_amount = Math.min(MAX_ARMOUR, (p.shield_amount | 0) + 50);
      return true;
    }
    case STEROIDS:
      p.steroids_amount = 400;
      setInven(p, 2);
      return true;
    case AIRTANK:
      p.scuba_amount = 6400;
      setInven(p, 6);
      return true;
    case JETPACK:
      p.jetpack_amount = 1600;
      setInven(p, 4);
      return true;
    case HEATSENSOR:
      p.heat_amount = 1200;
      setInven(p, 5);
      return true;
    case HOLODUKE:
      p.holoduke_amount = 2400;
      setInven(p, 3);
      return true;
    case BOOTS:
      p.boot_amount = 200;
      setInven(p, 7);
      return true;
    case ACCESSCARD: {
      const pal = (sp?.pal | 0) & 0xff;
      let bit = 1;
      if (pal === 21) bit = 2;
      else if (pal === 23) bit = 4;
      if ((p.got_access | 0) & bit) return false;
      p.got_access = (p.got_access | bit) | 0;
      return true;
    }
    default:
      return false;
  }
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} amount
 */
function addHealth(p, amount) {
  const cur = p.extra | 0;
  if (cur >= MAX_PLAYER_HEALTH) return false;
  p.extra = Math.min(MAX_PLAYER_HEALTH, cur + (amount | 0));
  p.last_extra = p.extra;
  return true;
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} weapon
 * @param {number} amount
 */
function addAmmo(p, weapon, amount) {
  const max = MAX_AMMO[weapon] | 0;
  if (max <= 0) return false;
  const cur = p.ammo_amount[weapon] | 0;
  if (cur >= max) return false;
  p.ammo_amount[weapon] = Math.min(max, cur + (amount | 0));
  p.gotweapon[weapon] = 1;
  return true;
}
