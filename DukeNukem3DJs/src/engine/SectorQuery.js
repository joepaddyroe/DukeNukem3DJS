/**
 * inside() — ENGINE.C point-in-sector test.
 * @param {number} x
 * @param {number} y
 * @param {import('./Board.js').Board} board
 * @param {number} sectnum
 * @returns {boolean}
 */
export function inside(x, y, board, sectnum) {
  if (sectnum < 0 || sectnum >= board.numsectors) return false;

  const sec = board.sectors[sectnum];
  const walls = board.walls;
  let cnt = 0;
  const start = sec.wallptr;
  const end = start + sec.wallnum;

  for (let w = start; w < end; w++) {
    const wal0 = walls[w];
    const wal1 = walls[wal0.point2];
    const y1 = wal0.y - y;
    const y2 = wal1.y - y;
    if ((y1 ^ y2) < 0) {
      const x1 = wal0.x - x;
      const x2 = wal1.x - x;
      if ((x1 ^ x2) >= 0) {
        cnt ^= x1;
      } else {
        cnt ^= (x1 * y2 - x2 * y1) ^ y2;
      }
    }
  }
  return (cnt >>> 31) !== 0;
}

/**
 * updatesector — ENGINE.C: prefer hint, then neighbor sectors, then full scan.
 * @param {number} x
 * @param {number} y
 * @param {import('./Board.js').Board} board
 * @param {number} sectHint
 * @returns {number} sector index or -1
 */
export function updatesector(x, y, board, sectHint) {
  if (sectHint >= 0 && sectHint < board.numsectors && inside(x, y, board, sectHint)) {
    return sectHint;
  }
  if (sectHint >= 0 && sectHint < board.numsectors) {
    const sec = board.sectors[sectHint];
    const start = sec.wallptr;
    const end = start + sec.wallnum;
    for (let w = start; w < end; w++) {
      const next = board.walls[w].nextsector;
      if (next >= 0 && inside(x, y, board, next)) return next;
    }
  }
  for (let i = board.numsectors - 1; i >= 0; i--) {
    if (inside(x, y, board, i)) return i;
  }
  return -1;
}

/** Duke DUKE3D.H — PHEIGHT (38<<8) sprite/body offset. */
export const PHEIGHT = 38 << 8;

/** PLAYER.C standing eye above floor (40<<8). */
export const EYEHEIGHT = 40 << 8;

/** NAMES.H — APLAYER */
export const APLAYER = 1405;

/**
 * getzsofslope — ENGINE.C floor/ceiling Z at (x,y) including heinum slopes.
 * @param {import('./Board.js').Board} board
 * @param {number} sectnum
 * @param {number} dax
 * @param {number} day
 * @returns {{ ceilz: number, florz: number }}
 */
export function getzsofslope(board, sectnum, dax, day) {
  const sec = board.sectors[sectnum];
  let ceilz = sec.ceilingz;
  let florz = sec.floorz;
  if (((sec.ceilingstat | sec.floorstat) & 2) === 0) {
    return { ceilz, florz };
  }
  const wal = board.walls[sec.wallptr];
  const wal2 = board.walls[wal.point2];
  const dx = wal2.x - wal.x;
  const dy = wal2.y - wal.y;
  const len = Math.sqrt(dx * dx + dy * dy) | 0;
  const i = len << 5;
  if (i === 0) return { ceilz, florz };
  // dmulscale3(dx, day-wal.y, -dy, dax-wal.x)
  const j = (dx * (day - wal.y) - dy * (dax - wal.x)) >> 3;
  if (sec.ceilingstat & 2) {
    ceilz += Math.floor((sec.ceilingheinum * j) / i);
  }
  if (sec.floorstat & 2) {
    florz += Math.floor((sec.floorheinum * j) / i);
  }
  return { ceilz, florz };
}


/**
 * Prefer a real APLAYER spawn over map-header editor camera.
 * @param {import('./Board.js').Board} board
 * @returns {{ posx: number, posy: number, posz: number, ang: number, cursectnum: number, source: string }}
 */
export function pickSpawn(board) {
  const header = { ...board.start, source: 'map-header' };

  /** @type {import('./Board.js').Sprite|null} */
  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < board.sprites.length; i++) {
    const spr = board.sprites[i];
    if (spr.picnum !== APLAYER) continue;
    if (spr.sectnum < 0 || spr.sectnum >= board.numsectors) continue;
    const dx = spr.x - board.start.posx;
    const dy = spr.y - board.start.posy;
    const same = spr.sectnum === board.start.cursectnum ? 0 : 1;
    const score = same * 1e15 + dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = spr;
    }
  }

  if (!best) {
    const sect = updatesector(
      header.posx,
      header.posy,
      board,
      header.cursectnum,
    );
    return {
      ...header,
      cursectnum: sect >= 0 ? sect : header.cursectnum,
      // Map header camera Z (same as loadboard pos)
      posz: header.posz,
      spriteZ: header.posz,
      floorZ:
        sect >= 0
          ? getzsofslope(board, sect, header.posx, header.posy).florz
          : header.posz,
    };
  }

  // Map APLAYER.z is feet (floor). During play: setsprite(..., posz+PHEIGHT),
  // so camera = sprite.z - PHEIGHT. PREMAP copies s->z into posz then the first
  // player tick settles to fz-(~40<<8); we spawn at eye height directly.
  const sect = updatesector(best.x, best.y, board, best.sectnum);
  const cursectnum = sect >= 0 ? sect : best.sectnum;
  const florz = getzsofslope(board, cursectnum, best.x, best.y).florz;
  const posz = best.z - PHEIGHT;
  return {
    posx: best.x,
    posy: best.y,
    posz,
    ang: best.ang & 2047,
    cursectnum,
    source: 'APLAYER',
    spriteZ: best.z,
    floorZ: florz,
  };
}
