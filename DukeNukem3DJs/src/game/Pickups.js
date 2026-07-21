/**
 * GAME.CON touch-pickups subset (ifpdistl RETRIEVEDISTANCE) — no CON VM yet.
 * C / CON refs: GAME.CON actor AMMO / SHOTGUNSPRITE / SIXPAK / …; GAME.C spawn.
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

/** USER.CON amounts */
const PISTOLAMMOAMOUNT = 12;
const SHOTGUNAMMOAMOUNT = 10;
const CHAINGUNAMMOAMOUNT = 50;
const RPGAMMOBOX = 5;
const CRYSTALAMMOAMOUNT = 5;
const GROWCRYSTALAMMOAMOUNT = 20;
const DEVISTATORAMMOAMOUNT = 15;
const FREEZEAMMOAMOUNT = 25;
const HANDBOMBBOX = 5;

/** DUKE3D.H weapon indices */
export const PISTOL_WEAPON = 1;
export const SHOTGUN_WEAPON = 2;
export const CHAINGUN_WEAPON = 3;
export const RPG_WEAPON = 4;
export const HANDBOMB_WEAPON = 5;
export const SHRINKER_WEAPON = 6;
export const DEVISTATOR_WEAPON = 7;
export const FREEZE_WEAPON = 10;

const MAX_AMMO = [0, 200, 50, 200, 50, 50, 50, 99, 0, 0, 99, 0];
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
 * Touch pickups near the player (GAME.CON ifpdistl path).
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player} p
 */
export function processPickups(board, p) {
  if (!board || p.cursectnum < 0) return;

  ensureInv(p);

  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.xrepeat | 0) === 0) continue;
    if ((sp.cstat | 0) & 32768) continue;

    const pic = sp.picnum & 0xffff;
    if (!isItemPic(pic)) continue;

    const dx = (sp.x | 0) - (p.posx | 0);
    const dy = (sp.y | 0) - (p.posy | 0);
    const footZ = ((p.posz | 0) + EYEHEIGHT) | 0;
    const vz = (footZ - (sp.z | 0)) >> 4;
    const dist = nsqrtasm(
      Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(vz, vz),
    );
    if (dist >= RETRIEVEDISTANCE) continue;

    if (tryTake(p, pic)) {
      hideSprite(sp);
      p.lastUse = `got ${pic}`;
    }
  }
}

/**
 * @param {import('./Player.js').Player} p
 */
function ensureInv(p) {
  if (p.extra == null) p.extra = MAX_PLAYER_HEALTH;
  if (p.shield_amount == null) p.shield_amount = 0;
  if (p.firstaid_amount == null) p.firstaid_amount = 0;
  if (p.steroids_amount == null) p.steroids_amount = 0;
  if (p.jetpack_amount == null) p.jetpack_amount = 0;
  if (p.scuba_amount == null) p.scuba_amount = 0;
  if (p.heat_amount == null) p.heat_amount = 0;
  if (p.holoduke_amount == null) p.holoduke_amount = 0;
  if (p.boot_amount == null) p.boot_amount = 0;
  p.ammo_amount = p.ammo_amount || [];
  p.gotweapon = p.gotweapon || [];
  for (let i = 0; i < 12; i++) {
    if (p.ammo_amount[i] == null) p.ammo_amount[i] = 0;
    if (p.gotweapon[i] == null) p.gotweapon[i] = 0;
  }
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} pic
 * @returns {boolean}
 */
function tryTake(p, pic) {
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
    case HBOMBAMMO:
      return addWeapon(p, HANDBOMB_WEAPON, HANDBOMBBOX);
    case CRYSTALAMMO:
      return addAmmo(p, SHRINKER_WEAPON, CRYSTALAMMOAMOUNT);
    case GROWAMMO:
      return addAmmo(p, SHRINKER_WEAPON, GROWCRYSTALAMMOAMOUNT);
    case DEVISTATORAMMO:
      return addAmmo(p, DEVISTATOR_WEAPON, DEVISTATORAMMOAMOUNT);
    case FREEZEAMMO:
      return addAmmo(p, FREEZE_WEAPON, FREEZEAMMOAMOUNT);
    case FIRSTGUNSPRITE:
      return addWeapon(p, PISTOL_WEAPON, 48);
    case SHOTGUNSPRITE:
      return addWeapon(p, SHOTGUN_WEAPON, SHOTGUNAMMOAMOUNT);
    case CHAINGUNSPRITE:
      return addWeapon(p, CHAINGUN_WEAPON, 50);
    case RPGSPRITE:
      return addWeapon(p, RPG_WEAPON, RPGAMMOBOX);
    case SHRINKERSPRITE:
      return addWeapon(p, SHRINKER_WEAPON, 10);
    case FREEZESPRITE:
      return addWeapon(p, FREEZE_WEAPON, FREEZEAMMOAMOUNT);
    case DEVISTATORSPRITE:
      return addWeapon(p, DEVISTATOR_WEAPON, DEVISTATORAMMOAMOUNT);
    case COLA:
      return addHealth(p, 10);
    case SIXPAK:
      return addHealth(p, 30);
    case ATOMICHEALTH:
      return addHealth(p, 50);
    case FIRSTAID:
      if ((p.firstaid_amount | 0) >= 100) return false;
      p.firstaid_amount = 100;
      return true;
    case SHIELD:
      if ((p.shield_amount | 0) >= MAX_ARMOUR) return false;
      p.shield_amount = Math.min(MAX_ARMOUR, (p.shield_amount | 0) + 50);
      return true;
    case STEROIDS:
      p.steroids_amount = 400;
      return true;
    case AIRTANK:
      p.scuba_amount = 6400;
      return true;
    case JETPACK:
      p.jetpack_amount = 1600;
      return true;
    case HEATSENSOR:
      p.heat_amount = 1200;
      return true;
    case HOLODUKE:
      p.holoduke_amount = 2400;
      return true;
    case BOOTS:
      p.boot_amount = 200;
      return true;
    case ACCESSCARD:
      p.lastUse = 'access card';
      return true;
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
  p.ammo_amount[weapon] = Math.min(max, cur + (amount | 0));
  return true;
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} weapon
 * @param {number} amount
 */
function addWeapon(p, weapon, amount) {
  p.gotweapon[weapon] = 1;
  addAmmo(p, weapon, amount);
  return true;
}
