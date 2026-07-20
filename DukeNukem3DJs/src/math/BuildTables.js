import { BUILD_ANGLES, BUILD_ANGLE_MASK } from '../core/renderConstants.js';

/**
 * Build ENGINE.C loadtables — sintable[2048] + radarang[1280].
 * Prefer TABLES.DAT from GRP; otherwise generate Ken-scale values (16384).
 */
export class BuildTables {
  constructor() {
    /** @type {Int16Array} */
    this.sintable = new Int16Array(BUILD_ANGLES);
    /** @type {Int16Array} */
    this.radarang = new Int16Array(1280);
    this.loaded = false;
    this.source = 'none';
  }

  /**
   * @param {import('../grp/GroupFileSystem.js').GroupFileSystem} fs
   */
  load(fs) {
    if (this.loaded) return this;
    if (fs.exists('TABLES.DAT')) {
      this.loadFromBuffer(fs.read('TABLES.DAT'));
      this.source = 'TABLES.DAT';
    } else {
      this.generate();
      this.source = 'generated';
    }
    this.loaded = true;
    return this;
  }

  /**
   * ENGINE.C loadtables file layout.
   * @param {Uint8Array} data
   */
  loadFromBuffer(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data.byteLength < 2048 * 2) {
      this.generate();
      return;
    }
    for (let i = 0; i < BUILD_ANGLES; i++) {
      this.sintable[i] = view.getInt16(i * 2, true);
    }
    if (data.byteLength >= 2048 * 2 + 640 * 2) {
      const base = 2048 * 2;
      for (let i = 0; i < 640; i++) {
        this.radarang[i] = view.getInt16(base + i * 2, true);
      }
      for (let i = 0; i < 640; i++) {
        this.radarang[1279 - i] = -this.radarang[i];
      }
    } else {
      this.generateRadarang();
    }
  }

  /** Approximate Ken sintable when TABLES.DAT is missing. */
  generate() {
    for (let i = 0; i < BUILD_ANGLES; i++) {
      this.sintable[i] =
        (Math.sin((i * Math.PI * 2) / BUILD_ANGLES) * 16384) | 0;
    }
    this.generateRadarang();
  }

  /** Approximate radarang for setaspect (used later by dosetaspect). */
  generateRadarang() {
    // Build: atan-based FOV table over half-width; scale matches typical tables.dat
    for (let i = 0; i < 640; i++) {
      this.radarang[i] =
        (Math.atan(i / 512) * (512 / (Math.PI / 2)) * 64) | 0;
    }
    for (let i = 0; i < 640; i++) {
      this.radarang[1279 - i] = -this.radarang[i];
    }
  }

  /**
   * cosglobalang = sintable[(ang+512)&2047]
   * @param {number} ang
   */
  cos(ang) {
    if (!this.loaded) this.generateFallback();
    return this.sintable[(ang + 512) & BUILD_ANGLE_MASK];
  }

  /**
   * singlobalang = sintable[ang&2047]
   * @param {number} ang
   */
  sin(ang) {
    if (!this.loaded) this.generateFallback();
    return this.sintable[ang & BUILD_ANGLE_MASK];
  }

  generateFallback() {
    this.generate();
    this.loaded = true;
    this.source = 'generated';
  }
}

/** Shared singleton filled by main.js load. */
export const buildTables = new BuildTables();
