/**
 * GAME.C myospal / ENGINE.C dorotatesprite subset — 1:1 HUD tile blit.
 * myospal args are 320×200 logical; with full-screen setview that maps 1:1.
 */

/**
 * Signed 8-bit from picanm byte.
 * @param {number} b
 */
function s8(b) {
  return ((b & 0xff) << 24) >> 24;
}

/**
 * Top-left blit (status bar backdrop, icons).
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {number} x0
 * @param {number} y0
 * @param {number} tilenum
 */
export function blitTile(buffer, art, x0, y0, tilenum) {
  const pixels = art.loadtile(tilenum);
  if (!pixels) return;
  const xsiz = art.tilesizx[tilenum] | 0;
  const ysiz = art.tilesizy[tilenum] | 0;
  if (xsiz <= 0 || ysiz <= 0) return;

  const { pixels: dest, ylookup, windowx1, windowx2, windowy1, windowy2 } =
    buffer;
  const ox = x0 | 0;
  const oy = y0 | 0;

  for (let x = 0; x < xsiz; x++) {
    const sx = (ox + x) | 0;
    if (sx < windowx1 || sx > windowx2) continue;
    const col = pixels.subarray(x * ysiz, x * ysiz + ysiz);
    for (let y = 0; y < ysiz; y++) {
      const sy = (oy + y) | 0;
      if (sy < windowy1 || sy > windowy2) continue;
      const c = col[y];
      if (c === 255) continue;
      dest[ylookup[sy] + sx] = c;
    }
  }
}

/**
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {number} cx 320×200 screen x (rotatesprite pivot)
 * @param {number} cy 320×200 screen y (rotatesprite pivot)
 * @param {number} tilenum
 */
export function blitTileCentered(buffer, art, cx, cy, tilenum) {
  const pixels = art.loadtile(tilenum);
  if (!pixels) return;
  const xsiz = art.tilesizx[tilenum] | 0;
  const ysiz = art.tilesizy[tilenum] | 0;
  if (xsiz <= 0 || ysiz <= 0) return;

  const picanm = art.picanm[tilenum] | 0;
  const xoff = (s8((picanm >> 8) & 255) + (xsiz >> 1)) | 0;
  const yoff = (s8((picanm >> 16) & 255) + (ysiz >> 1)) | 0;

  blitTile(buffer, art, (cx - xoff) | 0, (cy - yoff) | 0, tilenum);
}

/**
 * GAME.C digitalnumber — centered digit string using DIGITALNUM tiles.
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {number} x center x
 * @param {number} y top y
 * @param {number} n
 * @param {number} digitalBase DIGITALNUM
 */
export function digitalNumber(buffer, art, x, y, n, digitalBase) {
  let v = n | 0;
  if (v < 0) v = 0;
  const digits = String(v);
  let width = 0;
  for (let k = 0; k < digits.length; k++) {
    const p = (digitalBase | 0) + (digits.charCodeAt(k) - 48);
    width += (art.tilesizx[p] | 0) + 1;
  }
  let c = (x | 0) - (width >> 1);
  for (let k = 0; k < digits.length; k++) {
    const p = (digitalBase | 0) + (digits.charCodeAt(k) - 48);
    blitTile(buffer, art, c, y | 0, p);
    c += (art.tilesizx[p] | 0) + 1;
  }
}

/**
 * Draw pistol HUD tiles.
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {{ pic: number, x: number, y: number }[]} tiles
 */
export function drawWeaponHud(buffer, art, tiles) {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    blitTileCentered(buffer, art, t.x, t.y, t.pic);
  }
}
