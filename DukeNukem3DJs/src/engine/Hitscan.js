/**
 * ENGINE.C hitscan — ray vs sectors / walls / sprites.
 * CLIPMASK1 = (256<<16)+64 (BUILD.H).
 */
import {
  divscale15,
  divscale16,
  divscale30,
  dmulscale15,
  dmulscale16,
  klabs,
  mulscale16,
  mulscale30,
  nsqrtasm,
  scale as scaleInt,
} from '../math/fixed.js';
import { getzsofslope, inside } from './SectorQuery.js';
import { buildTables } from '../math/BuildTables.js';

/** BUILD.H CLIPMASK1 */
export const CLIPMASK1 = (256 << 16) + 64;

const HITSCAN_GOAL = (1 << 29) - 1;
const MAXCLIPSECTORS = 128;

/**
 * Signed 8-bit from picanm byte.
 * @param {number} b
 */
function s8(b) {
  return ((b & 0xff) << 24) >> 24;
}

/**
 * ENGINE.C rintersect (3D) — ray vs wall segment.
 * @returns {{ x: number, y: number, z: number }|null}
 */
function rintersect3d(x1, y1, z1, vx, vy, vz, x3, y3, x4, y4) {
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
    z: (z1 + mulscale16(vz, t)) | 0,
  };
}

/**
 * @param {object} opts
 * @param {import('./Board.js').Board} opts.board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} [opts.art]
 * @param {number} opts.xs
 * @param {number} opts.ys
 * @param {number} opts.zs
 * @param {number} opts.sectnum
 * @param {number} opts.vx
 * @param {number} opts.vy
 * @param {number} opts.vz
 * @param {number} [opts.cliptype]
 * @returns {{ hitsect: number, hitwall: number, hitsprite: number, hitx: number, hity: number, hitz: number }}
 */
export function hitscan(opts) {
  const board = opts.board;
  const art = opts.art ?? null;
  const xs = opts.xs | 0;
  const ys = opts.ys | 0;
  const zs = opts.zs | 0;
  let sectnum = opts.sectnum | 0;
  const vx = opts.vx | 0;
  const vy = opts.vy | 0;
  const vz = opts.vz | 0;
  const cliptype = opts.cliptype ?? CLIPMASK1;
  const dawalclipmask = cliptype & 0xffff;
  const dasprclipmask = (cliptype >>> 16) & 0xffff;

  let hitsect = -1;
  let hitwall = -1;
  let hitsprite = -1;
  let hitx = HITSCAN_GOAL;
  let hity = HITSCAN_GOAL;
  let hitz = 0;

  if (sectnum < 0 || !board) {
    return { hitsect, hitwall, hitsprite, hitx, hity, hitz };
  }

  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;

  /** @type {number[]} */
  const clipsectorlist = [sectnum];
  let tempshortcnt = 0;

  while (tempshortcnt < clipsectorlist.length && tempshortcnt < MAXCLIPSECTORS) {
    const dasector = clipsectorlist[tempshortcnt];
    const sec = board.sectors[dasector];
    if (!sec) {
      tempshortcnt++;
      continue;
    }

    // Ceiling
    let x1 = 0x7fffffff;
    let y1 = 0;
    let z1 = 0;
    if (sec.ceilingstat & 2) {
      const wal = board.walls[sec.wallptr];
      const wal2 = board.walls[wal.point2];
      let dax = (wal2.x - wal.x) | 0;
      let day = (wal2.y - wal.y) | 0;
      let i = nsqrtasm(Math.imul(dax, dax) + Math.imul(day, day));
      if (i !== 0) {
        i = divscale15(sec.ceilingheinum, i);
        dax = Math.imul(dax, i);
        day = Math.imul(day, i);
        const j = ((vz << 8) - dmulscale15(dax, vy, -day, vx)) | 0;
        if (j !== 0) {
          i =
            (((sec.ceilingz - zs) << 8) +
              dmulscale15(dax, (ys - wal.y) | 0, -day, (xs - wal.x) | 0)) |
            0;
          if ((i ^ j) >= 0 && (klabs(i) >> 1) < klabs(j)) {
            i = divscale30(i, j);
            x1 = (xs + mulscale30(vx, i)) | 0;
            y1 = (ys + mulscale30(vy, i)) | 0;
            z1 = (zs + mulscale30(vz, i)) | 0;
          }
        }
      }
    } else if (vz < 0 && zs >= sec.ceilingz) {
      z1 = sec.ceilingz;
      let i = (z1 - zs) | 0;
      if ((klabs(i) >> 1) < -vz) {
        i = divscale30(i, vz);
        x1 = (xs + mulscale30(vx, i)) | 0;
        y1 = (ys + mulscale30(vy, i)) | 0;
      }
    }
    if (
      x1 !== 0x7fffffff &&
      klabs(x1 - xs) + klabs(y1 - ys) < klabs(hitx - xs) + klabs(hity - ys)
    ) {
      if (inside(x1, y1, board, dasector)) {
        hitsect = dasector;
        hitwall = -1;
        hitsprite = -1;
        hitx = x1;
        hity = y1;
        hitz = z1;
      }
    }

    // Floor
    x1 = 0x7fffffff;
    if (sec.floorstat & 2) {
      const wal = board.walls[sec.wallptr];
      const wal2 = board.walls[wal.point2];
      let dax = (wal2.x - wal.x) | 0;
      let day = (wal2.y - wal.y) | 0;
      let i = nsqrtasm(Math.imul(dax, dax) + Math.imul(day, day));
      if (i !== 0) {
        i = divscale15(sec.floorheinum, i);
        dax = Math.imul(dax, i);
        day = Math.imul(day, i);
        const j = ((vz << 8) - dmulscale15(dax, vy, -day, vx)) | 0;
        if (j !== 0) {
          i =
            (((sec.floorz - zs) << 8) +
              dmulscale15(dax, (ys - wal.y) | 0, -day, (xs - wal.x) | 0)) |
            0;
          if ((i ^ j) >= 0 && (klabs(i) >> 1) < klabs(j)) {
            i = divscale30(i, j);
            x1 = (xs + mulscale30(vx, i)) | 0;
            y1 = (ys + mulscale30(vy, i)) | 0;
            z1 = (zs + mulscale30(vz, i)) | 0;
          }
        }
      }
    } else if (vz > 0 && zs <= sec.floorz) {
      z1 = sec.floorz;
      let i = (z1 - zs) | 0;
      if ((klabs(i) >> 1) < vz) {
        i = divscale30(i, vz);
        x1 = (xs + mulscale30(vx, i)) | 0;
        y1 = (ys + mulscale30(vy, i)) | 0;
      }
    }
    if (
      x1 !== 0x7fffffff &&
      klabs(x1 - xs) + klabs(y1 - ys) < klabs(hitx - xs) + klabs(hity - ys)
    ) {
      if (inside(x1, y1, board, dasector)) {
        hitsect = dasector;
        hitwall = -1;
        hitsprite = -1;
        hitx = x1;
        hity = y1;
        hitz = z1;
      }
    }

    const startwall = sec.wallptr;
    const endwall = startwall + sec.wallnum;
    for (let z = startwall; z < endwall; z++) {
      const wal = board.walls[z];
      const wal2 = board.walls[wal.point2];
      const wx1 = wal.x | 0;
      const wy1 = wal.y | 0;
      const wx2 = wal2.x | 0;
      const wy2 = wal2.y | 0;

      if (Math.imul(wx1 - xs, wy2 - ys) < Math.imul(wx2 - xs, wy1 - ys)) continue;
      const hit = rintersect3d(xs, ys, zs, vx, vy, vz, wx1, wy1, wx2, wy2);
      if (!hit) continue;
      if (klabs(hit.x - xs) + klabs(hit.y - ys) >= klabs(hitx - xs) + klabs(hity - ys)) {
        continue;
      }

      const nextsector = wal.nextsector | 0;
      if (nextsector < 0 || (wal.cstat & dawalclipmask)) {
        hitsect = dasector;
        hitwall = z;
        hitsprite = -1;
        hitx = hit.x;
        hity = hit.y;
        hitz = hit.z;
        continue;
      }

      const zz = getzsofslope(board, nextsector, hit.x, hit.y);
      if (hit.z <= zz.ceilz || hit.z >= zz.florz) {
        hitsect = dasector;
        hitwall = z;
        hitsprite = -1;
        hitx = hit.x;
        hity = hit.y;
        hitz = hit.z;
        continue;
      }

      let found = false;
      for (let i = 0; i < clipsectorlist.length; i++) {
        if (clipsectorlist[i] === nextsector) {
          found = true;
          break;
        }
      }
      if (!found && clipsectorlist.length < MAXCLIPSECTORS) {
        clipsectorlist.push(nextsector);
      }
    }

    if (art && dasprclipmask) {
      const sprites = board.sprites;
      for (let z = 0; z < sprites.length; z++) {
        const spr = sprites[z];
        if ((spr.sectnum | 0) !== dasector) continue;
        const cstat = spr.cstat | 0;
        if ((cstat & dasprclipmask) === 0) continue;

        let sx = spr.x | 0;
        let sy = spr.y | 0;
        let sz = spr.z | 0;
        const tilenum = spr.picnum & 0xffff;
        const tilesizx = art.tilesizx[tilenum] | 0;
        const tilesizy = art.tilesizy[tilenum] | 0;
        const picanm = art.picanm[tilenum] | 0;

        switch (cstat & 48) {
          case 0: {
            const topt = Math.imul(vx, (sx - xs) | 0) + Math.imul(vy, (sy - ys) | 0);
            if (topt <= 0) break;
            const bot = Math.imul(vx, vx) + Math.imul(vy, vy);
            if (bot === 0) break;
            const intz = (zs + scaleInt(vz, topt, bot)) | 0;
            let i = (tilesizy * (spr.yrepeat | 0)) << 2;
            if (cstat & 128) sz = (sz + (i >> 1)) | 0;
            if (picanm & 0x00ff0000) {
              sz =
                (sz - ((s8((picanm >> 16) & 255) * (spr.yrepeat | 0)) << 2)) | 0;
            }
            if (intz > sz || intz < sz - i) break;
            const topu = Math.imul(vx, (sy - ys) | 0) - Math.imul(vy, (sx - xs) | 0);
            const offx = scaleInt(vx, topu, bot);
            const offy = scaleInt(vy, topu, bot);
            const dist = Math.imul(offx, offx) + Math.imul(offy, offy);
            i = tilesizx * (spr.xrepeat | 0);
            i = Math.imul(i, i);
            if (dist > (i >> 7)) break;
            const intx = (xs + scaleInt(vx, topt, bot)) | 0;
            const inty = (ys + scaleInt(vy, topt, bot)) | 0;
            if (klabs(intx - xs) + klabs(inty - ys) > klabs(hitx - xs) + klabs(hity - ys)) {
              break;
            }
            hitsect = dasector;
            hitwall = -1;
            hitsprite = z;
            hitx = intx;
            hity = inty;
            hitz = intz;
            break;
          }
          case 16: {
            let xoff = (s8((picanm >> 8) & 255) + (spr.xoffset | 0)) | 0;
            if (cstat & 4) xoff = -xoff;
            const kAng = spr.ang | 0;
            const lRep = spr.xrepeat | 0;
            let dax = Math.imul(st[kAng & 2047], lRep);
            let day = Math.imul(st[(kAng + 1536) & 2047], lRep);
            const l = tilesizx;
            let k = ((l >> 1) + xoff) | 0;
            let xA = (sx - mulscale16(dax, k)) | 0;
            let yA = (sy - mulscale16(day, k)) | 0;
            let xB = (xA + mulscale16(dax, l)) | 0;
            let yB = (yA + mulscale16(day, l)) | 0;
            if ((cstat & 64) !== 0) {
              if (Math.imul(xA - xs, yB - ys) < Math.imul(xB - xs, yA - ys)) break;
            }
            const hit = rintersect3d(xs, ys, zs, vx, vy, vz, xA, yA, xB, yB);
            if (!hit) break;
            if (
              klabs(hit.x - xs) + klabs(hit.y - ys) >
              klabs(hitx - xs) + klabs(hity - ys)
            ) {
              break;
            }
            k = (tilesizy * (spr.yrepeat | 0)) << 2;
            let daz = cstat & 128 ? (spr.z + (k >> 1)) | 0 : spr.z | 0;
            if (picanm & 0x00ff0000) {
              daz =
                (daz - ((s8((picanm >> 16) & 255) * (spr.yrepeat | 0)) << 2)) | 0;
            }
            if (hit.z < daz && hit.z > daz - k) {
              hitsect = dasector;
              hitwall = -1;
              hitsprite = z;
              hitx = hit.x;
              hity = hit.y;
              hitz = hit.z;
            }
            break;
          }
          case 32: {
            if (vz === 0) break;
            const intz = sz;
            if (((intz - zs) ^ vz) < 0) break;
            if ((cstat & 64) !== 0) {
              if ((zs > intz) === ((cstat & 8) === 0)) break;
            }
            const intx = (xs + scaleInt((intz - zs) | 0, vx, vz)) | 0;
            const inty = (ys + scaleInt((intz - zs) | 0, vy, vz)) | 0;
            if (
              klabs(intx - xs) + klabs(inty - ys) >
              klabs(hitx - xs) + klabs(hity - ys)
            ) {
              break;
            }
            let xoff = (s8((picanm >> 8) & 255) + (spr.xoffset | 0)) | 0;
            let yoff = (s8((picanm >> 16) & 255) + (spr.yoffset | 0)) | 0;
            if (cstat & 4) xoff = -xoff;
            if (cstat & 8) yoff = -yoff;
            const ang = spr.ang | 0;
            const cosang = st[(ang + 512) & 2047];
            const sinang = st[ang & 2047];
            const xspan = tilesizx;
            const yspan = tilesizy;
            const xrepeat = spr.xrepeat | 0;
            const yrepeat = spr.yrepeat | 0;
            let dax = (((xspan >> 1) + xoff) * xrepeat) | 0;
            let day = (((yspan >> 1) + yoff) * yrepeat) | 0;
            let xA =
              (sx +
                dmulscale16(sinang, dax, cosang, day) -
                intx) |
              0;
            let yA =
              (sy +
                dmulscale16(sinang, day, -cosang, dax) -
                inty) |
              0;
            let l = xspan * xrepeat;
            let xB = (xA - mulscale16(sinang, l)) | 0;
            let yB = (yA + mulscale16(cosang, l)) | 0;
            l = yspan * yrepeat;
            let k = -mulscale16(cosang, l);
            const xC = (xB + k) | 0;
            const xD = (xA + k) | 0;
            k = -mulscale16(sinang, l);
            const yC = (yB + k) | 0;
            const yD = (yA + k) | 0;

            let clipyou = 0;
            const edges = [
              [xA, yA, xB, yB],
              [xB, yB, xC, yC],
              [xC, yC, xD, yD],
              [xD, yD, xA, yA],
            ];
            for (let e = 0; e < 4; e++) {
              const [ex1, ey1, ex2, ey2] = edges[e];
              if ((ey1 ^ ey2) < 0) {
                if ((ex1 ^ ex2) < 0) {
                  clipyou ^=
                    (Math.imul(ex1, ey2) < Math.imul(ex2, ey1) ? 1 : 0) ^
                    (ey1 < ey2 ? 1 : 0);
                } else if (ex1 >= 0) {
                  clipyou ^= 1;
                }
              }
            }
            if (clipyou !== 0) {
              hitsect = dasector;
              hitwall = -1;
              hitsprite = z;
              hitx = intx;
              hity = inty;
              hitz = intz;
            }
            break;
          }
          default:
            break;
        }
      }
    }

    tempshortcnt++;
  }

  return { hitsect, hitwall, hitsprite, hitx, hity, hitz };
}
