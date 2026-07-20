/**
 * ENGINE.C parascan / PREMAP.C setupbackdrop — parallax sky state + column UV.
 * Read-only C refs: parascan ~8372, setupbackdrop, dosetaspect radarang2.
 */
import {
  mulscale1,
  mulscale14,
  mulscale16,
  mulscale32,
} from '../math/fixed.js';
import { buildTables } from '../math/BuildTables.js';
import { BUILD_ANGLE_MASK } from '../core/renderConstants.js';

/** Duke NAMES.H sky tile bases used by setupbackdrop. */
export const CLOUDYOCEAN = 78;
export const MOONSKY1 = 80;
export const BIGORBIT1 = 84;
export const LA = 89;

const MAXPSKYTILES = 256;
const POW2 = new Int32Array(32);
for (let i = 0; i < 32; i++) POW2[i] = 1 << i;

/**
 * ENGINE.C picsiz bit count for one axis.
 * @param {number} siz
 * @returns {number}
 */
export function picsizAxisBits(siz) {
  let j = 15;
  const s = siz | 0;
  while (j > 1 && POW2[j] > s) j--;
  return j;
}

/**
 * @param {number} xsiz
 * @param {number} ysiz
 * @returns {number} picsiz byte
 */
export function makePicsiz(xsiz, ysiz) {
  return (picsizAxisBits(xsiz) | (picsizAxisBits(ysiz) << 4)) & 255;
}

export class ParallaxSky {
  constructor() {
    /** @type {Int16Array} */
    this.pskyoff = new Int16Array(MAXPSKYTILES);
    this.pskybits = 0;
    this.parallaxtype = 2;
    this.parallaxyoffs = 0;
    this.parallaxyscale = 65536;
    /** @type {Int16Array|null} */
    this.radarang2 = null;
    this._radXdimen = -1;
    this._radViewing = -1;
  }

  /**
   * PREMAP.C setupbackdrop(sky)
   * @param {number} sky ceilingpicnum
   */
  setupBackdrop(sky) {
    this.pskyoff.fill(0);
    if (this.parallaxyscale !== 65536) {
      this.parallaxyscale = 32768;
    }
    switch (sky | 0) {
      case CLOUDYOCEAN:
        this.parallaxyscale = 65536;
        break;
      case MOONSKY1:
        this.pskyoff[6] = 1;
        this.pskyoff[1] = 2;
        this.pskyoff[4] = 2;
        this.pskyoff[2] = 3;
        break;
      case BIGORBIT1:
        this.pskyoff[5] = 1;
        this.pskyoff[6] = 2;
        this.pskyoff[7] = 3;
        this.pskyoff[2] = 4;
        break;
      case LA:
        this.parallaxyscale = 16384 + 1024;
        this.pskyoff[0] = 1;
        this.pskyoff[1] = 2;
        this.pskyoff[2] = 1;
        this.pskyoff[3] = 3;
        this.pskyoff[4] = 4;
        this.pskyoff[5] = 0;
        this.pskyoff[6] = 2;
        this.pskyoff[7] = 3;
        break;
      default:
        break;
    }
    this.pskybits = 3;
  }

  /**
   * ENGINE.C dosetaspect — radarang2[i] from radarang + viewingrange.
   * @param {number} xdimen
   * @param {number} viewingrange
   * @param {number} xdimenrecip divscale32(1,xdimen)
   */
  rebuildRadarang2(xdimen, viewingrange, xdimenrecip) {
    const xd = xdimen | 0;
    const vr = viewingrange | 0;
    if (this.radarang2 && xd === this._radXdimen && vr === this._radViewing) {
      return;
    }
    this._radXdimen = xd;
    this._radViewing = vr;
    if (!this.radarang2 || this.radarang2.length < xd) {
      this.radarang2 = new Int16Array(Math.max(xd, 320));
    }
    if (!buildTables.loaded) buildTables.generateFallback();
    const radarang = buildTables.radarang;
    const xinc = mulscale32(Math.imul(vr, 320), xdimenrecip);
    let x = (640 << 16) - mulscale1(xinc, xd);
    for (let i = 0; i < xd; i++) {
      const j = x & 65535;
      const k = (x >> 16) | 0;
      x = (x + xinc) | 0;
      let frac = 0;
      if (j !== 0 && k >= 0 && k + 1 < radarang.length) {
        frac = mulscale16((radarang[k + 1] - radarang[k]) | 0, j);
      }
      const base = k >= 0 && k < radarang.length ? radarang[k] | 0 : 0;
      this.radarang2[i] = ((base + frac) >> 6) | 0;
    }
  }

  /**
   * parascan-adjusted horizon for V mapping.
   * @param {number} globalhoriz
   * @param {number} ydimen
   */
  skyHoriz(globalhoriz, ydimen) {
    if (this.parallaxyscale === 65536) return globalhoriz | 0;
    const mid = ydimen >> 1;
    return (
      mulscale16((globalhoriz | 0) - mid, this.parallaxyscale) + mid
    ) | 0;
  }

  /**
   * Column U / tile / V setup for one screen x (parascan + wallscan subset).
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.ang globalang
   * @param {number} opts.basePic ceiling/floor picnum
   * @param {number} opts.xpan
   * @param {number} opts.ypan
   * @param {number} opts.xsiz
   * @param {number} opts.ysiz
   * @param {number} opts.xdimscale
   * @param {number} opts.viewingrange
   * @param {number} opts.skyHoriz
   * @returns {{ tilenum: number, texX: number, vinc: number, vplc0: number, shift: number, ysiz: number }|null}
   */
  columnSetup(opts) {
    const {
      x,
      ang,
      basePic,
      xpan,
      ypan,
      xsiz,
      ysiz,
      xdimscale,
      viewingrange,
      skyHoriz,
    } = opts;
    if (xsiz <= 0 || ysiz <= 0 || !this.radarang2) return null;

    const picsiz = makePicsiz(xsiz, ysiz);
    const xbits = picsiz & 15;
    const ybits0 = picsiz >> 4;
    let ybits = ybits0;
    if (POW2[ybits] !== ysiz) ybits++;
    const globalshiftval = 32 - ybits;

    const k = 11 - xbits - (this.pskybits | 0);
    const rad = this.radarang2[x] | 0;
    let lplc;
    if (this.parallaxtype === 0) {
      // Unused for Duke default (type 2); keep branch for fidelity
      lplc = (((ang | 0) + rad) & BUILD_ANGLE_MASK) >> k;
    } else {
      lplc = (((rad + (ang | 0)) & BUILD_ANGLE_MASK) >> k) | 0;
    }

    const m = xbits;
    const pskyIdx = (lplc >> m) & (MAXPSKYTILES - 1);
    const tilenum = ((basePic | 0) + (this.pskyoff[pskyIdx] | 0)) & 0xffff;

    let texX = (lplc + (xpan | 0)) | 0;
    if (texX >= xsiz || texX < 0) {
      texX = ((texX % xsiz) + xsiz) % xsiz;
    }

    const n = mulscale16(xdimscale, viewingrange);
    let swplc;
    if (this.parallaxtype === 2) {
      swplc = mulscale14(buildTables.cos(rad & BUILD_ANGLE_MASK), n);
    } else {
      swplc = n;
    }

    const globalyscale = 8 << (globalshiftval - 19);
    const globalzd =
      ((((ysiz >> 1) + (this.parallaxyoffs | 0)) << globalshiftval) |
        0) +
      ((ypan | 0) << 24);
    const vinc = Math.imul(swplc, globalyscale) | 0;
    // vplc at screen y: globalzd + vinc*(y - skyHoriz + 1)
    // Store base so caller adds vinc*y
    const vplc0 = (globalzd + Math.imul(vinc, (1 - (skyHoriz | 0)) | 0)) | 0;

    return {
      tilenum,
      texX,
      vinc,
      vplc0,
      shift: globalshiftval,
      ysiz,
    };
  }
}

/** Shared sky state for the session. */
export const parallaxSky = new ParallaxSky();
