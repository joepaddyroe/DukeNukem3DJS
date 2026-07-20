import { SCREENWIDTH, SCREENHEIGHT } from '../core/renderConstants.js';
import { divscale16, divscale32, scale } from '../math/fixed.js';

/**
 * Indexed framebuffer with Build-style ylookup / setview window.
 * Mirrors ENGINE.C: ylookup[i] = i * bytesperline, frameplace linear buffer.
 */
export class ViewBuffer {
  /**
   * @param {number} [screenWidth=SCREENWIDTH]
   * @param {number} [screenHeight=SCREENHEIGHT]
   */
  constructor(screenWidth = SCREENWIDTH, screenHeight = SCREENHEIGHT) {
    this.xdim = screenWidth;
    this.ydim = screenHeight;
    this.bytesperline = screenWidth;

    /** @type {Uint8Array} Linear frameplace */
    this.pixels = new Uint8Array(screenWidth * screenHeight);

    /** @type {Int32Array} Row byte offsets (ylookup) */
    this.ylookup = new Int32Array(screenHeight + 1);

    /** View window inclusive pixel bounds (setview). */
    this.windowx1 = 0;
    this.windowy1 = 0;
    this.windowx2 = screenWidth - 1;
    this.windowy2 = screenHeight - 1;

    /** Active draw width/height inside the window (xdimen / ydimen). */
    this.xdimen = screenWidth;
    this.ydimen = screenHeight;
    this.halfxdimen = (screenWidth / 2) | 0;

    /** ENGINE.C setaspect state */
    this.viewingrange = 65536;
    this.yxaspect = 65536;
    this.xyaspect = 65536;
    this.xdimenscale = 65536;
    this.xdimscale = 65536;
    this.viewingrangerecip = 65536;

    this._rebuildYlookup();
    this.setview(0, 0, screenWidth - 1, screenHeight - 1);
  }

  _rebuildYlookup() {
    let offset = 0;
    for (let i = 0; i <= this.ydim; i++) {
      this.ylookup[i] = offset;
      offset += this.bytesperline;
    }
  }

  /**
   * Resize the full screen buffer (rare; usually stays 320×200).
   * @param {number} width
   * @param {number} height
   */
  setResolution(width, height) {
    this.xdim = width;
    this.ydim = height;
    this.bytesperline = width;
    this.pixels = new Uint8Array(width * height);
    this.ylookup = new Int32Array(height + 1);
    this._rebuildYlookup();
    this.setview(0, 0, width - 1, height - 1);
  }

  /**
   * Build setview(x1,y1,x2,y2) — inclusive window coordinates.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   */
  setview(x1, y1, x2, y2) {
    this.windowx1 = x1 | 0;
    this.windowy1 = y1 | 0;
    this.windowx2 = x2 | 0;
    this.windowy2 = y2 | 0;
    this.xdimen = this.windowx2 - this.windowx1 + 1;
    this.ydimen = this.windowy2 - this.windowy1 + 1;
    this.halfxdimen = (this.xdimen / 2) | 0;
    // ENGINE.C setview → setaspect(65536, divscale16(ydim*320, xdim*200))
    this.setaspect(65536, divscale16(this.ydim * 320, this.xdim * 200));
  }

  /**
   * ENGINE.C setaspect(daxrange, daaspect).
   * @param {number} daxrange viewingrange (65536 = classic ~90°)
   * @param {number} daaspect yxaspect
   */
  setaspect(daxrange, daaspect) {
    this.viewingrange = daxrange | 0;
    this.yxaspect = daaspect | 0;
    this.viewingrangerecip = divscale32(1, this.viewingrange);
    this.xyaspect = divscale32(1, this.yxaspect);
    this.xdimenscale = scale(this.xdimen, this.yxaspect, 320);
    this.xdimscale = scale(320, this.xyaspect, this.xdimen);
  }

  /**
   * clearview — fill the current view window with a palette index.
   * @param {number} [color=0]
   */
  clearview(color = 0) {
    const c = color & 255;
    const { pixels, ylookup, windowx1, windowx2, windowy1, windowy2 } = this;
    const width = windowx2 - windowx1 + 1;

    for (let y = windowy1; y <= windowy2; y++) {
      const row = ylookup[y] + windowx1;
      pixels.fill(c, row, row + width);
    }
  }

  /**
   * clearallviews — fill the entire screen.
   * @param {number} [color=0]
   */
  clearallviews(color = 0) {
    this.pixels.fill(color & 255);
  }

  /**
   * Byte offset of pixel (x, y) — ylookup[y] + x.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  offsetAt(x, y) {
    return this.ylookup[y] + x;
  }

  /**
   * Dest for a vertical column at screen (x, y).
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  columnDest(x, y) {
    return this.ylookup[y] + x;
  }
}
