/**
 * GAME.CON touch-pickups subset (ifpdistl RETRIEVEDISTANCE) — no CON VM yet.
 * C / CON refs: GAME.CON actor AMMO / SHOTGUNSPRITE / …; GAME.C spawn pal cull.
 */
import {
  AMMO,
  AMMOLOTS,
  BATTERYAMMO,
  CHAINGUNSPRITE,
  CRYSTALAMMO,
  DEVISTATORAMMO,
  DEVISTATORSPRITE,
  FIRSTGUNSPRITE,
  FREEZEAMMO,
  FREEZESPRITE,
  GROWAMMO,
  HBOMBAMMO,
  HEAVYHBOMB,
  RPGAMMO,
  RPGSPRITE,
  SHOTGUNAMMO,
  SHOTGUNSPRITE,
  SHRINKERSPRITE,
} from './Names.js';
import { nsqrtasm } from '../math/fixed.js';
import { EYEHEIGHT } from '../engine/SectorQuery.js';

/** USER.CON RETRIEVEDISTANCE */
export const RETRIEVEDISTANCE = 844;

/** USER.CON ammo box amounts */
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

/** USER.CON max ammo (subset) */
const MAX_AMMO = [
  0, 200, 50, 200, 50, 50, 50, 99, 0, 0, 99, 0,
];

/**
 * GAME.C spawn: single-player hides pal≠0 pickups / pipebombs,
 * then apply face-sprite size/shade for remaining items.
 * @param {import('../engine/Board.js').Board} board
 */
export function cullMultiplayerPickups(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.pal | 0) === 0) continue;
    const pic = sp.picnum & 0xffff;
    if (!isSkillCulledPic(pic)) continue;
    hideSprite(sp);
  }
  setupPickupSprites(board);
}

/**
 * GAME.C spawn pickup visuals — shade -17, AMMO 16×16, weapons 32×32, face cstat.
 * @param {import('../engine/Board.js').Board} board
 */
export function setupPickupSprites(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.xrepeat | 0) === 0) continue;
    if ((sp.cstat | 0) & 32768) continue;
    const pic = sp.picnum & 0xffff;
    if (!isPickupPic(pic)) continue;

    sp.pal = 0;
    sp.shade = -17;
    sp.cstat = 0;
    if (pic === AMMO) {
      sp.xrepeat = 16;
      sp.yrepeat = 16;
    } else {
      sp.xrepeat = 32;
      sp.yrepeat = 32;
    }
  }
}

/**
 * @param {number} pic
 */
function isSkillCulledPic(pic) {
  switch (pic) {
    case HEAVYHBOMB:
    case FIRSTGUNSPRITE:
    case CHAINGUNSPRITE:
    case SHOTGUNSPRITE:
    case RPGSPRITE:
    case SHRINKERSPRITE:
    case FREEZESPRITE:
    case DEVISTATORSPRITE:
    case SHOTGUNAMMO:
    case FREEZEAMMO:
    case HBOMBAMMO:
    case CRYSTALAMMO:
    case GROWAMMO:
    case BATTERYAMMO:
    case DEVISTATORAMMO:
    case RPGAMMO:
    case AMMO:
    case AMMOLOTS:
      return true;
    default:
      return false;
  }
}

/**
 * @param {import('../engine/Board.js').Sprite} sp
 */
function hideSprite(sp) {
  sp.cstat = (sp.cstat | 32768) | 0;
  sp.xrepeat = 0;
  sp.yrepeat = 0;
}

/**
 * Touch pickups near the player (GAME.CON ifpdistl path, no ifcanseetarget yet).
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
    if (!isPickupPic(pic)) continue;

    // SECTOR.C dist() vs player sprite at floor — use foot z, not eye posz
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
  p.ammo_amount = p.ammo_amount || [];
  p.gotweapon = p.gotweapon || [];
  for (let i = 0; i < 12; i++) {
    if (p.ammo_amount[i] == null) p.ammo_amount[i] = 0;
    if (p.gotweapon[i] == null) p.gotweapon[i] = 0;
  }
}

/**
 * @param {number} pic
 */
function isPickupPic(pic) {
  switch (pic) {
    case AMMO:
    case AMMOLOTS:
    case SHOTGUNAMMO:
    case BATTERYAMMO:
    case RPGAMMO:
    case HBOMBAMMO:
    case CRYSTALAMMO:
    case GROWAMMO:
    case DEVISTATORAMMO:
    case FREEZEAMMO:
    case FIRSTGUNSPRITE:
    case SHOTGUNSPRITE:
    case CHAINGUNSPRITE:
    case RPGSPRITE:
    case SHRINKERSPRITE:
    case FREEZESPRITE:
    case DEVISTATORSPRITE:
      return true;
    default:
      return false;
  }
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} pic
 * @returns {boolean} true if collected
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
    default:
      return false;
  }
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
  // GAME.CON always quikget after addammo — consume sprite even at max
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
