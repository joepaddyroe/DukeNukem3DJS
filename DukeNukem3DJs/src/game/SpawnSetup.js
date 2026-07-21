/**
 * GAME.C spawn subset — hide system markers, fix maskwalls, set up pickups/props.
 */
import {
  ACCESSCARD,
  ACTIVATOR,
  ACTIVATORLOCKED,
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
  MASTERSWITCH,
  RPGAMMO,
  RPGSPRITE,
  SECTOREFFECTOR,
  SHIELD,
  SHOTGUNAMMO,
  SHOTGUNSPRITE,
  SHRINKERSPRITE,
  SIXPAK,
  STEROIDS,
  TRIPBOMBSPRITE,
} from './Names.js';
import { getzsofslope } from '../engine/SectorQuery.js';

/** GAME.C / DUKE3D.H — resting sprite offset above floor */
const FOURSLEIGHT = 1 << 8;

/** NAMES.H MASKWALL1..15 */
const MASKWALL1 = 912;
const MASKWALL15 = 926;

/** System / editor markers — never drawn (GAME.C changespritestat 5 / xrepeat 0). */
const SYSTEM_PICS = new Set([
  SECTOREFFECTOR,
  ACTIVATOR,
  3, // TOUCHPLATE
  ACTIVATORLOCKED,
  5, // MUSICANDSFX
  6, // LOCATORS
  7, // CYCLER
  MASTERSWITCH,
  9, // RESPAWN
  10, // GPSPEED
  13, // FOF
]);

/**
 * @param {import('../engine/Board.js').Sprite} sp
 */
function hideSprite(sp) {
  sp.cstat = (sp.cstat | 32768) | 0;
  sp.xrepeat = 0;
  sp.yrepeat = 0;
}

/**
 * @param {number} pic
 */
export function isItemPic(pic) {
  switch (pic) {
    case FIRSTGUNSPRITE:
    case CHAINGUNSPRITE:
    case RPGSPRITE:
    case FREEZESPRITE:
    case SHRINKERSPRITE:
    case TRIPBOMBSPRITE:
    case SHOTGUNSPRITE:
    case DEVISTATORSPRITE:
    case FREEZEAMMO:
    case AMMO:
    case BATTERYAMMO:
    case DEVISTATORAMMO:
    case RPGAMMO:
    case GROWAMMO:
    case CRYSTALAMMO:
    case HBOMBAMMO:
    case AMMOLOTS:
    case SHOTGUNAMMO:
    case COLA:
    case SIXPAK:
    case FIRSTAID:
    case SHIELD:
    case STEROIDS:
    case AIRTANK:
    case JETPACK:
    case HEATSENSOR:
    case ACCESSCARD:
    case BOOTS:
    case HOLODUKE:
    case ATOMICHEALTH:
      return true;
    default:
      return false;
  }
}

/**
 * After map load — GAME.C spawn pass for items, maskwalls, system sprites.
 * @param {import('../engine/Board.js').Board} board
 */
export function applySpawnSetup(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    const pic = sp.picnum & 0xffff;

    if (SYSTEM_PICS.has(pic)) {
      hideSprite(sp);
      continue;
    }

    // APLAYER markers — only local spawn used; hide map APLAYER sprites
    if (pic === 1405) {
      hideSprite(sp);
      continue;
    }

    // MASKWALL1..15 — GAME.C: cstat = (cstat&60)|1
    if (pic >= MASKWALL1 && pic <= MASKWALL15) {
      sp.cstat = ((sp.cstat & 60) | 1) | 0;
      continue;
    }

    if (!isItemPic(pic)) continue;

    // SP skill / multiplayer palette cull (GAME.C) — ACCESSCARD keeps pal for key color
    if (pic !== ACCESSCARD && (sp.pal | 0) !== 0) {
      hideSprite(sp);
      continue;
    }

    if (pic !== ACCESSCARD) sp.pal = 0;
    sp.shade = -17;
    sp.owner = i;
    sp.cstat = 0;

    if (pic === ATOMICHEALTH) {
      sp.cstat = (sp.cstat | 128) | 0;
      sp.xrepeat = 32;
      sp.yrepeat = 32;
    } else if (pic === AMMO) {
      sp.xrepeat = 16;
      sp.yrepeat = 16;
    } else {
      // Clear blocking / wall bits — face pickup
      sp.xrepeat = 32;
      sp.yrepeat = 32;
    }

    // GAME.C makeitfall resting pose — sprite z on sector floor
    const sec = board.sectors[sp.sectnum];
    if (sec) {
      const florz = getzsofslope(board, sp.sectnum, sp.x | 0, sp.y | 0).florz | 0;
      sp.z = (florz - FOURSLEIGHT) | 0;
    }
  }
}
