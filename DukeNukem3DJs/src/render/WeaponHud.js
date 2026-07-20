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

  // dorotatesprite (dastat&16 clear): pivot = picanm offset + half tile
  const picanm = art.picanm[tilenum] | 0;
  const xoff = (s8((picanm >> 8) & 255) + (xsiz >> 1)) | 0;
  const yoff = (s8((picanm >> 16) & 255) + (ysiz >> 1)) | 0;

  // Full-screen 320×200: dorotatesprite dastat&2 scale is identity
  const x0 = (cx - xoff) | 0;
  const y0 = (cy - yoff) | 0;
  const { pixels: dest, ylookup, windowx1, windowx2, windowy1, windowy2 } =
    buffer;

  for (let x = 0; x < xsiz; x++) {
    const sx = (x0 + x) | 0;
    if (sx < windowx1 || sx > windowx2) continue;
    const col = pixels.subarray(x * ysiz, x * ysiz + ysiz);
    for (let y = 0; y < ysiz; y++) {
      const sy = (y0 + y) | 0;
      if (sy < windowy1 || sy > windowy2) continue;
      const c = col[y];
      if (c === 255) continue;
      dest[ylookup[sy] + sx] = c;
    }
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
