/**
 * SECTOR.C checkhitswitch + operateactivators subset.
 */
import { operateSectors } from './Operate.js';
import { sectorHasAnimation } from './Animate.js';

export const ACTIVATOR = 2;
export const ACTIVATORLOCKED = 4;
export const MASTERSWITCH = 8;

export const DIPSWITCH = 162;
export const DIPSWITCH2 = 164;
export const DIPSWITCH3 = 168;
export const HANDSWITCH = 1111;
export const PULLSWITCH = 1122;
export const SLOTDOOR = 132;
export const ACCESSSWITCH = 130;
export const ACCESSSWITCH2 = 170;
export const LIGHTSWITCH = 121;
export const LIGHTSWITCH2 = 712;
export const SPACELIGHTSWITCH = 100;
export const SPACEDOORSWITCH = 110;
export const TECHSWITCH = 115;
export const ALIENSWITCH = 116;
export const POWERSWITCH1 = 1155;
export const POWERSWITCH2 = 1162;
export const LOCKSWITCH1 = 1161;
export const MULTISWITCH = 120;
export const FRANKENSTINESWITCH = 1165;

/** Pics that toggle +1 when off / -1 when on. */
const TOGGLE_OFF = new Set([
  DIPSWITCH,
  DIPSWITCH2,
  DIPSWITCH3,
  HANDSWITCH,
  PULLSWITCH,
  SLOTDOOR,
  ACCESSSWITCH,
  ACCESSSWITCH2,
  LIGHTSWITCH,
  LIGHTSWITCH2,
  SPACELIGHTSWITCH,
  SPACEDOORSWITCH,
  TECHSWITCH,
  ALIENSWITCH,
  POWERSWITCH1,
  POWERSWITCH2,
  LOCKSWITCH1,
  FRANKENSTINESWITCH,
]);

const TOGGLE_ON = new Set([...TOGGLE_OFF].map((p) => p + 1));

/**
 * @param {number} pic
 */
function isSwitchPic(pic) {
  const p = pic & 0xffff;
  return TOGGLE_OFF.has(p) || TOGGLE_ON.has(p) || (p >= MULTISWITCH && p <= MULTISWITCH + 3);
}

/**
 * SECTOR.C check_activator_motion subset.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} lotag
 */
export function checkActivatorMotion(board, lotag) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== ACTIVATOR && (s.picnum & 0xffff) !== ACTIVATORLOCKED) {
      continue;
    }
    if ((s.lotag | 0) !== (lotag | 0)) continue;
    if (sectorHasAnimation(s.sectnum | 0)) return 1;
  }
  return 0;
}

/**
 * Flip switch tiles sharing this lotag (sprites + walls).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} lotag
 * @param {number} selfIndex
 * @param {0|1} switchtype 0=wall, 1=sprite
 */
function flipSwitches(board, lotag, selfIndex, switchtype) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.lotag | 0) !== (lotag | 0)) continue;
    const pn = s.picnum & 0xffff;
    if (pn >= MULTISWITCH && pn <= MULTISWITCH + 3) {
      s.picnum = pn >= MULTISWITCH + 3 ? MULTISWITCH : pn + 1;
      continue;
    }
    if (TOGGLE_OFF.has(pn)) s.picnum = pn + 1;
    else if (TOGGLE_ON.has(pn)) s.picnum = pn - 1;
  }
  for (let i = 0; i < board.numwalls; i++) {
    const w = board.walls[i];
    if ((w.lotag | 0) !== (lotag | 0)) continue;
    const pn = w.picnum & 0xffff;
    if (pn >= MULTISWITCH && pn <= MULTISWITCH + 3) {
      w.picnum = pn >= MULTISWITCH + 3 ? MULTISWITCH : pn + 1;
      continue;
    }
    if (TOGGLE_OFF.has(pn)) w.picnum = pn + 1;
    else if (TOGGLE_ON.has(pn)) w.picnum = pn - 1;
  }
}

/**
 * SECTOR.C operateactivators — activate sectors linked by ACTIVATOR sprites.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} low lotag
 */
export function operateActivators(board, low) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.lotag | 0) !== (low | 0)) continue;
    const pn = s.picnum & 0xffff;
    if (pn === ACTIVATORLOCKED) {
      const sec = board.sectors[s.sectnum];
      if (!sec) continue;
      if (sec.lotag & 16384) sec.lotag &= 65535 - 16384;
      else sec.lotag |= 16384;
      continue;
    }
    if (pn !== ACTIVATOR) continue;

    // hitag 1/2: only when door closed/open
    const sec = board.sectors[s.sectnum];
    if (!sec) continue;
    if ((s.hitag | 0) === 1 && sec.floorz !== sec.ceilingz) continue;
    if ((s.hitag | 0) === 2 && sec.floorz === sec.ceilingz) continue;

    operateSectors(board, s.sectnum | 0);
  }

  // Master switches (stat 6 in vanilla) — scan by picnum
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== MASTERSWITCH) continue;
    if ((s.lotag | 0) !== (low | 0)) continue;
    const next = s.hitag | 0;
    // vanilla sets extra countdown; operate immediately for subset
    if (next !== 0 && next !== (low | 0)) operateActivators(board, next);
  }
}

/**
 * SECTOR.C checkhitswitch subset.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} w sprite or wall index
 * @param {0|1} switchtype 0=wall, 1=sprite
 * @returns {boolean} true if handled
 */
export function checkHitSwitch(board, w, switchtype) {
  if (w < 0) return false;

  let lotag;
  let picnum;
  if (switchtype === 1) {
    const spr = board.sprites[w];
    if (!spr) return false;
    lotag = spr.lotag | 0;
    if (lotag === 0) return false;
    picnum = spr.picnum & 0xffff;
  } else {
    const wal = board.walls[w];
    if (!wal) return false;
    lotag = wal.lotag | 0;
    if (lotag === 0) return false;
    picnum = wal.picnum & 0xffff;
  }

  if (!isSwitchPic(picnum)) return false;
  if (checkActivatorMotion(board, lotag)) return false;

  flipSwitches(board, lotag, w, switchtype);
  operateActivators(board, lotag);
  return true;
}
