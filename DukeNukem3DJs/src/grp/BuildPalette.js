/**
 * Build palette.dat loader (ENGINE.C — loadpalette).
 *
 * File layout:
 *   palette[768]          — VGA 6-bit RGB (0..63)
 *   numpalookups (uint16)
 *   palookup[numpalookups][256]
 *   transluc[65536]       — optional / present in Duke
 */
export class BuildPalette {
  /**
   * @param {Uint8Array} data palette.dat bytes
   */
  constructor(data) {
    if (data.length < 768 + 2) {
      throw new Error('palette.dat too small');
    }

    /** Raw VGA 6-bit RGB (768 bytes) */
    this.vga = data.subarray(0, 768);

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.numpalookups = view.getUint16(768, true);
    if (this.numpalookups < 1 || this.numpalookups > 256) {
      throw new Error(`Bad numpalookups: ${this.numpalookups}`);
    }

    const palookupBytes = this.numpalookups << 8;
    const palookupStart = 770;
    if (data.length < palookupStart + palookupBytes) {
      throw new Error('palette.dat truncated (palookup)');
    }

    /** Flat shade tables: shade * 256 + color */
    this.palookup = data.subarray(palookupStart, palookupStart + palookupBytes);

    const translucStart = palookupStart + palookupBytes;
    /** @type {Uint8Array|null} */
    this.transluc =
      data.length >= translucStart + 65536
        ? data.subarray(translucStart, translucStart + 65536)
        : null;

    /** 8-bit RGB for CanvasVideoOutput (768 bytes) */
    this.rgb888 = vgaToRgb888(this.vga);
  }

  /**
   * @param {import('./GroupFileSystem.js').GroupFileSystem} fs
   * @returns {BuildPalette}
   */
  static load(fs) {
    return new BuildPalette(fs.read('PALETTE.DAT'));
  }
}

/**
 * Scale VGA 0..63 channels to 0..255 (<< 2), matching common Build ports.
 * @param {Uint8Array} vga
 * @returns {Uint8ClampedArray}
 */
export function vgaToRgb888(vga) {
  const rgb = new Uint8ClampedArray(768);
  for (let i = 0; i < 768; i++) {
    rgb[i] = Math.min(255, (vga[i] & 63) << 2);
  }
  return rgb;
}
