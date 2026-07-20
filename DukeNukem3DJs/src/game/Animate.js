/**
 * SECTOR.C setanimation / doanimations — sector Z + wall X/Y movers.
 */
import { TICSPERFRAME } from '../core/gameConstants.js';

export const MAXANIMATES = 64;

/**
 * @typedef {{
 *   sect: number,
 *   kind: 'sector'|'wall',
 *   field: 'floorz'|'ceilingz'|'x'|'y',
 *   wall?: number,
 *   goal: number,
 *   vel: number,
 * }} AnimateSlot
 */

/** @type {AnimateSlot[]} */
const animates = [];

export function clearAnimations() {
  animates.length = 0;
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {AnimateSlot} key
 * @returns {number}
 */
function findSlot(key) {
  return animates.findIndex((a) => {
    if (a.kind !== key.kind || a.field !== key.field) return false;
    if (a.kind === 'sector') return a.sect === key.sect;
    return a.wall === key.wall;
  });
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {number} animsect
 * @param {'floorz'|'ceilingz'} field
 * @param {number} thegoal
 * @param {number} thevel
 * @returns {number}
 */
export function setAnimation(board, animsect, field, thegoal, thevel) {
  if (animates.length >= MAXANIMATES - 1) return -1;
  const sec = board.sectors[animsect];
  if (!sec) return -1;
  const cur = sec[field] | 0;
  const key = { kind: /** @type {'sector'} */ ('sector'), sect: animsect | 0, field };
  let j = findSlot(key);
  if (j < 0) {
    j = animates.length;
    animates.push({
      kind: 'sector',
      sect: animsect | 0,
      field,
      goal: thegoal | 0,
      vel: 0,
    });
  }
  const slot = animates[j];
  slot.kind = 'sector';
  slot.sect = animsect | 0;
  slot.field = field;
  slot.goal = thegoal | 0;
  slot.vel = thegoal >= cur ? thevel | 0 : (-thevel) | 0;
  return j;
}

/**
 * Animate a wall point coordinate (lotag 9 sliding doors).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} animsect
 * @param {number} wallnum
 * @param {'x'|'y'} field
 * @param {number} thegoal
 * @param {number} thevel
 * @returns {number}
 */
export function setWallAnimation(board, animsect, wallnum, field, thegoal, thevel) {
  if (animates.length >= MAXANIMATES - 1) return -1;
  const wal = board.walls[wallnum];
  if (!wal) return -1;
  const cur = wal[field] | 0;
  const key = {
    kind: /** @type {'wall'} */ ('wall'),
    sect: animsect | 0,
    field,
    wall: wallnum | 0,
  };
  let j = findSlot(key);
  if (j < 0) {
    j = animates.length;
    animates.push({
      kind: 'wall',
      sect: animsect | 0,
      wall: wallnum | 0,
      field,
      goal: thegoal | 0,
      vel: 0,
    });
  }
  const slot = animates[j];
  slot.kind = 'wall';
  slot.sect = animsect | 0;
  slot.wall = wallnum | 0;
  slot.field = field;
  slot.goal = thegoal | 0;
  slot.vel = thegoal >= cur ? thevel | 0 : (-thevel) | 0;
  return j;
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {number} animsect
 * @param {'floorz'|'ceilingz'} field
 * @returns {number}
 */
export function getAnimationGoal(board, animsect, field) {
  return animates.findIndex(
    (a) => a.kind === 'sector' && a.sect === animsect && a.field === field,
  );
}

/**
 * True if any animation is running for this sector (check_activator_motion helper).
 * @param {number} sectnum
 */
export function sectorHasAnimation(sectnum) {
  return animates.some((a) => a.sect === (sectnum | 0));
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player|null} [player]
 */
export function doAnimations(board, player = null) {
  for (let i = animates.length - 1; i >= 0; i--) {
    const slot = animates[i];
    const v = (slot.vel * TICSPERFRAME) | 0;
    const goal = slot.goal | 0;

    if (slot.kind === 'sector') {
      const sec = board.sectors[slot.sect];
      if (!sec) {
        animates.splice(i, 1);
        continue;
      }
      let a = sec[slot.field] | 0;
      if (a === goal) {
        animates.splice(i, 1);
        continue;
      }
      if (v > 0) a = Math.min(a + v, goal) | 0;
      else a = Math.max(a + v, goal) | 0;

      if (
        slot.field === 'floorz' &&
        player &&
        (player.cursectnum | 0) === slot.sect
      ) {
        if ((sec.floorz - player.posz) < (64 << 8)) {
          player.posz = (player.posz + v) | 0;
          player.poszv = 0;
        }
      }
      sec[slot.field] = a;
    } else {
      const wal = board.walls[slot.wall ?? -1];
      if (!wal) {
        animates.splice(i, 1);
        continue;
      }
      let a = wal[slot.field] | 0;
      if (a === goal) {
        animates.splice(i, 1);
        continue;
      }
      if (v > 0) a = Math.min(a + v, goal) | 0;
      else a = Math.max(a + v, goal) | 0;
      wal[slot.field] = a;
    }
  }
}

/** @returns {number} */
export function animationCount() {
  return animates.length;
}
