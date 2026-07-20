/**
 * ENGINE.C grouscan + JFBuild a-c.c slopevlin subset.
 * Sloped floor/ceiling column UV via depth recip (krecipasm).
 */
import {
  dmulscale9,
  dmulscale16,
  dmulscale17,
  dmulscale25,
  krecipasm,
  mulscale10,
  mulscale12,
  mulscale14,
  mulscale16,
  mulscale19,
  mulscale20,
  mulscale21,
  mulscale27,
  mulscale28,
  nsqrtasm,
} from '../math/fixed.js';
import { makePicsiz } from './ParallaxSky.js';
import { getzsofslope } from '../engine/SectorQuery.js';

/** ENGINE.C BITSOFPRECISION — keep in sync with slopevlin step. */
const BITSOFPRECISION = 3;

/**
 * @param {number} a
 * @param {number} s  signed shift; negative → arithmetic right
 */
function shiftSigned(a, s) {
  const v = a | 0;
  if (s >= 0) return (v << s) | 0;
  return v >> -s;
}

/**
 * ENGINE.C grouscan (dastat 0=ceil, 1=floor).
 * Constant shade (no slopalookup / distance fog yet).
 *
 * @param {object} opts
 * @param {number} opts.dax1
 * @param {number} opts.dax2
 * @param {number} opts.sectnum
 * @param {0|1} opts.dastat
 * @param {import('../engine/Board.js').Board} opts.board
 * @param {import('../grp/ArtTiles.js').ArtTiles} opts.art
 * @param {number} opts.posx
 * @param {number} opts.posy
 * @param {number} opts.posz
 * @param {number} opts.cos  cosglobalang
 * @param {number} opts.sin  singlobalang
 * @param {number} opts.globalhoriz
 * @param {number} opts.xdimenrecip
 * @param {number} opts.viewingrangerecip
 * @param {number} opts.xdimscale
 * @param {number} opts.halfxdimen
 * @param {Int16Array} opts.umost
 * @param {Int16Array} opts.dmost
 * @param {Int16Array} opts.uplc
 * @param {Int16Array} opts.dplc
 * @param {Uint8Array} opts.pixels
 * @param {Int32Array} opts.ylookup
 * @param {number} opts.windowx1
 * @param {number} opts.windowy1
 * @param {Uint8Array} opts.tables  palookup tables
 * @param {number} opts.shadeOffset
 */
export function grouscan(opts) {
  const {
    dax1,
    dax2,
    sectnum,
    dastat,
    board,
    art,
    posx,
    posy,
    posz,
    cos: cosglobalang,
    sin: singlobalang,
    globalhoriz,
    xdimenrecip,
    viewingrangerecip,
    xdimscale,
    halfxdimen,
    umost,
    dmost,
    uplc,
    dplc,
    pixels,
    ylookup,
    windowx1,
    windowy1,
    tables,
    shadeOffset,
  } = opts;

  const sec = board.sectors[sectnum];
  const zCam = getzsofslope(board, sectnum, posx, posy);

  let globalorientation;
  let globalpicnum;
  let daslope;
  let daz;

  if (dastat === 0) {
    if (posz <= zCam.ceilz) return;
    globalorientation = sec.ceilingstat | 0;
    globalpicnum = sec.ceilingpicnum & 0xffff;
    daslope = sec.ceilingheinum | 0;
    daz = sec.ceilingz | 0;
  } else {
    if (posz >= zCam.florz) return;
    globalorientation = sec.floorstat | 0;
    globalpicnum = sec.floorpicnum & 0xffff;
    daslope = sec.floorheinum | 0;
    daz = sec.floorz | 0;
  }

  art.loadtile(globalpicnum);
  const xsiz = art.tilesizx[globalpicnum] | 0;
  const ysiz = art.tilesizy[globalpicnum] | 0;
  if (xsiz <= 0 || ysiz <= 0) return;
  const gbuf = art.waloff[globalpicnum];
  if (!gbuf) return;

  const picsiz = makePicsiz(xsiz, ysiz);
  const glogx = picsiz & 15;
  const glogy = (picsiz >> 4) & 15;

  const wal = board.walls[sec.wallptr];
  const wal2 = board.walls[wal.point2];
  let wx = (wal2.x - wal.x) | 0;
  let wy = (wal2.y - wal.y) | 0;
  const hyp2 = (Math.imul(wx, wx) + Math.imul(wy, wy)) | 0;
  const dasqr = krecipasm(nsqrtasm(hyp2 >>> 0));
  const slopeScale = mulscale21(daslope, dasqr);
  wx = Math.imul(wx, slopeScale) | 0;
  wy = Math.imul(wy, slopeScale) | 0;

  let globalx = -mulscale19(singlobalang, xdimenrecip);
  let globaly = mulscale19(cosglobalang, xdimenrecip);
  let globalx1 = (posx << 8) | 0;
  let globaly1 = (-(posy << 8)) | 0;
  const i0 = Math.imul((dax1 - halfxdimen) | 0, xdimenrecip) | 0;
  let globalx2 =
    (mulscale16(cosglobalang << 4, viewingrangerecip) -
      mulscale27(singlobalang, i0)) |
    0;
  let globaly2 =
    (mulscale16(singlobalang << 4, viewingrangerecip) +
      mulscale27(cosglobalang, i0)) |
    0;
  const globalzd = (xdimscale << 9) | 0;
  let globalzx =
    (-dmulscale17(wx, globaly2, -wy, globalx2) +
      mulscale10(1 - globalhoriz, globalzd)) |
    0;
  let globalz = -dmulscale25(wx, globaly, -wy, globalx);

  if (globalorientation & 64) {
    const dx = mulscale14(wal2.x - wal.x, dasqr);
    const dy = mulscale14(wal2.y - wal.y, dasqr);
    const len = nsqrtasm(
      (Math.imul(daslope, daslope) + 16777216) >>> 0,
    );

    let x = globalx;
    let y = globaly;
    globalx = dmulscale16(x, dx, y, dy);
    globaly = mulscale12(dmulscale16(-y, dx, x, dy), len);

    x = ((wal.x - posx) << 8) | 0;
    y = ((wal.y - posy) << 8) | 0;
    globalx1 = dmulscale16(-x, dx, -y, dy);
    globaly1 = mulscale12(dmulscale16(-y, dx, x, dy), len);

    x = globalx2;
    y = globaly2;
    globalx2 = dmulscale16(x, dx, y, dy);
    globaly2 = mulscale12(dmulscale16(-y, dx, x, dy), len);
  }

  if (globalorientation & 0x4) {
    let t = globalx;
    globalx = -globaly;
    globaly = -t;
    t = globalx1;
    globalx1 = globaly1;
    globaly1 = t;
    t = globalx2;
    globalx2 = -globaly2;
    globaly2 = -t;
  }
  if (globalorientation & 0x10) {
    globalx1 = -globalx1;
    globalx2 = -globalx2;
    globalx = -globalx;
  }
  if (globalorientation & 0x20) {
    globaly1 = -globaly1;
    globaly2 = -globaly2;
    globaly = -globaly;
  }

  daz =
    (dmulscale9(wx, (posy - wal.y) | 0, -wy, (posx - wal.x) | 0) +
      (((daz - posz) << 8) | 0)) |
    0;
  globalx2 = mulscale20(globalx2, daz);
  globalx = mulscale28(globalx, daz);
  globaly2 = mulscale20(globaly2, -daz);
  globaly = mulscale28(globaly, -daz);

  let ish = 8 - (picsiz & 15);
  let jsh = 8 - (picsiz >> 4);
  if (globalorientation & 8) {
    ish++;
    jsh++;
  }
  globalx1 = shiftSigned(globalx1, ish + 12);
  globaly1 = shiftSigned(globaly1, jsh + 12);
  globalx2 = shiftSigned(globalx2, ish);
  globalx = shiftSigned(globalx, ish);
  globaly2 = shiftSigned(globaly2, jsh);
  globaly = shiftSigned(globaly, jsh);

  if (dastat === 0) {
    globalx1 = (globalx1 + ((sec.ceilingxpanning & 255) << 24)) | 0;
    globaly1 = (globaly1 + ((sec.ceilingypanning & 255) << 24)) | 0;
  } else {
    globalx1 = (globalx1 + ((sec.floorxpanning & 255) << 24)) | 0;
    globaly1 = (globaly1 + ((sec.floorypanning & 255) << 24)) | 0;
  }

  // JFBuild a-c.c: bzinc = asm1>>3; asm1 = -(globalzd>>(16-BITSOFPRECISION))
  const asm1 = -(globalzd >> (16 - BITSOFPRECISION)) | 0;
  const bzinc = (asm1 >> 3) | 0;

  const pinc = -((ylookup[1] - ylookup[0]) | 0);
  const xBits = 32 - glogx;
  const yBits = 32 - glogy;

  for (let x = dax1; x <= dax2; x++) {
    let y1;
    let y2;
    if (dastat === 0) {
      y1 = umost[x];
      y2 = Math.min(dmost[x], uplc[x]) - 1;
    } else {
      y1 = Math.max(umost[x], dplc[x]);
      y2 = dmost[x] - 1;
    }

    if (y1 <= y2) {
      const globalx3 = (globalx2 >> 10) | 0;
      const globaly3 = (globaly2 >> 10) | 0;
      // ENGINE.C: asm3 = mulscale16(y2,globalzd)+(globalzx>>6)
      let bz = (mulscale16(y2, globalzd) + (globalzx >> 6)) | 0;
      const screenX = (windowx1 + x) | 0;
      let p = (ylookup[(y2 + windowy1) | 0] + screenX) | 0;
      let cnt = (y2 - y1 + 1) | 0;
      const bx = globalx1 | 0;
      const by = globaly1 | 0;

      // slopevlin subset (JFBuild a-c.c + our krecipasm)
      while (cnt-- > 0) {
        const recip = krecipasm(bz >> 6);
        bz = (bz + bzinc) | 0;
        const u = (bx + Math.imul(globalx3, recip)) >>> 0;
        const v = (by + Math.imul(globaly3, recip)) >>> 0;
        const idx = ((u >>> xBits) << glogy) + (v >>> yBits);
        if (idx >= 0 && idx < gbuf.length) {
          pixels[p] = tables[shadeOffset + (gbuf[idx] & 255)];
        }
        p = (p + pinc) | 0;
      }
    }

    globalx2 = (globalx2 + globalx) | 0;
    globaly2 = (globaly2 + globaly) | 0;
    globalzx = (globalzx + globalz) | 0;
  }
}
