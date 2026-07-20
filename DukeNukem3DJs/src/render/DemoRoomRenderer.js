import { BUILD_ANGLES, BUILD_ANGLE_MASK } from '../core/renderConstants.js';

/**
 * @typedef {import('./SoftwareRenderer.js').SoftwareRenderer} SoftwareRenderer
 * @typedef {import('../grp/ArtTiles.js').ArtTiles} ArtTiles
 */

/** World units per full texture width (keeps U continuous, avoids 1-texel-per-unit noise). */
const TEXELS_PER_WALL = 64;

/**
 * TEMPORARY scaffold: box + rays to exercise ViewBuffer / VlineDrawer with real ART.
 *
 * NOT Build portal rendering — replace with ENGINE.C drawrooms once board load exists.
 */
export class DemoRoomRenderer {
  /**
   * @param {SoftwareRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;

    this.posX = 0;
    this.posY = 0;
    this.ang = 0;
    this.horiz = 100;
    this.roomHalf = 1024;

    /** Wall / side tile numbers (set after ART load). */
    this.wallTile = -1;
    this.sideTile = -1;
  }

  /**
   * Pick two solid tiles from ART for the demo walls.
   * @param {ArtTiles} art
   */
  setArt(art) {
    this.art = art;
    this.wallTile = pickTile(art, 0);
    this.sideTile = pickTile(art, this.wallTile + 1);
    if (this.sideTile < 0) {
      this.sideTile = this.wallTile;
    }
  }

  /** @param {number} [deltaAng=4] */
  tick(deltaAng = 4) {
    this.ang = (this.ang + deltaAng) & BUILD_ANGLE_MASK;
  }

  render() {
    const r = this.renderer;
    const { buffer, vlines, hlines, palookup } = r;
    const { xdimen, ydimen, windowx1, windowy1, windowy2, halfxdimen } = buffer;

    hlines.fillCeilingFloor(0, 24);

    if (!this.art || this.wallTile < 0) {
      return;
    }

    const centerY = windowy1 + ((ydimen * this.horiz) / 200) | 0;
    const wallXs = this.art.tilesizx[this.wallTile];
    const wallYs = this.art.tilesizy[this.wallTile];
    const sideXs = this.art.tilesizx[this.sideTile];
    const sideYs = this.art.tilesizy[this.sideTile];
    const wallLen = this.roomHalf * 2;

    for (let col = 0; col < xdimen; col++) {
      const screenX = windowx1 + col;

      // Camera-space ray: x across FOV, z forward (avoids angle-step fish-eye in heading)
      const camX = (col - halfxdimen) / halfxdimen; // -1 .. ~1
      const camZ = 1;
      const cosA = buildCos(this.ang) / 1073741824;
      const sinA = buildSin(this.ang) / 1073741824;
      // Rotate camera ray into world
      const fdx = camZ * cosA - camX * sinA;
      const fdy = camZ * sinA + camX * cosA;

      const hit = castRoom(this.posX, this.posY, fdx, fdy, this.roomHalf);
      if (!hit) continue;

      // Perpendicular depth (corrects curved wall bottoms / fish-eye)
      const perp = Math.max(8, hit.dist * (camZ / Math.hypot(camX, camZ)));
      const wallH = ((ydimen * this.roomHalf) / perp) | 0;
      let y1 = centerY - (wallH >> 1);
      let y2 = centerY + (wallH >> 1) - 1;

      const shade = Math.min(palookup.numShades - 1, (perp >> 6));
      const shadeOffset = palookup.shadeOffset(shade);

      const useSide = hit.side !== 0;
      const tilenum = useSide ? this.sideTile : this.wallTile;
      const xsiz = useSide ? sideXs : wallXs;
      const ysiz = useSide ? sideYs : wallYs;

      // Map along-wall world pos → texel (stable, tiled)
      const uNorm = ((hit.along / wallLen) * TEXELS_PER_WALL) | 0;
      const texX = positiveMod(uNorm, xsiz);
      const texcol = this.art.getColumn(tilenum, texX);
      if (!texcol || ysiz <= 0) continue;

      // Full unclipped span → V step (then clip like Build vline)
      const y1Raw = y1;
      const y2Raw = y2;
      const span = Math.max(1, y2Raw - y1Raw + 1);
      const vinc = ((ysiz << 16) / span) | 0;
      let vplc = 0;

      if (y1 < windowy1) {
        vplc = Math.imul(windowy1 - y1, vinc) | 0;
        y1 = windowy1;
      }
      if (y2 > windowy2) {
        y2 = windowy2;
      }
      if (y2 < y1) continue;

      vlines.draw({
        x: screenX,
        y1,
        y2,
        vplc,
        vinc,
        texcol,
        texHeight: ysiz,
        shadeOffset,
      });
    }
  }
}

/**
 * Prefer classic 64×64 wall tiles (skip tiny UI / odd aspect pics that look pink/noisy).
 * @param {ArtTiles} art
 * @param {number} start
 * @returns {number}
 */
function pickTile(art, start) {
  for (let i = Math.max(0, start); i < art.tilesizx.length; i++) {
    if (art.tilesizx[i] === 64 && art.tilesizy[i] === 64) {
      return i;
    }
  }
  for (let i = Math.max(0, start); i < art.tilesizx.length; i++) {
    const x = art.tilesizx[i];
    const y = art.tilesizy[i];
    if (x >= 64 && y >= 64 && x <= 128 && y <= 128) {
      return i;
    }
  }
  return art.findFirstTile(Math.max(0, start));
}

/**
 * @param {number} ox
 * @param {number} oy
 * @param {number} fdx
 * @param {number} fdy
 * @param {number} half
 * @returns {{ dist: number, along: number, side: number } | null}
 */
function castRoom(ox, oy, fdx, fdy, half) {
  const len = Math.hypot(fdx, fdy);
  if (len < 1e-8) return null;
  const rdx = fdx / len;
  const rdy = fdy / len;

  let bestT = Infinity;
  let along = 0;
  let side = 0;

  const walls = [
    { hit: rdx > 0, t: rdx !== 0 ? (half - ox) / rdx : Infinity, u: (y) => y + half, side: 0 },
    { hit: rdx < 0, t: rdx !== 0 ? (-half - ox) / rdx : Infinity, u: (y) => half - y, side: 0 },
    { hit: rdy > 0, t: rdy !== 0 ? (half - oy) / rdy : Infinity, u: (x) => half - x, side: 1 },
    { hit: rdy < 0, t: rdy !== 0 ? (-half - oy) / rdy : Infinity, u: (x) => x + half, side: 1 },
  ];

  for (const w of walls) {
    if (!w.hit || !(w.t > 0) || w.t >= bestT) continue;
    const hx = ox + rdx * w.t;
    const hy = oy + rdy * w.t;
    if (Math.abs(hx) > half + 0.5 || Math.abs(hy) > half + 0.5) continue;
    bestT = w.t;
    along = w.side === 0 ? w.u(hy) : w.u(hx);
    side = w.side;
  }

  if (!Number.isFinite(bestT) || bestT === Infinity) {
    return null;
  }

  return { dist: bestT, along, side };
}

/** @param {number} value @param {number} mod */
function positiveMod(value, mod) {
  return ((value % mod) + mod) % mod;
}

/** @param {number} ang */
function buildCos(ang) {
  const rad = (ang / BUILD_ANGLES) * Math.PI * 2;
  return (Math.cos(rad) * 1073741824) | 0;
}

/** @param {number} ang */
function buildSin(ang) {
  const rad = (ang / BUILD_ANGLES) * Math.PI * 2;
  return (Math.sin(rad) * 1073741824) | 0;
}
