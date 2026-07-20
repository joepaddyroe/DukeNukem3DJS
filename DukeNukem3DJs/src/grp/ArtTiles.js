import { MAXTILES } from '../core/gameConstants.js';

/**
 * Build ART tile manager (ENGINE.C — loadpics / loadtile).
 *
 * ART files are column-major: for each tile, pixels are stored as
 * height runs per column (waloff layout).
 */
export class ArtTiles {
  /**
   * @param {import('./GroupFileSystem.js').GroupFileSystem} fs
   */
  constructor(fs) {
    this.fs = fs;

    /** @type {Int16Array} */
    this.tilesizx = new Int16Array(MAXTILES);
    /** @type {Int16Array} */
    this.tilesizy = new Int16Array(MAXTILES);
    /** @type {Int32Array} */
    this.picanm = new Int32Array(MAXTILES);
    /** @type {Int32Array} which ART file index owns the tile */
    this.tilefilenum = new Int32Array(MAXTILES).fill(-1);
    /** @type {Int32Array} byte offset of tile payload inside that ART file */
    this.tilefileoffs = new Int32Array(MAXTILES);
    /** @type {(Uint8Array|null)[]} cached tile pixels (waloff) */
    this.waloff = new Array(MAXTILES).fill(null);

    this.numtilefiles = 0;
    /** @type {string} base name pattern e.g. tiles000.art */
    this.artfilename = 'tiles000.art';
  }

  /**
   * loadpics("tiles000.art") — scan tiles000, tiles001, … until missing.
   * @param {string} [filename='tiles000.art']
   * @returns {number} 0 on success (ENGINE.C convention)
   */
  loadpics(filename = 'tiles000.art') {
    this.artfilename = filename.toLowerCase();
    this.tilesizx.fill(0);
    this.tilesizy.fill(0);
    this.picanm.fill(0);
    this.tilefilenum.fill(-1);
    this.tilefileoffs.fill(0);
    this.waloff.fill(null);

    this.numtilefiles = 0;
    let k = 0;
    do {
      k = this.numtilefiles;
      const artName = this._artNameForIndex(k);
      if (!this.fs.exists(artName)) {
        break;
      }

      const data = this.fs.read(artName);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const artversion = view.getInt32(0, true);
      if (artversion !== 1) {
        throw new Error(`${artName}: artversion ${artversion} (expected 1)`);
      }

      // numtiles at +4 is legacy / unused for sizing
      const localtilestart = view.getInt32(8, true);
      const localtileend = view.getInt32(12, true);
      if (localtilestart < 0 || localtileend >= MAXTILES || localtileend < localtilestart) {
        throw new Error(`${artName}: bad tile range ${localtilestart}..${localtileend}`);
      }

      const count = localtileend - localtilestart + 1;
      let pos = 16;
      for (let i = 0; i < count; i++) {
        this.tilesizx[localtilestart + i] = view.getInt16(pos, true);
        pos += 2;
      }
      for (let i = 0; i < count; i++) {
        this.tilesizy[localtilestart + i] = view.getInt16(pos, true);
        pos += 2;
      }
      for (let i = 0; i < count; i++) {
        this.picanm[localtilestart + i] = view.getInt32(pos, true);
        pos += 4;
      }

      // ENGINE.C: offscount = 4+4+4+4+((end-start+1)<<3);
      let offscount = 16 + (count << 3);
      for (let i = localtilestart; i <= localtileend; i++) {
        this.tilefilenum[i] = k;
        this.tilefileoffs[i] = offscount;
        const dasiz = (this.tilesizx[i] * this.tilesizy[i]) | 0;
        offscount += dasiz;
      }

      this.numtilefiles++;
    } while (k !== this.numtilefiles);

    if (this.numtilefiles === 0) {
      throw new Error(`loadpics: no ART files found starting at ${filename}`);
    }

    return 0;
  }

  /**
   * loadtile — ensure waloff[tilenume] is populated.
   * @param {number} tilenume
   * @returns {Uint8Array|null}
   */
  loadtile(tilenume) {
    if (tilenume < 0 || tilenume >= MAXTILES) {
      return null;
    }
    const xsiz = this.tilesizx[tilenume];
    const ysiz = this.tilesizy[tilenume];
    const dasiz = (xsiz * ysiz) | 0;
    if (dasiz <= 0) {
      return null;
    }

    if (this.waloff[tilenume]) {
      return this.waloff[tilenume];
    }

    const fileIndex = this.tilefilenum[tilenume];
    if (fileIndex < 0) {
      return null;
    }

    const artName = this._artNameForIndex(fileIndex);
    const file = this.fs.read(artName);
    const offset = this.tilefileoffs[tilenume];
    const pixels = file.subarray(offset, offset + dasiz);
    if (pixels.length < dasiz) {
      throw new Error(`loadtile(${tilenume}): truncated in ${artName}`);
    }

    // Copy so cache owns its buffer (subarray views the ART file)
    const copy = new Uint8Array(dasiz);
    copy.set(pixels);
    this.waloff[tilenume] = copy;
    return copy;
  }

  /**
   * One texture column for vline (ART column-major).
   * @param {number} tilenume
   * @param {number} columnX
   * @returns {Uint8Array|null}
   */
  getColumn(tilenume, columnX) {
    const pixels = this.loadtile(tilenume);
    if (!pixels) {
      return null;
    }
    const xsiz = this.tilesizx[tilenume];
    const ysiz = this.tilesizy[tilenume];
    const x = ((columnX % xsiz) + xsiz) % xsiz;
    return pixels.subarray(x * ysiz, x * ysiz + ysiz);
  }

  /**
   * First non-empty tile with both dimensions > 0 (for demos).
   * @param {number} [start=0]
   * @returns {number}
   */
  findFirstTile(start = 0) {
    for (let i = start; i < MAXTILES; i++) {
      if (this.tilesizx[i] > 0 && this.tilesizy[i] > 0) {
        return i;
      }
    }
    return -1;
  }

  /**
   * @param {number} index
   * @returns {string}
   */
  _artNameForIndex(index) {
    // tiles000.art — digits at positions matching ENGINE.C artfilename[5..7]
    const base = this.artfilename.toUpperCase();
    // Expect TILES###.ART
    const prefix = base.startsWith('TILES') ? 'TILES' : 'tiles';
    const num = String(index).padStart(3, '0');
    const ext = base.endsWith('.ART') || base.endsWith('.art') ? base.slice(-4) : '.ART';
    return `${prefix}${num}${ext}`;
  }
}
