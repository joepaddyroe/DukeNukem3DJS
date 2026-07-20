import { getzsofslope, inside, updatesector, EYEHEIGHT } from './SectorQuery.js';

/**
 * Build clipmove subset (ENGINE.C) — wall collision for player walk.
 * Skips sprite clips and full slide iteration; enough to explore E1L1.
 *
 * clipmove(x,y,z,sect, xvect,yvect, walldist, ceildist, flordist, cliptype)
 * xvect/yvect are Q14 deltas (goal = pos + vect>>14).
 */

/** CLIPMASK0 — block walls with cstat bit 0 (blocking). */
export const CLIPMASK0 = (1 << 16) + 1;

const MAX_CLIP_SECTORS = 64;
const MAX_CLIP_LINES = 256;

/**
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} opts.z
 * @param {number} opts.sectnum
 * @param {number} opts.xvect  Q14
 * @param {number} opts.yvect  Q14
 * @param {number} [opts.walldist=164]
 * @param {number} [opts.ceildist=4<<8]
 * @param {number} [opts.flordist=20<<8]
 * @param {number} [opts.cliptype=CLIPMASK0]
 * @param {number} [opts.pheight] eye height above floor (default EYEHEIGHT)
 * @returns {{ x: number, y: number, z: number, sectnum: number }}
 */
export function clipmove(opts) {
  const board = opts.board;
  let x = opts.x | 0;
  let y = opts.y | 0;
  let z = opts.z | 0;
  let sectnum = opts.sectnum | 0;
  const xvect = opts.xvect | 0;
  const yvect = opts.yvect | 0;
  const walldist = opts.walldist ?? 164;
  const ceildist = opts.ceildist ?? (4 << 8);
  const flordist = opts.flordist ?? (20 << 8);
  const dawalclipmask = (opts.cliptype ?? CLIPMASK0) & 0xffff;

  if ((!xvect && !yvect) || sectnum < 0 || !board) {
    return { x, y, z, sectnum };
  }

  const goalx = x + (xvect >> 14);
  const goaly = y + (yvect >> 14);
  const gx = goalx - x;
  const gy = goaly - y;

  /** @type {{ x1: number, y1: number, x2: number, y2: number }[]} */
  const lines = [];
  const clipSectors = [sectnum];
  const seen = new Set([sectnum]);

  for (let si = 0; si < clipSectors.length && si < MAX_CLIP_SECTORS; si++) {
    const dasect = clipSectors[si];
    const sec = board.sectors[dasect];
    const start = sec.wallptr;
    const end = start + sec.wallnum;

    for (let j = start; j < end; j++) {
      if (lines.length >= MAX_CLIP_LINES) break;
      const wal = board.walls[j];
      const wal2 = board.walls[wal.point2];
      const x1 = wal.x;
      const y1 = wal.y;
      const x2 = wal2.x;
      const y2 = wal2.y;
      const dx = x2 - x1;
      const dy = y2 - y1;

      // Wall must face the mover (same test as ENGINE.C)
      if (dx * (y - y1) < (x - x1) * dy) continue;

      let clipyou = 0;
      if (wal.nextsector < 0 || (wal.cstat & dawalclipmask) !== 0) {
        clipyou = 1;
      } else {
        const hit = rayWallHit(x, y, gx, gy, x1, y1, x2, y2);
        const hx = hit ? hit.x : x;
        const hy = hit ? hit.y : y;
        const daz = getzsofslope(board, dasect, hx, hy).florz;
        const daz2 = getzsofslope(board, wal.nextsector, hx, hy).florz;
        const sec2 = board.sectors[wal.nextsector];
        // Step up too high
        if (daz2 < daz - (1 << 8) && (sec2.floorstat & 1) === 0) {
          if (z >= daz2 - (flordist - 1)) clipyou = 1;
        }
        if (!clipyou) {
          const c1 = getzsofslope(board, dasect, hx, hy).ceilz;
          const c2 = getzsofslope(board, wal.nextsector, hx, hy).ceilz;
          if (c2 > c1 + (1 << 8) && (sec2.ceilingstat & 1) === 0) {
            if (z <= c2 + (ceildist - 1)) clipyou = 1;
          }
        }
        // Huge drop (void) — treat as block for walking
        if (!clipyou && daz2 - daz > 65536) clipyou = 1;

        if (!clipyou && !seen.has(wal.nextsector)) {
          seen.add(wal.nextsector);
          clipSectors.push(wal.nextsector);
        }
      }

      if (clipyou) {
        // Inflated wall segment (ENGINE.C addclipline subset)
        let dax = walldist;
        if (dy > 0) dax = -dax;
        let day = walldist;
        if (dx < 0) day = -day;
        lines.push({
          x1: x1 + dax,
          y1: y1 + day,
          x2: x2 + dax,
          y2: y2 + day,
        });
      }
    }
  }

  // Try full move, else slide on X then Y (simple clipmove)
  let nx = goalx;
  let ny = goaly;
  if (hitsAny(x, y, nx, ny, lines)) {
    nx = goalx;
    ny = y;
    if (hitsAny(x, y, nx, ny, lines)) {
      nx = x;
      ny = goaly;
      if (hitsAny(x, y, nx, ny, lines)) {
        nx = x;
        ny = y;
      }
    }
  }

  let sect = sectnum;
  if (!inside(nx, ny, board, sect)) {
    sect = updatesector(nx, ny, board, sect);
  }
  if (sect < 0) {
    return { x, y, z, sectnum };
  }

  const florz = getzsofslope(board, sect, nx, ny).florz;
  const ceilz = getzsofslope(board, sect, nx, ny).ceilz;
  // Preserve eye height above floor across steps (spawn = sprite.z - PHEIGHT).
  const oldFlor = getzsofslope(board, sectnum, x, y).florz;
  let eyeOff = oldFlor - z;
  if (eyeOff < (4 << 8)) eyeOff = opts.pheight ?? EYEHEIGHT;
  let nz = florz - eyeOff;
  // Keep under ceiling
  if (nz < ceilz + ceildist) nz = ceilz + ceildist;

  return { x: nx, y: ny, z: nz, sectnum: sect };
}

/**
 * Segment intersection: does move (x,y)→(nx,ny) cross clip line?
 * @param {number} x
 * @param {number} y
 * @param {number} nx
 * @param {number} ny
 * @param {{ x1: number, y1: number, x2: number, y2: number }[]} lines
 */
function hitsAny(x, y, nx, ny, lines) {
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (segmentsIntersect(x, y, nx, ny, L.x1, L.y1, L.x2, L.y2)) return true;
  }
  return false;
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} cx
 * @param {number} cy
 * @param {number} dx
 * @param {number} dy
 */
function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const abx = bx - ax;
  const aby = by - ay;
  const cdx = dx - cx;
  const cdy = dy - cy;
  const den = abx * cdy - aby * cdx;
  if (den === 0) return false;
  const acx = cx - ax;
  const acy = cy - ay;
  const t = (acx * cdy - acy * cdx) / den;
  const u = (acx * aby - acy * abx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Ray from (x,y) along (gx,gy) vs wall segment — for step height sample.
 * @returns {{ x: number, y: number }|null}
 */
function rayWallHit(x, y, gx, gy, x1, y1, x2, y2) {
  const den = gx * (y2 - y1) - gy * (x2 - x1);
  if (den === 0) return null;
  const t = ((x1 - x) * (y2 - y1) - (y1 - y) * (x2 - x1)) / den;
  const u = ((x1 - x) * gy - (y1 - y) * gx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: x + gx * t, y: y + gy * t };
}
