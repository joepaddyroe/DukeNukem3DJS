import {
  divscale14,
  divscale26,
  divscale28,
  dmulscale10,
  dmulscale14,
  mulscale10,
  mulscale16,
  nsqrtasm,
} from '../math/fixed.js';

/**
 * ENGINE.C dosetaspect horizlookup / horizlookup2 — distance tables for flat floors.
 */
export class HorizLookup {
  constructor() {
    /** @type {Int32Array} */
    this.horizlookup = new Int32Array(0);
    /** @type {Int32Array} */
    this.horizlookup2 = new Int32Array(0);
    this.horizycent = 0;
    this._oxyaspect = -1;
    this._ydim = 0;
  }

  /**
   * @param {number} ydim
   * @param {number} xyaspect
   */
  rebuild(ydim, xyaspect) {
    const y = ydim | 0;
    const asp = xyaspect | 0;
    if (y === this._ydim && asp === this._oxyaspect && this.horizlookup2.length) {
      return;
    }
    this._ydim = y;
    this._oxyaspect = asp;
    this.horizycent = (y * 4) >> 1;
    const n = y * 4;
    this.horizlookup = new Int32Array(n);
    this.horizlookup2 = new Int32Array(n);
    const j = Math.imul(asp, 320);
    const mid = this.horizycent - 1;
    this.horizlookup2[mid] = divscale26(131072, j || 1);
    for (let i = n - 1; i >= 0; i--) {
      if (i === mid) continue;
      this.horizlookup[i] = divscale28(1, i - mid);
      const hl = this.horizlookup[i];
      this.horizlookup2[i] = divscale14(hl < 0 ? -hl : hl, j || 1);
    }
  }

  /**
   * @param {number} yp screen Y in view
   * @param {number} globalhoriz
   */
  dist(yp, globalhoriz) {
    const i = (yp - globalhoriz + this.horizycent) | 0;
    if (i < 0 || i >= this.horizlookup2.length) return 0;
    return this.horizlookup2[i];
  }
}

/**
 * @param {number} n
 */
function log2bits(n) {
  let s = 0;
  while (s < 15 && (1 << s) < n) s++;
  return s;
}

/**
 * @typedef {Object} FlatScan
 * @property {Uint8Array} pixels
 * @property {number} xsiz
 * @property {number} ysiz
 * @property {number} xbits
 * @property {number} ybits
 * @property {number} rawX1
 * @property {number} rawY1
 * @property {number} rawX2
 * @property {number} rawY2
 * @property {number} xpanning
 * @property {number} ypanning
 * @property {number} globalzd
 * @property {number} shade
 * @property {boolean} isCeil
 */

/**
 * ENGINE.C ceilscan / florscan UV setup (non-slope, non-parallax).
 * @param {object} opts
 * @param {import('../engine/Board.js').Sector} opts.sec
 * @param {import('../engine/Board.js').Board} opts.board
 * @param {import('../grp/ArtTiles.js').ArtTiles} opts.art
 * @param {boolean} opts.isCeil
 * @param {number} opts.posx
 * @param {number} opts.posy
 * @param {number} opts.posz
 * @param {number} opts.cos singlobalang / cosglobalang pair
 * @param {number} opts.sin
 * @param {number} opts.viewingrangerecip
 * @param {number} opts.halfxdimen
 * @returns {FlatScan|null}
 */
export function setupFlatScan(opts) {
  const {
    sec,
    board,
    art,
    isCeil,
    posx,
    posy,
    posz,
    cos,
    sin,
    viewingrangerecip,
    halfxdimen,
  } = opts;

  const orient = (isCeil ? sec.ceilingstat : sec.floorstat) | 0;
  if (orient & 1) return null; // parallax
  if (orient & 2) return null; // slope → grouscan / FlatPlane

  const planeZ = isCeil ? sec.ceilingz : sec.floorz;
  // ENGINE.C skips when globalzd > 0 (camera on the back side). Roof undersides
  // and overhangs still need texturing — use −|Δz| so UV math stays valid.
  let globalzd = isCeil ? planeZ - posz : posz - planeZ;
  if (globalzd > 0) globalzd = -globalzd;
  if (globalzd === 0) globalzd = -1;

  const tilenum = (isCeil ? sec.ceilingpicnum : sec.floorpicnum) & 0xffff;
  art.loadtile(tilenum);
  const xsiz = art.tilesizx[tilenum] | 0;
  const ysiz = art.tilesizy[tilenum] | 0;
  if (xsiz <= 0 || ysiz <= 0) return null;
  const pixels = art.waloff[tilenum];
  if (!pixels) return null;

  const xbits = log2bits(xsiz);
  const ybits = log2bits(ysiz);

  let globalx1;
  let globaly1;
  let globalx2;
  let globaly2;
  let globalxpanning;
  let globalypanning;

  if ((orient & 64) === 0) {
    globalx1 = sin;
    globalx2 = sin;
    globaly1 = cos;
    globaly2 = cos;
    globalxpanning = posx << 20;
    globalypanning = -(posy << 20);
  } else {
    const j = sec.wallptr;
    const wal = board.walls[j];
    const wal2 = board.walls[wal.point2];
    let ox = wal2.x - wal.x;
    let oy = wal2.y - wal.y;
    let i = nsqrtasm(ox * ox + oy * oy);
    if (i === 0) i = 1024;
    else i = (1048576 / i) | 0;
    globalx1 = mulscale10(dmulscale10(ox, sin, -oy, cos), i);
    globaly1 = mulscale10(dmulscale10(ox, cos, oy, sin), i);
    globalx2 = -globalx1;
    globaly2 = -globaly1;

    ox = (wal.x - posx) << 6;
    oy = (wal.y - posy) << 6;
    i = dmulscale14(oy, cos, -ox, sin);
    const jj = dmulscale14(ox, cos, oy, sin);
    ox = i;
    oy = jj;
    globalxpanning = globalx1 * ox - globaly1 * oy;
    globalypanning = globaly2 * ox + globalx2 * oy;
  }

  globalx2 = mulscale16(globalx2, viewingrangerecip);
  globaly1 = mulscale16(globaly1, viewingrangerecip);

  let globalxshift = 8 - (xbits & 15);
  let globalyshift = 8 - (ybits & 15);
  if (orient & 8) {
    globalxshift++;
    globalyshift++;
  }

  if (orient & 4) {
    let t = globalxpanning;
    globalxpanning = globalypanning;
    globalypanning = t;
    t = globalx2;
    globalx2 = -globaly1;
    globaly1 = -t;
    t = globalx1;
    globalx1 = globaly2;
    globaly2 = t;
  }
  if (orient & 0x10) {
    globalx1 = -globalx1;
    globaly1 = -globaly1;
    globalxpanning = -globalxpanning;
  }
  if (orient & 0x20) {
    globalx2 = -globalx2;
    globaly2 = -globaly2;
    globalypanning = -globalypanning;
  }

  globalx1 <<= globalxshift;
  globaly1 <<= globalxshift;
  globalx2 <<= globalyshift;
  globaly2 <<= globalyshift;
  globalxpanning <<= globalxshift;
  globalypanning <<= globalyshift;

  const xpan = (isCeil ? sec.ceilingxpanning : sec.floorxpanning) | 0;
  const ypan = (isCeil ? sec.ceilingypanning : sec.floorypanning) | 0;
  globalxpanning += xpan << 24;
  globalypanning += ypan << 24;

  const half = halfxdimen | 0;
  globaly1 = (-globalx1 - globaly1) * half;
  globalx2 = (globalx2 - globaly2) * half;

  return {
    pixels,
    xsiz,
    ysiz,
    xbits: xbits || 1,
    ybits: ybits || 1,
    rawX1: globalx1 | 0,
    rawY1: globaly1 | 0,
    rawX2: globalx2 | 0,
    rawY2: globaly2 | 0,
    xpanning: globalxpanning | 0,
    ypanning: globalypanning | 0,
    globalzd: globalzd | 0,
    shade: (isCeil ? sec.ceilingshade : sec.floorshade) | 0,
    isCeil,
  };
}

/**
 * Sample Build flat UV at screen (x,y) — ENGINE.C hline math.
 * @param {FlatScan} scan
 * @param {HorizLookup} horiz
 * @param {number} x
 * @param {number} y
 * @param {number} globalhoriz
 * @returns {number} palette index or -1
 */
export function sampleFlatScan(scan, horiz, x, y, globalhoriz) {
  const r = horiz.dist(y, globalhoriz);
  if (r === 0) return -1;

  const zd = scan.globalzd;
  // ENGINE.C: globals at column x after (x-1) offset then ×zd (32-bit wrap)
  const gx2 = mulscale16(
    (scan.rawX2 + Math.imul(scan.rawY2, x - 1)) | 0,
    zd,
  );
  const gy1 = mulscale16(
    (scan.rawY1 + Math.imul(scan.rawX1, x - 1)) | 0,
    zd,
  );

  // hline: u = globaly1*r+globalxpanning, v = globalx2*r+globalypanning
  const u = (Math.imul(gy1, r) + scan.xpanning) | 0;
  const v = (Math.imul(gx2, r) + scan.ypanning) | 0;

  const xsiz = scan.xsiz;
  const ysiz = scan.ysiz;
  const u32 = u >>> 0;
  const v32 = v >>> 0;

  let tx;
  let ty;
  if ((xsiz & (xsiz - 1)) === 0) {
    tx = (u32 >>> (32 - scan.xbits)) & (xsiz - 1);
  } else {
    tx = ((u32 >>> 16) % xsiz + xsiz) % xsiz;
  }
  if ((ysiz & (ysiz - 1)) === 0) {
    ty = (v32 >>> (32 - scan.ybits)) & (ysiz - 1);
  } else {
    ty = ((v32 >>> 16) % ysiz + ysiz) % ysiz;
  }

  return scan.pixels[tx * ysiz + ty] & 255;
}
