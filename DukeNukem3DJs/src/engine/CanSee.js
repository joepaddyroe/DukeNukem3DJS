/**
 * ENGINE.C cansee subset — wall LOS via hitscan (no sprite occlusion).
 */
import { hitscan } from '../engine/Hitscan.js';
import { klabs } from '../math/fixed.js';

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {number} x1
 * @param {number} y1
 * @param {number} z1
 * @param {number} sect1
 * @param {number} x2
 * @param {number} y2
 * @param {number} z2
 * @param {number} sect2
 * @returns {boolean}
 */
export function canSee(board, x1, y1, z1, sect1, x2, y2, z2, sect2) {
  if (sect1 < 0 || sect2 < 0) return false;
  x1 |= 0;
  y1 |= 0;
  z1 |= 0;
  x2 |= 0;
  y2 |= 0;
  z2 |= 0;
  const dx = (x2 - x1) | 0;
  const dy = (y2 - y1) | 0;
  const dz = (z2 - z1) | 0;
  if ((dx | dy) === 0) return sect1 === sect2;

  // art:null → skip sprite hits; wall clip only
  const hit = hitscan({
    board,
    art: null,
    xs: x1,
    ys: y1,
    zs: z1,
    sectnum: sect1,
    vx: dx,
    vy: dy,
    vz: dz,
    cliptype: 1,
  });

  const goalManhattan = (klabs(dx) + klabs(dy)) | 0;
  const hitManhattan =
    (klabs((hit.hitx | 0) - x1) + klabs((hit.hity | 0) - y1)) | 0;

  // No wall closer than the target → clear LOS
  if (hit.hitwall < 0 && hit.hitsprite < 0) return true;
  return hitManhattan >= goalManhattan - 32;
}
