/**
 * SECTOR.C setanimation / doanimations — sector floor/ceiling Z movers.
 */
import { TICSPERFRAME } from '../core/gameConstants.js';

export const MAXANIMATES = 64;

/**
 * @typedef {{
 *   sect: number,
 *   field: 'floorz'|'ceilingz',
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
 * @param {number} animsect
 * @param {'floorz'|'ceilingz'} field
 * @param {number} thegoal
 * @param {number} thevel
 * @returns {number} slot index or -1
 */
export function setAnimation(board, animsect, field, thegoal, thevel) {
  if (animates.length >= MAXANIMATES - 1) return -1;
  const sec = board.sectors[animsect];
  if (!sec) return -1;
  const cur = sec[field] | 0;
  let j = animates.findIndex((a) => a.sect === animsect && a.field === field);
  if (j < 0) {
    j = animates.length;
    animates.push({
      sect: animsect | 0,
      field,
      goal: thegoal | 0,
      vel: 0,
    });
  }
  const slot = animates[j];
  slot.sect = animsect | 0;
  slot.field = field;
  slot.goal = thegoal | 0;
  slot.vel = thegoal >= cur ? thevel | 0 : (-thevel) | 0;
  return j;
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {number} animsect
 * @param {'floorz'|'ceilingz'} field
 * @returns {number} slot index or -1
 */
export function getAnimationGoal(board, animsect, field) {
  return animates.findIndex((a) => a.sect === animsect && a.field === field);
}

/**
 * Advance all door/elevator animations one tic.
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player|null} [player]
 */
export function doAnimations(board, player = null) {
  for (let i = animates.length - 1; i >= 0; i--) {
    const slot = animates[i];
    const sec = board.sectors[slot.sect];
    if (!sec) {
      animates.splice(i, 1);
      continue;
    }
    let a = sec[slot.field] | 0;
    const v = (slot.vel * TICSPERFRAME) | 0;
    const goal = slot.goal | 0;

    if (a === goal) {
      animates.splice(i, 1);
      continue;
    }

    if (v > 0) a = Math.min(a + v, goal) | 0;
    else a = Math.max(a + v, goal) | 0;

    if (slot.field === 'floorz' && player && (player.cursectnum | 0) === slot.sect) {
      if ((sec.floorz - player.posz) < (64 << 8)) {
        player.posz = (player.posz + v) | 0;
        player.poszv = 0;
      }
    }

    sec[slot.field] = a;
  }
}

/** @returns {number} */
export function animationCount() {
  return animates.length;
}
