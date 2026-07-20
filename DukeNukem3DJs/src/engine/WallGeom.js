/**
 * ENGINE.C wall geometry helpers — lastwall / dragpoint / rotatepoint.
 */
import { MAXWALLS } from '../core/gameConstants.js';
import { dmulscale14 } from '../math/fixed.js';
import { buildTables } from '../math/BuildTables.js';

/**
 * ENGINE.C lastwall — wall index whose point2 is `point`.
 * @param {import('./Board.js').Board} board
 * @param {number} point
 * @returns {number}
 */
export function lastwall(board, point) {
  const p = point | 0;
  if (p > 0 && (board.walls[p - 1].point2 | 0) === p) return p - 1;
  let i = p;
  let cnt = MAXWALLS;
  do {
    const j = board.walls[i].point2 | 0;
    if (j === p) return i;
    i = j;
    cnt--;
  } while (cnt > 0);
  return p;
}

/**
 * ENGINE.C dragpoint — move a wall vertex + linked nextwall verts.
 * @param {import('./Board.js').Board} board
 * @param {number} pointhighlight
 * @param {number} dax
 * @param {number} day
 */
export function dragpoint(board, pointhighlight, dax, day) {
  const walls = board.walls;
  const ph = pointhighlight | 0;
  walls[ph].x = dax | 0;
  walls[ph].y = day | 0;

  let cnt = MAXWALLS;
  let tempshort = ph;
  do {
    const nw = walls[tempshort].nextwall | 0;
    if (nw >= 0) {
      tempshort = walls[nw].point2 | 0;
      walls[tempshort].x = dax | 0;
      walls[tempshort].y = day | 0;
    } else {
      tempshort = ph;
      do {
        const lw = lastwall(board, tempshort);
        if ((walls[lw].nextwall | 0) >= 0) {
          tempshort = walls[lw].nextwall | 0;
          walls[tempshort].x = dax | 0;
          walls[tempshort].y = day | 0;
        } else {
          break;
        }
        cnt--;
      } while (tempshort !== ph && cnt > 0);
      break;
    }
    cnt--;
  } while (tempshort !== ph && cnt > 0);
}

/**
 * ENGINE.C rotatepoint.
 * @param {number} xpivot
 * @param {number} ypivot
 * @param {number} x
 * @param {number} y
 * @param {number} daang
 * @returns {{ x: number, y: number }}
 */
export function rotatepoint(xpivot, ypivot, x, y, daang) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;
  const dacos = st[(daang + 2560) & 2047] | 0;
  const dasin = st[(daang + 2048) & 2047] | 0;
  const dx = (x - xpivot) | 0;
  const dy = (y - ypivot) | 0;
  return {
    x: (dmulscale14(dx, dacos, -dy, dasin) + (xpivot | 0)) | 0,
    y: (dmulscale14(dy, dacos, dx, dasin) + (ypivot | 0)) | 0,
  };
}
