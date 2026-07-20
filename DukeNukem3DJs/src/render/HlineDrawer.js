/**
 * @typedef {import('./ViewBuffer.js').ViewBuffer} ViewBuffer
 */

/**
 * Horizontal span helpers (ENGINE.C clearview rows / later hlineasm floors).
 */
export class HlineDrawer {
  /**
   * @param {ViewBuffer} buffer
   */
  constructor(buffer) {
    this.buffer = buffer;
  }

  /**
   * Fill a horizontal span with a solid palette index.
   * @param {number} y
   * @param {number} x1
   * @param {number} x2
   * @param {number} color
   */
  drawSolid(y, x1, x2, color) {
    const { pixels, ylookup, windowx1, windowx2, windowy1, windowy2 } = this.buffer;
    if (y < windowy1 || y > windowy2) return;

    let left = x1 | 0;
    let right = x2 | 0;
    if (left < windowx1) left = windowx1;
    if (right > windowx2) right = windowx2;
    if (right < left) return;

    const row = ylookup[y] + left;
    pixels.fill(color & 255, row, row + (right - left + 1));
  }

  /**
   * Fill ceiling rows [y0..yMid) and floor rows [yMid..y1] with two colors.
   * Useful before walls are drawn (sky / floor bands).
   * @param {number} ceilingColor
   * @param {number} floorColor
   * @param {number} [splitY] Absolute row where floor begins (default: window mid)
   */
  fillCeilingFloor(ceilingColor, floorColor, splitY) {
    const { windowx1, windowx2, windowy1, windowy2 } = this.buffer;
    const mid =
      splitY !== undefined
        ? splitY | 0
        : windowy1 + (((windowy2 - windowy1 + 1) / 2) | 0);

    for (let y = windowy1; y < mid; y++) {
      this.drawSolid(y, windowx1, windowx2, ceilingColor);
    }
    for (let y = mid; y <= windowy2; y++) {
      this.drawSolid(y, windowx1, windowx2, floorColor);
    }
  }
}
