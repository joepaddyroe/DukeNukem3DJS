/**
 * @typedef {import('./ViewBuffer.js').ViewBuffer} ViewBuffer
 * @typedef {import('./Palookup.js').Palookup} Palookup
 */

/**
 * @typedef {Object} VlineParams
 * @property {number} x Absolute screen column
 * @property {number} y1 Top row (inclusive)
 * @property {number} y2 Bottom row (inclusive)
 * @property {number} vplc Texture V fixed-point start
 * @property {number} vinc Texture V step per pixel
 * @property {Uint8Array} texcol One texture column (column-major ART style)
 * @property {number} texHeight Height of texcol (wrap mask = height-1 if power of two)
 * @property {number} shadeOffset Offset into palookup.tables (shade * 256)
 * @property {number} [vShift=16] Bits to shift vplc for texel index — wallscan uses
 *   globalshiftval (32-log2(ysiz)), not 16. Demo stretch paths use 16.
 */

/**
 * Build vertical texture column drawer (ENGINE.C / a.asm — vlineasm1).
 *
 * ART tiles are column-major: one screen column samples a contiguous tex column,
 * advancing V with a DDA while writing down the screen by bytesperline.
 */
export class VlineDrawer {
  /**
   * @param {ViewBuffer} buffer
   * @param {Palookup} palookup
   */
  constructor(buffer, palookup) {
    this.buffer = buffer;
    this.palookup = palookup;
  }

  /**
   * Draw a solid-color vertical span (no texture).
   * @param {number} x
   * @param {number} y1
   * @param {number} y2
   * @param {number} color
   */
  drawSolid(x, y1, y2, color) {
    const { pixels, ylookup, bytesperline, windowy1, windowy2 } = this.buffer;
    let top = y1 | 0;
    let bot = y2 | 0;
    if (top < windowy1) top = windowy1;
    if (bot > windowy2) bot = windowy2;
    if (bot < top) return;

    const c = color & 255;
    let dest = ylookup[top] + x;
    for (let y = top; y <= bot; y++) {
      pixels[dest] = c;
      dest += bytesperline;
    }
  }

  /**
   * Textured vertical line with shade remap (vlineasm1).
   * @param {VlineParams} params
   */
  draw(params) {
    const {
      x,
      y1,
      y2,
      texcol,
      texHeight,
      shadeOffset,
    } = params;

    let top = y1 | 0;
    let bot = y2 | 0;
    const { windowy1, windowy2, pixels, ylookup, bytesperline } = this.buffer;

    if (top < windowy1) top = windowy1;
    if (bot > windowy2) bot = windowy2;
    if (bot < top) return;

    let vplc = params.vplc | 0;
    const vinc = params.vinc | 0;
    // wallscan: setupvlineasm(globalshiftval); texel = vplc >> glogy
    const vShift = params.vShift != null ? params.vShift | 0 : 16;
    const tables = this.palookup.tables;
    const mask = texHeight - 1;
    const powerOfTwo = (texHeight & mask) === 0;

    // If the top was clipped, advance vplc to match
    if (top !== (y1 | 0)) {
      vplc = (vplc + Math.imul(top - (y1 | 0), vinc)) | 0;
    }

    let dest = ylookup[top] + x;
    const shadeBase = shadeOffset | 0;

    if (powerOfTwo) {
      for (let y = top; y <= bot; y++) {
        const texel = texcol[(vplc >>> vShift) & mask];
        pixels[dest] = tables[shadeBase + texel];
        dest += bytesperline;
        vplc = (vplc + vinc) | 0;
      }
    } else {
      for (let y = top; y <= bot; y++) {
        let v = (vplc >>> vShift) % texHeight;
        if (v < 0) v += texHeight;
        const texel = texcol[v];
        pixels[dest] = tables[shadeBase + texel];
        dest += bytesperline;
        vplc = (vplc + vinc) | 0;
      }
    }
  }

  /**
   * maskwallscan / mvlineasm1 — skip transparent texel 255.
   * @param {VlineParams} params
   */
  drawMasked(params) {
    const {
      x,
      y1,
      y2,
      texcol,
      texHeight,
      shadeOffset,
    } = params;

    let top = y1 | 0;
    let bot = y2 | 0;
    const { windowy1, windowy2, pixels, ylookup, bytesperline } = this.buffer;

    if (top < windowy1) top = windowy1;
    if (bot > windowy2) bot = windowy2;
    if (bot < top) return;

    let vplc = params.vplc | 0;
    const vinc = params.vinc | 0;
    const vShift = params.vShift != null ? params.vShift | 0 : 16;
    const tables = this.palookup.tables;
    const mask = texHeight - 1;
    const powerOfTwo = (texHeight & mask) === 0;

    if (top !== (y1 | 0)) {
      vplc = (vplc + Math.imul(top - (y1 | 0), vinc)) | 0;
    }

    let dest = ylookup[top] + x;
    const shadeBase = shadeOffset | 0;

    if (powerOfTwo) {
      for (let y = top; y <= bot; y++) {
        const texel = texcol[(vplc >>> vShift) & mask] & 255;
        if (texel !== 255) pixels[dest] = tables[shadeBase + texel];
        dest += bytesperline;
        vplc = (vplc + vinc) | 0;
      }
    } else {
      for (let y = top; y <= bot; y++) {
        let v = (vplc >>> vShift) % texHeight;
        if (v < 0) v += texHeight;
        const texel = texcol[v] & 255;
        if (texel !== 255) pixels[dest] = tables[shadeBase + texel];
        dest += bytesperline;
        vplc = (vplc + vinc) | 0;
      }
    }
  }
}
