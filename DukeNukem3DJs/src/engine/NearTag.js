/**
 * ENGINE.C neartag — find nearest tagged wall / sector / sprite along facing ray.
 */
import { mulscale14, dmulscale14, klabs, scale as scaleInt } from '../math/fixed.js';
import { buildTables } from '../math/BuildTables.js';

const MAXCLIPSECTORS = 128;

/**
 * ENGINE.C lintersect — segment vs segment (returns hit on first segment).
 * @returns {{ x: number, y: number, z: number }|null}
 */
function lintersect(x1, y1, z1, x2, y2, z2, x3, y3, x4, y4) {
  const x21 = (x2 - x1) | 0;
  const y21 = (y2 - y1) | 0;
  const x34 = (x3 - x4) | 0;
  const y34 = (y3 - y4) | 0;
  const bot = Math.imul(x21, y34) - Math.imul(y21, x34);
  if (bot === 0) return null;
  const x31 = (x3 - x1) | 0;
  const y31 = (y3 - y1) | 0;
  let topt;
  let topu;
  if (bot > 0) {
    topt = Math.imul(x31, y34) - Math.imul(y31, x34);
    if (topt < 0 || topt >= bot) return null;
    topu = Math.imul(x21, y31) - Math.imul(y21, x31);
    if (topu < 0 || topu >= bot) return null;
  } else {
    topt = Math.imul(x31, y34) - Math.imul(y31, x34);
    if (topt > 0 || topt <= bot) return null;
    topu = Math.imul(x21, y31) - Math.imul(y21, x31);
    if (topu > 0 || topu <= bot) return null;
  }
  // t = topt/bot in 0..1; use scale for z
  const tNum = topt;
  const tDen = bot;
  const x = (x1 + scaleInt(x21, tNum, tDen)) | 0;
  const y = (y1 + scaleInt(y21, tNum, tDen)) | 0;
  const z = (z1 + scaleInt((z2 - z1) | 0, tNum, tDen)) | 0;
  return { x, y, z };
}

/**
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} [opts.art]
 * @param {number} opts.xs
 * @param {number} opts.ys
 * @param {number} opts.zs
 * @param {number} opts.sectnum
 * @param {number} opts.ange
 * @param {number} [opts.neartagrange=1280]
 * @param {number} [opts.tagsearch=1] bit0=lotag, bit1=hitag
 * @returns {{ neartagsector: number, neartagwall: number, neartagsprite: number, neartaghitdist: number }}
 */
export function neartag(opts) {
  const board = opts.board;
  const art = opts.art ?? null;
  const xs = opts.xs | 0;
  const ys = opts.ys | 0;
  const zs = opts.zs | 0;
  const sectnum = opts.sectnum | 0;
  const ange = opts.ange | 0;
  const neartagrange = opts.neartagrange ?? 1280;
  const tagsearch = opts.tagsearch ?? 1;

  let neartagsector = -1;
  let neartagwall = -1;
  let neartagsprite = -1;
  let neartaghitdist = 0;

  if (sectnum < 0 || tagsearch < 1 || tagsearch > 3) {
    return { neartagsector, neartagwall, neartagsprite, neartaghitdist };
  }

  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;

  const vx = mulscale14(st[(ange + 2560) & 2047], neartagrange);
  const vy = mulscale14(st[(ange + 2048) & 2047], neartagrange);
  let xe = (xs + vx) | 0;
  let ye = (ys + vy) | 0;
  let ze = zs | 0;
  const vz = 0;

  /** @type {number[]} */
  const clipsectorlist = [sectnum];
  let tempshortcnt = 0;

  while (tempshortcnt < clipsectorlist.length && tempshortcnt < MAXCLIPSECTORS) {
    const dasector = clipsectorlist[tempshortcnt];
    const sec = board.sectors[dasector];
    const startwall = sec.wallptr;
    const endwall = startwall + sec.wallnum;

    for (let z = startwall; z < endwall; z++) {
      const wal = board.walls[z];
      const wal2 = board.walls[wal.point2];
      const x1 = wal.x | 0;
      const y1 = wal.y | 0;
      const x2 = wal2.x | 0;
      const y2 = wal2.y | 0;
      const nextsector = wal.nextsector | 0;

      let good = 0;
      if (nextsector >= 0) {
        const nsec = board.sectors[nextsector];
        if ((tagsearch & 1) && nsec.lotag) good |= 1;
        if ((tagsearch & 2) && nsec.hitag) good |= 1;
      }
      if ((tagsearch & 1) && wal.lotag) good |= 2;
      if ((tagsearch & 2) && wal.hitag) good |= 2;

      if (good === 0 && nextsector < 0) continue;
      if (Math.imul(x1 - xs, y2 - ys) < Math.imul(x2 - xs, y1 - ys)) continue;

      const hit = lintersect(xs, ys, zs, xe, ye, ze, x1, y1, x2, y2);
      if (hit) {
        if (good !== 0) {
          if (good & 1) neartagsector = nextsector;
          if (good & 2) neartagwall = z;
          neartaghitdist = dmulscale14(
            (hit.x - xs) | 0,
            st[(ange + 2560) & 2047],
            (hit.y - ys) | 0,
            st[(ange + 2048) & 2047],
          );
          xe = hit.x;
          ye = hit.y;
          ze = hit.z;
        }
        if (nextsector >= 0) {
          let found = false;
          for (let zz = 0; zz < clipsectorlist.length; zz++) {
            if (clipsectorlist[zz] === nextsector) {
              found = true;
              break;
            }
          }
          if (!found && clipsectorlist.length < MAXCLIPSECTORS) {
            clipsectorlist.push(nextsector);
          }
        }
      }
    }

    if (art) {
      const sprites = board.sprites;
      for (let z = 0; z < sprites.length; z++) {
        const spr = sprites[z];
        if ((spr.sectnum | 0) !== dasector) continue;
        let good = 0;
        if ((tagsearch & 1) && spr.lotag) good |= 1;
        if ((tagsearch & 2) && spr.hitag) good |= 1;
        if (!good) continue;

        let sx = spr.x | 0;
        let sy = spr.y | 0;
        let sz = spr.z | 0;
        const topt = Math.imul(vx, (sx - xs) | 0) + Math.imul(vy, (sy - ys) | 0);
        if (topt <= 0) continue;
        const bot = Math.imul(vx, vx) + Math.imul(vy, vy);
        if (bot === 0) continue;
        const intz = (zs + scaleInt(vz, topt, bot)) | 0;
        const tilenum = spr.picnum & 0xffff;
        let i = (art.tilesizy[tilenum] * (spr.yrepeat | 0)) | 0;
        if (spr.cstat & 128) sz = (sz + (i << 1)) | 0;
        const picanm = art.picanm[tilenum] | 0;
        if (picanm & 0x00ff0000) {
          const yoff = ((picanm >> 16) << 24) >> 24;
          sz = (sz - ((yoff * (spr.yrepeat | 0)) << 2)) | 0;
        }
        if (intz > sz || intz < sz - (i << 2)) continue;
        const topu = Math.imul(vx, (sy - ys) | 0) - Math.imul(vy, (sx - xs) | 0);
        const offx = scaleInt(vx, topu, bot);
        const offy = scaleInt(vy, topu, bot);
        const dist = Math.imul(offx, offx) + Math.imul(offy, offy);
        i = art.tilesizx[tilenum] * (spr.xrepeat | 0);
        i = Math.imul(i, i);
        if (dist > (i >> 7)) continue;
        const intx = (xs + scaleInt(vx, topt, bot)) | 0;
        const inty = (ys + scaleInt(vy, topt, bot)) | 0;
        if (klabs(intx - xs) + klabs(inty - ys) < klabs(xe - xs) + klabs(ye - ys)) {
          neartagsprite = z;
          neartaghitdist = dmulscale14(
            (intx - xs) | 0,
            st[(ange + 2560) & 2047],
            (inty - ys) | 0,
            st[(ange + 2048) & 2047],
          );
          xe = intx;
          ye = inty;
          ze = intz;
        }
      }
    }

    tempshortcnt++;
  }

  return { neartagsector, neartagwall, neartagsprite, neartaghitdist };
}
