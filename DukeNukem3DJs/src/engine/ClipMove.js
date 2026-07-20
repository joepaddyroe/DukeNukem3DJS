/**
 * Build ENGINE.C clipmove / getzrange / pushmove — wall subset for player walk.
 * C refs: clipmove ~5030, raytrace ~5366, keepaway ~5349, getzrange ~6200,
 * pushmove ~5399, clipinsidebox ~2534.
 *
 * clipmove does NOT write z — callers use getzrange then snap eye height.
 * Sprite clips deferred (need ART + sprite lists); walls + sector Z first.
 */
import {
  divscale16,
  divscale20,
  divscale30,
  dmulscale6,
  klabs,
  mulscale16,
  mulscale20,
  mulscale30,
  nsqrtasm,
  scale as scaleInt,
} from '../math/fixed.js';
import { getzsofslope, inside, updatesector, EYEHEIGHT } from './SectorQuery.js';
import { buildTables } from '../math/BuildTables.js';

/** CLIPMASK0 — block walls with cstat bit 0. */
export const CLIPMASK0 = (1 << 16) + 1;

const MAXCLIPDIST = 1024;
const MAXCLIPNUM = 512;
const MAXCLIPSECTORS = 128;
const CLIPMOVE_BOX_TRACE = 3;

/**
 * Ken ksgn — ENGINE.C.
 * @param {number} a
 */
function ksgn(a) {
  const v = a | 0;
  if (v < 0) return -1;
  if (v > 0) return 1;
  return 0;
}

/**
 * ENGINE.C getangle — Build angle from vector.
 * @param {number} xvect
 * @param {number} yvect
 */
export function getangle(xvect, yvect) {
  let xv = xvect | 0;
  let yv = yvect | 0;
  if ((xv | yv) === 0) return 0;
  if (xv === 0) return (512 + ((yv < 0) << 10)) & 2047;
  if (yv === 0) return ((xv < 0) << 10) & 2047;
  if (xv === yv) return (256 + ((xv < 0) << 10)) & 2047;
  if (xv === -yv) return (768 + ((xv > 0) << 10)) & 2047;
  if (!buildTables.loaded) buildTables.generateFallback();
  const radarang = buildTables.radarang;
  if (klabs(xv) > klabs(yv)) {
    const idx = 640 + scaleInt(160, yv, xv);
    const r = idx >= 0 && idx < radarang.length ? radarang[idx] | 0 : 0;
    return ((r >> 6) + ((xv < 0) << 10)) & 2047;
  }
  const idx = 640 - scaleInt(160, xv, yv);
  const r = idx >= 0 && idx < radarang.length ? radarang[idx] | 0 : 0;
  return ((r >> 6) + 512 + ((yv < 0) << 10)) & 2047;
}

/**
 * ENGINE.C rintersect — ray (x1,y1)+t*(vx,vy) vs segment (x3,y3)-(x4,y4).
 * @returns {{ x: number, y: number }|null}
 */
function rintersect(x1, y1, vx, vy, x3, y3, x4, y4) {
  const x34 = (x3 - x4) | 0;
  const y34 = (y3 - y4) | 0;
  const bot = Math.imul(vx, y34) - Math.imul(vy, x34);
  if (bot === 0) return null;
  const x31 = (x3 - x1) | 0;
  const y31 = (y3 - y1) | 0;
  let topt;
  let topu;
  if (bot > 0) {
    topt = Math.imul(x31, y34) - Math.imul(y31, x34);
    if (topt < 0) return null;
    topu = Math.imul(vx, y31) - Math.imul(vy, x31);
    if (topu < 0 || topu >= bot) return null;
  } else {
    topt = Math.imul(x31, y34) - Math.imul(y31, x34);
    if (topt > 0) return null;
    topu = Math.imul(vx, y31) - Math.imul(vy, x31);
    if (topu > 0 || topu <= bot) return null;
  }
  const t = divscale16(topt, bot);
  return {
    x: (x1 + mulscale16(vx, t)) | 0,
    y: (y1 + mulscale16(vy, t)) | 0,
  };
}

/**
 * ENGINE.C clipinsidebox.
 * @param {import('./Board.js').Board} board
 * @param {number} x
 * @param {number} y
 * @param {number} wallnum
 * @param {number} walldist
 */
function clipinsidebox(board, x, y, wallnum, walldist) {
  const wal = board.walls[wallnum];
  const wal2 = board.walls[wal.point2];
  const r = walldist << 1;
  let x1 = (wal.x + walldist - x) | 0;
  let y1 = (wal.y + walldist - y) | 0;
  let x2 = (wal2.x + walldist - x) | 0;
  let y2 = (wal2.y + walldist - y) | 0;
  if (x1 < 0 && x2 < 0) return 0;
  if (y1 < 0 && y2 < 0) return 0;
  if (x1 >= r && x2 >= r) return 0;
  if (y1 >= r && y2 >= r) return 0;
  x2 = (x2 - x1) | 0;
  y2 = (y2 - y1) | 0;
  if (Math.imul(x2, walldist - y1) >= Math.imul(y2, walldist - x1)) {
    if (x2 > 0) x2 = Math.imul(x2, 0 - y1);
    else x2 = Math.imul(x2, r - y1);
    if (y2 > 0) y2 = Math.imul(y2, r - x1);
    else y2 = Math.imul(y2, 0 - x1);
    return x2 < y2 ? 1 : 0;
  }
  if (x2 > 0) x2 = Math.imul(x2, r - y1);
  else x2 = Math.imul(x2, 0 - y1);
  if (y2 > 0) y2 = Math.imul(y2, 0 - x1);
  else y2 = Math.imul(y2, r - x1);
  return x2 >= y2 ? 2 : 0;
}

/**
 * @typedef {{ x1: number, y1: number, x2: number, y2: number, oval: number }} ClipLine
 */

/**
 * @param {ClipLine[]} clipit
 * @param {number} dax1
 * @param {number} day1
 * @param {number} dax2
 * @param {number} day2
 * @param {number} daoval
 */
function addclipline(clipit, dax1, day1, dax2, day2, daoval) {
  if (clipit.length >= MAXCLIPNUM) return;
  clipit.push({
    x1: dax1 | 0,
    y1: day1 | 0,
    x2: dax2 | 0,
    y2: day2 | 0,
    oval: daoval | 0,
  });
}

/**
 * ENGINE.C keepaway.
 * @param {{ x: number, y: number }} goal
 * @param {ClipLine} line
 */
function keepaway(goal, line) {
  const x1 = line.x1;
  const y1 = line.y1;
  const dx = (line.x2 - x1) | 0;
  const dy = (line.y2 - y1) | 0;
  const ox = ksgn(-dy);
  const oy = ksgn(dx);
  let first = klabs(dx) <= klabs(dy) ? 1 : 0;
  for (;;) {
    if (Math.imul(dx, (goal.y - y1) | 0) > Math.imul((goal.x - x1) | 0, dy)) {
      return;
    }
    if (first === 0) goal.x = (goal.x + ox) | 0;
    else goal.y = (goal.y + oy) | 0;
    first ^= 1;
  }
}

/**
 * ENGINE.C raytrace — closest clip line hit from (x3,y3) toward (*x4,*y4).
 * @param {ClipLine[]} clipit
 * @param {number} x3
 * @param {number} y3
 * @param {{ x: number, y: number }} goal mutable end point
 * @returns {number} hit index or -1
 */
function raytrace(clipit, x3, y3, goal) {
  let hitwall = -1;
  let bestX = goal.x;
  let bestY = goal.y;
  for (let z = clipit.length - 1; z >= 0; z--) {
    const L = clipit[z];
    const x1 = L.x1;
    const y1 = L.y1;
    const x2 = L.x2;
    const y2 = L.y2;
    const x21 = (x2 - x1) | 0;
    const y21 = (y2 - y1) | 0;
    let topu =
      Math.imul(x21, (y3 - y1) | 0) - Math.imul((x3 - x1) | 0, y21);
    if (topu <= 0) continue;
    if (
      Math.imul(x21, (goal.y - y1) | 0) >
      Math.imul((goal.x - x1) | 0, y21)
    ) {
      continue;
    }
    const x43 = (goal.x - x3) | 0;
    const y43 = (goal.y - y3) | 0;
    if (Math.imul(x43, (y1 - y3) | 0) > Math.imul((x1 - x3) | 0, y43)) {
      continue;
    }
    if (Math.imul(x43, (y2 - y3) | 0) <= Math.imul((x2 - x3) | 0, y43)) {
      continue;
    }
    const bot = Math.imul(x43, y21) - Math.imul(x21, y43);
    if (bot === 0) continue;

    let cnt = 256;
    let nintx;
    let ninty;
    do {
      cnt--;
      if (cnt < 0) {
        goal.x = x3;
        goal.y = y3;
        return z;
      }
      nintx = (x3 + scaleInt(x43, topu, bot)) | 0;
      ninty = (y3 + scaleInt(y43, topu, bot)) | 0;
      topu--;
    } while (
      Math.imul(x21, (ninty - y1) | 0) <= Math.imul((nintx - x1) | 0, y21)
    );

    if (
      klabs(x3 - nintx) + klabs(y3 - ninty) <
      klabs(x3 - bestX) + klabs(y3 - bestY)
    ) {
      bestX = nintx;
      bestY = ninty;
      hitwall = z;
    }
  }
  if (hitwall >= 0) {
    goal.x = bestX;
    goal.y = bestY;
  }
  return hitwall;
}

/**
 * Collect blocking wall clip lines (ENGINE.C clipmove wall loop).
 * @param {import('./Board.js').Board} board
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} sectnum
 * @param {number} gx
 * @param {number} gy
 * @param {number} walldist
 * @param {number} ceildist
 * @param {number} flordist
 * @param {number} dawalclipmask
 * @param {ClipLine[]} clipit
 * @returns {number[]} clipsectorlist
 */
function collectWallClips(
  board,
  x,
  y,
  z,
  sectnum,
  gx,
  gy,
  walldist,
  ceildist,
  flordist,
  dawalclipmask,
  clipit,
) {
  const cx = ((x + (x + gx)) >> 1) | 0;
  const cy = ((y + (y + gy)) >> 1) | 0;
  const rad =
    (nsqrtasm(Math.imul(gx, gx) + Math.imul(gy, gy)) +
      MAXCLIPDIST +
      walldist +
      8) |
    0;
  const xmin = (cx - rad) | 0;
  const ymin = (cy - rad) | 0;
  const xmax = (cx + rad) | 0;
  const ymax = (cy + rad) | 0;

  /** @type {number[]} */
  const clipsectorlist = [sectnum];
  let clipsectcnt = 0;

  while (clipsectcnt < clipsectorlist.length && clipsectcnt < MAXCLIPSECTORS) {
    const dasect = clipsectorlist[clipsectcnt++];
    const sec = board.sectors[dasect];
    const startwall = sec.wallptr;
    const endwall = startwall + sec.wallnum;

    for (let j = startwall; j < endwall; j++) {
      const wal = board.walls[j];
      const wal2 = board.walls[wal.point2];
      if (wal.x < xmin && wal2.x < xmin) continue;
      if (wal.x > xmax && wal2.x > xmax) continue;
      if (wal.y < ymin && wal2.y < ymin) continue;
      if (wal.y > ymax && wal2.y > ymax) continue;

      const x1 = wal.x;
      const y1 = wal.y;
      const x2 = wal2.x;
      const y2 = wal2.y;
      const dx = (x2 - x1) | 0;
      const dy = (y2 - y1) | 0;
      if (Math.imul(dx, (y - y1) | 0) < Math.imul((x - x1) | 0, dy)) continue;

      let dax;
      let day;
      if (dx > 0) dax = Math.imul(dx, (ymin - y1) | 0);
      else dax = Math.imul(dx, (ymax - y1) | 0);
      if (dy > 0) day = Math.imul(dy, (xmax - x1) | 0);
      else day = Math.imul(dy, (xmin - x1) | 0);
      if (dax >= day) continue;

      let clipyou = 0;
      if (wal.nextsector < 0 || (wal.cstat & dawalclipmask) !== 0) {
        clipyou = 1;
      } else {
        const hit = rintersect(x, y, gx, gy, x1, y1, x2, y2);
        const hx = hit ? hit.x : x;
        const hy = hit ? hit.y : y;
        let daz = getzsofslope(board, dasect, hx, hy).florz;
        let daz2 = getzsofslope(board, wal.nextsector, hx, hy).florz;
        const sec2 = board.sectors[wal.nextsector];
        if (daz2 < daz - (1 << 8) && (sec2.floorstat & 1) === 0) {
          if (z >= daz2 - (flordist - 1)) clipyou = 1;
        }
        if (!clipyou) {
          daz = getzsofslope(board, dasect, hx, hy).ceilz;
          daz2 = getzsofslope(board, wal.nextsector, hx, hy).ceilz;
          if (daz2 > daz + (1 << 8) && (sec2.ceilingstat & 1) === 0) {
            if (z <= daz2 + (ceildist - 1)) clipyou = 1;
          }
        }
        if (!clipyou) {
          let found = false;
          for (let i = 0; i < clipsectorlist.length; i++) {
            if (clipsectorlist[i] === wal.nextsector) {
              found = true;
              break;
            }
          }
          if (!found && clipsectorlist.length < MAXCLIPSECTORS) {
            clipsectorlist.push(wal.nextsector);
          }
        }
      }

      if (clipyou) {
        let bsz = walldist;
        if (gx < 0) bsz = -bsz;
        addclipline(clipit, x1 - bsz, y1 - bsz, x1 - bsz, y1 + bsz, j + 32768);
        addclipline(clipit, x2 - bsz, y2 - bsz, x2 - bsz, y2 + bsz, j + 32768);
        bsz = walldist;
        if (gy < 0) bsz = -bsz;
        addclipline(clipit, x1 + bsz, y1 - bsz, x1 - bsz, y1 - bsz, j + 32768);
        addclipline(clipit, x2 + bsz, y2 - bsz, x2 - bsz, y2 - bsz, j + 32768);
        dax = walldist;
        if (dy > 0) dax = -dax;
        day = walldist;
        if (dx < 0) day = -day;
        addclipline(clipit, x1 + dax, y1 + day, x2 + dax, y2 + day, j + 32768);
      }
    }
  }
  return clipsectorlist;
}

/**
 * ENGINE.C clipmove — updates x/y/sectnum only (not z).
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} opts.z
 * @param {number} opts.sectnum
 * @param {number} opts.xvect Q14
 * @param {number} opts.yvect Q14
 * @param {number} [opts.walldist=164]
 * @param {number} [opts.ceildist=4<<8]
 * @param {number} [opts.flordist=20<<8]
 * @param {number} [opts.cliptype=CLIPMASK0]
 * @returns {{ x: number, y: number, z: number, sectnum: number, hit: number }}
 */
export function clipmove(opts) {
  const board = opts.board;
  let x = opts.x | 0;
  let y = opts.y | 0;
  const z = opts.z | 0;
  let sectnum = opts.sectnum | 0;
  let xvect = opts.xvect | 0;
  let yvect = opts.yvect | 0;
  const walldist = opts.walldist ?? 164;
  const ceildist = opts.ceildist ?? (4 << 8);
  const flordist = opts.flordist ?? (20 << 8);
  const dawalclipmask = (opts.cliptype ?? CLIPMASK0) & 0xffff;

  if (((xvect | yvect) === 0) || sectnum < 0 || !board) {
    return { x, y, z, sectnum, hit: 0 };
  }

  const oxvect = xvect;
  const oyvect = yvect;
  let goalx = (x + (xvect >> 14)) | 0;
  let goaly = (y + (yvect >> 14)) | 0;
  const gx = (goalx - x) | 0;
  const gy = (goaly - y) | 0;

  /** @type {ClipLine[]} */
  const clipit = [];
  const clipsectorlist = collectWallClips(
    board,
    x,
    y,
    z,
    sectnum,
    gx,
    gy,
    walldist,
    ceildist,
    flordist,
    dawalclipmask,
    clipit,
  );

  let retval = 0;
  let hitwall = 0;
  let cnt = CLIPMOVE_BOX_TRACE;
  /** @type {number[]} */
  const hitwalls = [];
  const goal = { x: goalx, y: goaly };

  do {
    goal.x = goalx;
    goal.y = goaly;
    hitwall = raytrace(clipit, x, y, goal);
    if (hitwall >= 0) {
      const L = clipit[hitwall];
      const lx = (L.x2 - L.x1) | 0;
      const ly = (L.y2 - L.y1) | 0;
      const templong2 = Math.imul(lx, lx) + Math.imul(ly, ly);
      if (templong2 > 0) {
        const templong1 =
          Math.imul((goalx - goal.x) | 0, lx) +
          Math.imul((goaly - goal.y) | 0, ly);
        let i = 0;
        if ((klabs(templong1) >> 11) < templong2) {
          i = divscale20(templong1, templong2);
        }
        goalx = (mulscale20(lx, i) + goal.x) | 0;
        goaly = (mulscale20(ly, i) + goal.y) | 0;
      }

      const templong1 = dmulscale6(lx, oxvect, ly, oyvect);
      for (let i = cnt + 1; i <= CLIPMOVE_BOX_TRACE; i++) {
        const j = hitwalls[i];
        if (j === undefined) continue;
        const Hj = clipit[j];
        const templong2 = dmulscale6(
          (Hj.x2 - Hj.x1) | 0,
          oxvect,
          (Hj.y2 - Hj.y1) | 0,
          oyvect,
        );
        if ((templong1 ^ templong2) < 0) {
          sectnum = updatesector(x, y, board, sectnum);
          return { x, y, z, sectnum, hit: retval };
        }
      }

      const g = { x: goalx, y: goaly };
      keepaway(g, L);
      goalx = g.x;
      goaly = g.y;
      xvect = ((goalx - goal.x) << 14) | 0;
      yvect = ((goaly - goal.y) << 14) | 0;

      if (cnt === CLIPMOVE_BOX_TRACE) retval = L.oval;
      hitwalls[cnt] = hitwall;
    }
    cnt--;
    x = goal.x;
    y = goal.y;
  } while ((xvect | yvect) !== 0 && hitwall >= 0 && cnt > 0);

  for (let j = 0; j < clipsectorlist.length; j++) {
    if (inside(x, y, board, clipsectorlist[j])) {
      return { x, y, z, sectnum: clipsectorlist[j], hit: retval };
    }
  }

  sectnum = updatesector(x, y, board, sectnum);
  if (sectnum >= 0 && inside(x, y, board, sectnum)) {
    return { x, y, z, sectnum, hit: retval };
  }

  // ENGINE.C: scan all sectors by vertical distance to z
  let best = -1;
  let bestDist = 0x7fffffff;
  for (let j = board.numsectors - 1; j >= 0; j--) {
    if (!inside(x, y, board, j)) continue;
    const sec = board.sectors[j];
    let d;
    if (sec.ceilingstat & 2) {
      d = (getzsofslope(board, j, x, y).ceilz - z) | 0;
    } else {
      d = (sec.ceilingz - z) | 0;
    }
    if (d > 0) {
      if (d < bestDist) {
        best = j;
        bestDist = d;
      }
    } else {
      if (sec.floorstat & 2) {
        d = (z - getzsofslope(board, j, x, y).florz) | 0;
      } else {
        d = (z - sec.floorz) | 0;
      }
      if (d <= 0) {
        return { x, y, z, sectnum: j, hit: retval };
      }
      if (d < bestDist) {
        best = j;
        bestDist = d;
      }
    }
  }
  return { x, y, z, sectnum: best, hit: retval };
}

/**
 * ENGINE.C getzrange — sector floors/ceilings in walldist box (sprites later).
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} opts.z
 * @param {number} opts.sectnum
 * @param {number} [opts.walldist=163]
 * @param {number} [opts.cliptype=CLIPMASK0]
 * @returns {{ ceilz: number, ceilhit: number, florz: number, florhit: number }}
 */
export function getzrange(opts) {
  const board = opts.board;
  const x = opts.x | 0;
  const y = opts.y | 0;
  const z = opts.z | 0;
  let sectnum = opts.sectnum | 0;
  const walldist = opts.walldist ?? 163;
  const dawalclipmask = (opts.cliptype ?? CLIPMASK0) & 0xffff;

  if (sectnum < 0 || !board) {
    return {
      ceilz: -0x80000000,
      ceilhit: -1,
      florz: 0x7fffffff,
      florhit: -1,
    };
  }

  const i = (walldist + MAXCLIPDIST + 1) | 0;
  const xmin = (x - i) | 0;
  const ymin = (y - i) | 0;
  const xmax = (x + i) | 0;
  const ymax = (y + i) | 0;

  const z0 = getzsofslope(board, sectnum, x, y);
  let ceilz = z0.ceilz;
  let florz = z0.florz;
  let ceilhit = sectnum + 16384;
  let florhit = sectnum + 16384;

  /** @type {number[]} */
  const clipsectorlist = [sectnum];
  let clipsectcnt = 0;

  while (clipsectcnt < clipsectorlist.length && clipsectcnt < MAXCLIPSECTORS) {
    const dasect = clipsectorlist[clipsectcnt];
    const sec = board.sectors[dasect];
    const startwall = sec.wallptr;
    const endwall = startwall + sec.wallnum;

    for (let j = startwall; j < endwall; j++) {
      const wal = board.walls[j];
      const k = wal.nextsector;
      if (k < 0) continue;
      const wal2 = board.walls[wal.point2];
      const x1 = wal.x;
      const x2 = wal2.x;
      if (x1 < xmin && x2 < xmin) continue;
      if (x1 > xmax && x2 > xmax) continue;
      const y1 = wal.y;
      const y2 = wal2.y;
      if (y1 < ymin && y2 < ymin) continue;
      if (y1 > ymax && y2 > ymax) continue;

      const dx = (x2 - x1) | 0;
      const dy = (y2 - y1) | 0;
      if (Math.imul(dx, (y - y1) | 0) < Math.imul((x - x1) | 0, dy)) continue;

      let dax;
      let day;
      if (dx > 0) dax = Math.imul(dx, (ymin - y1) | 0);
      else dax = Math.imul(dx, (ymax - y1) | 0);
      if (dy > 0) day = Math.imul(dy, (xmax - x1) | 0);
      else day = Math.imul(dy, (xmin - x1) | 0);
      if (dax >= day) continue;
      if (wal.cstat & dawalclipmask) continue;

      const nsec = board.sectors[k];
      if ((nsec.ceilingstat & 1) === 0 && z <= nsec.ceilingz + (3 << 8)) {
        continue;
      }
      if ((nsec.floorstat & 1) === 0 && z >= nsec.floorz - (3 << 8)) {
        continue;
      }

      let found = false;
      for (let ii = 0; ii < clipsectorlist.length; ii++) {
        if (clipsectorlist[ii] === k) {
          found = true;
          break;
        }
      }
      if (!found && clipsectorlist.length < MAXCLIPSECTORS) {
        clipsectorlist.push(k);
      }

      if (x1 < xmin + MAXCLIPDIST && x2 < xmin + MAXCLIPDIST) continue;
      if (x1 > xmax - MAXCLIPDIST && x2 > xmax - MAXCLIPDIST) continue;
      if (y1 < ymin + MAXCLIPDIST && y2 < ymin + MAXCLIPDIST) continue;
      if (y1 > ymax - MAXCLIPDIST && y2 > ymax - MAXCLIPDIST) continue;
      if (dx > 0) dax += Math.imul(dx, MAXCLIPDIST);
      else dax -= Math.imul(dx, MAXCLIPDIST);
      if (dy > 0) day -= Math.imul(dy, MAXCLIPDIST);
      else day += Math.imul(dy, MAXCLIPDIST);
      if (dax >= day) continue;

      const zz = getzsofslope(board, k, x, y);
      if (zz.ceilz > ceilz) {
        ceilz = zz.ceilz;
        ceilhit = k + 16384;
      }
      if (zz.florz < florz) {
        florz = zz.florz;
        florhit = k + 16384;
      }
    }
    clipsectcnt++;
  }

  return { ceilz, ceilhit, florz, florhit };
}

/**
 * ENGINE.C pushmove — shove out of walls (wall half; face-sprite push commented in C).
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} opts.z
 * @param {number} opts.sectnum
 * @param {number} [opts.walldist=128]
 * @param {number} [opts.ceildist=4<<8]
 * @param {number} [opts.flordist=20<<8]
 * @param {number} [opts.cliptype=CLIPMASK0]
 * @returns {{ x: number, y: number, z: number, sectnum: number, bad: number }}
 */
export function pushmove(opts) {
  const board = opts.board;
  let x = opts.x | 0;
  let y = opts.y | 0;
  const z = opts.z | 0;
  let sectnum = opts.sectnum | 0;
  const walldist = opts.walldist ?? 128;
  const ceildist = opts.ceildist ?? (4 << 8);
  const flordist = opts.flordist ?? (20 << 8);
  const dawalclipmask = (opts.cliptype ?? CLIPMASK0) & 0xffff;

  if (sectnum < 0 || !board) {
    return { x, y, z, sectnum, bad: -1 };
  }

  let k = 32;
  let dir = 1;
  let bad = 0;

  do {
    bad = 0;
    /** @type {number[]} */
    const clipsectorlist = [sectnum];
    let clipsectcnt = 0;

    while (clipsectcnt < clipsectorlist.length && clipsectcnt < MAXCLIPSECTORS) {
      const dasect = clipsectorlist[clipsectcnt];
      const sec = board.sectors[dasect];
      let startwall;
      let endwall;
      if (dir > 0) {
        startwall = sec.wallptr;
        endwall = startwall + sec.wallnum;
      } else {
        endwall = sec.wallptr;
        startwall = endwall + sec.wallnum;
      }

      for (let i = startwall; i !== endwall; i += dir) {
        const wal = board.walls[i];
        if (clipinsidebox(board, x, y, i, walldist - 4) !== 1) continue;

        let j = 0;
        if (wal.nextsector < 0) j = 1;
        if (wal.cstat & dawalclipmask) j = 1;
        if (j === 0) {
          const wal2 = board.walls[wal.point2];
          const sec2 = board.sectors[wal.nextsector];
          let dax = (wal2.x - wal.x) | 0;
          let day = (wal2.y - wal.y) | 0;
          let daz =
            Math.imul(dax, (x - wal.x) | 0) + Math.imul(day, (y - wal.y) | 0);
          let t;
          if (daz <= 0) t = 0;
          else {
            const daz2 = Math.imul(dax, dax) + Math.imul(day, day);
            if (daz >= daz2) t = 1 << 30;
            else t = divscale30(daz, daz2);
          }
          dax = (wal.x + mulscale30(dax, t)) | 0;
          day = (wal.y + mulscale30(day, t)) | 0;

          let fz1 = getzsofslope(board, dasect, dax, day).florz;
          let fz2 = getzsofslope(board, wal.nextsector, dax, day).florz;
          if (fz2 < fz1 - (1 << 8) && (sec2.floorstat & 1) === 0) {
            if (z >= fz2 - (flordist - 1)) j = 1;
          }
          fz1 = getzsofslope(board, dasect, dax, day).ceilz;
          fz2 = getzsofslope(board, wal.nextsector, dax, day).ceilz;
          if (fz2 > fz1 + (1 << 8) && (sec2.ceilingstat & 1) === 0) {
            if (z <= fz2 + (ceildist - 1)) j = 1;
          }
        }

        if (j !== 0) {
          const wal2 = board.walls[wal.point2];
          const ang = getangle((wal2.x - wal.x) | 0, (wal2.y - wal.y) | 0);
          const dx = buildTables.sin((ang + 1024) & 2047) >> 11;
          const dy = buildTables.sin((ang + 512) & 2047) >> 11;
          let bad2 = 16;
          do {
            x = (x + dx) | 0;
            y = (y + dy) | 0;
            bad2--;
            if (bad2 === 0) break;
          } while (clipinsidebox(board, x, y, i, walldist - 4) !== 0);
          bad = -1;
          k--;
          if (k <= 0) return { x, y, z, sectnum, bad };
          sectnum = updatesector(x, y, board, sectnum);
        } else if (wal.nextsector >= 0) {
          let found = false;
          for (let jj = 0; jj < clipsectorlist.length; jj++) {
            if (clipsectorlist[jj] === wal.nextsector) {
              found = true;
              break;
            }
          }
          if (!found && clipsectorlist.length < MAXCLIPSECTORS) {
            clipsectorlist.push(wal.nextsector);
          }
        }
      }
      clipsectcnt++;
    }
    dir = -dir;
  } while (bad !== 0);

  return { x, y, z, sectnum, bad };
}

/**
 * Player walk step: clipmove → pushmove → getzrange → eye height on floor.
 * Matches GAME.C / PLAYER.C order (simplified gravity: stick to floor).
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {number} opts.z
 * @param {number} opts.sectnum
 * @param {number} opts.xvect
 * @param {number} opts.yvect
 * @param {number} [opts.walldist=164]
 * @param {number} [opts.ceildist=4<<8]
 * @param {number} [opts.flordist=20<<8]
 * @param {number} [opts.cliptype=CLIPMASK0]
 * @param {number} [opts.pheight=EYEHEIGHT]
 */
export function movePlayer(opts) {
  const pheight = opts.pheight ?? EYEHEIGHT;
  const walldist = opts.walldist ?? 164;
  const ceildist = opts.ceildist ?? (4 << 8);
  const flordist = opts.flordist ?? (20 << 8);
  const cliptype = opts.cliptype ?? CLIPMASK0;

  let r = clipmove({
    board: opts.board,
    x: opts.x,
    y: opts.y,
    z: opts.z,
    sectnum: opts.sectnum,
    xvect: opts.xvect,
    yvect: opts.yvect,
    walldist,
    ceildist,
    flordist,
    cliptype,
  });

  if (r.sectnum < 0) {
    return {
      x: opts.x | 0,
      y: opts.y | 0,
      z: opts.z | 0,
      sectnum: opts.sectnum | 0,
    };
  }

  const pushed = pushmove({
    board: opts.board,
    x: r.x,
    y: r.y,
    z: r.z,
    sectnum: r.sectnum,
    walldist: 128,
    ceildist,
    flordist,
    cliptype,
  });
  r = { ...r, x: pushed.x, y: pushed.y, sectnum: pushed.sectnum };
  if (r.sectnum < 0) {
    return {
      x: opts.x | 0,
      y: opts.y | 0,
      z: opts.z | 0,
      sectnum: opts.sectnum | 0,
    };
  }

  const zr = getzrange({
    board: opts.board,
    x: r.x,
    y: r.y,
    z: r.z,
    sectnum: r.sectnum,
    walldist: 163,
    cliptype,
  });

  // Stand on floor with eye offset (Duke camera = feet-ish - PHEIGHT/EYEHEIGHT)
  let nz = (zr.florz - pheight) | 0;
  if (nz < zr.ceilz + ceildist) nz = (zr.ceilz + ceildist) | 0;
  // Don't sink below floor if ceiling crush
  if (nz > zr.florz - (4 << 8)) nz = (zr.florz - pheight) | 0;

  return { x: r.x, y: r.y, z: nz, sectnum: r.sectnum };
}
