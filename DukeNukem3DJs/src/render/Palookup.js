/**
 * Shade / remapping tables (Build palookup from palette.dat).
 */
export class Palookup {
  /**
   * @param {number} [numShades=32]
   */
  constructor(numShades = 32) {
    this.numShades = numShades;
    /** Flat table: shade * 256 + color → remapped color */
    this.tables = new Uint8Array(numShades * 256);
    this.initIdentity();
  }

  /** Identity remap for every shade (pre-asset fallback). */
  initIdentity() {
    for (let shade = 0; shade < this.numShades; shade++) {
      const base = shade * 256;
      for (let c = 0; c < 256; c++) {
        this.tables[base + c] = c;
      }
    }
  }

  /**
   * Install tables from palette.dat (ENGINE.C loadpalette).
   * @param {Uint8Array} palookupFlat
   * @param {number} numpalookups
   */
  setFromPaletteDat(palookupFlat, numpalookups) {
    this.numShades = numpalookups;
    this.tables = new Uint8Array(numpalookups * 256);
    this.tables.set(palookupFlat.subarray(0, numpalookups * 256));
  }

  /**
   * Simple darkening when palette.dat is unavailable.
   */
  initDemoShading() {
    for (let shade = 0; shade < this.numShades; shade++) {
      const base = shade * 256;
      const keep = (this.numShades - 1 - shade) / Math.max(1, this.numShades - 1);
      for (let c = 0; c < 256; c++) {
        this.tables[base + c] = Math.max(0, Math.min(255, (c * keep) | 0));
      }
    }
  }

  /**
   * @param {number} shade
   * @returns {number}
   */
  shadeOffset(shade) {
    const s = Math.max(0, Math.min(this.numShades - 1, shade | 0));
    return s * 256;
  }
}
