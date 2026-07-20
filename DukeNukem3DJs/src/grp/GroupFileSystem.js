/**
 * File open helper matching CACHE1D.C kopen4load search order:
 * 1) Optional loose files from fetch paths / File overrides
 * 2) GRP archive entries
 *
 * Used for ART, palette.dat, maps, etc.
 */
export class GroupFileSystem {
  /**
   * @param {import('./GrpFile.js').GrpFile} grp
   * @param {{ looseFiles?: Map<string, Uint8Array> }} [options]
   */
  constructor(grp, options = {}) {
    this.grp = grp;
    /** @type {Map<string, Uint8Array>} */
    this.looseFiles = options.looseFiles ?? new Map();
  }

  /**
   * @param {string} filename
   * @param {Uint8Array} data
   */
  addLooseFile(filename, data) {
    this.looseFiles.set(filename.toUpperCase(), data);
  }

  /**
   * @param {string} filename
   * @returns {boolean}
   */
  exists(filename) {
    const key = filename.toUpperCase();
    return this.looseFiles.has(key) || this.grp.has(key);
  }

  /**
   * @param {string} filename
   * @returns {Uint8Array}
   */
  read(filename) {
    const key = filename.toUpperCase();
    if (this.looseFiles.has(key)) {
      return this.looseFiles.get(key);
    }
    return this.grp.read(key);
  }
}
