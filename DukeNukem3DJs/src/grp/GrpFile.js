/**
 * Build GRP archive reader (CACHE1D.C — initgroupfile / group directory).
 *
 * Header: "KenSilverman" (12) + fileCount (int32 LE)
 * Directory: fileCount × (name[12] + size int32 LE)
 * Then concatenated file payloads in directory order.
 */
export class GrpFile {
  /**
   * @param {ArrayBuffer} buffer
   */
  constructor(buffer) {
    this.buffer = buffer;
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);

    /** @type {Map<string, { offset: number, size: number, name: string }>} */
    this.entries = new Map();

    this._parse();
  }

  /**
   * @param {ArrayBuffer} buffer
   * @returns {GrpFile}
   */
  static fromBuffer(buffer) {
    return new GrpFile(buffer);
  }

  _parse() {
    if (this.bytes.length < 16) {
      throw new Error('GRP too small');
    }

    const magic = String.fromCharCode(...this.bytes.subarray(0, 12));
    if (magic !== 'KenSilverman') {
      throw new Error(`Not a Build GRP (magic="${magic}")`);
    }

    const fileCount = this.view.getInt32(12, true);
    if (fileCount < 0 || fileCount > 100000) {
      throw new Error(`Invalid GRP file count: ${fileCount}`);
    }

    const dirBytes = fileCount * 16;
    if (16 + dirBytes > this.bytes.length) {
      throw new Error('GRP directory truncated');
    }

    let dataOffset = 16 + dirBytes;
    for (let i = 0; i < fileCount; i++) {
      const entryBase = 16 + i * 16;
      const rawName = this.bytes.subarray(entryBase, entryBase + 12);
      const name = decodeGrpName(rawName);
      const size = this.view.getInt32(entryBase + 12, true);
      if (size < 0) {
        throw new Error(`Negative size for GRP entry ${name}`);
      }

      const key = name.toUpperCase();
      this.entries.set(key, {
        name,
        offset: dataOffset,
        size,
      });
      dataOffset += size;
    }

    this.fileCount = fileCount;
  }

  /**
   * @param {string} filename Case-insensitive 8.3 name
   * @returns {boolean}
   */
  has(filename) {
    return this.entries.has(filename.toUpperCase());
  }

  /**
   * @param {string} filename
   * @returns {Uint8Array}
   */
  read(filename) {
    const entry = this.entries.get(filename.toUpperCase());
    if (!entry) {
      throw new Error(`GRP entry not found: ${filename}`);
    }
    return this.bytes.subarray(entry.offset, entry.offset + entry.size);
  }

  /**
   * @returns {string[]}
   */
  listNames() {
    return [...this.entries.values()].map((e) => e.name);
  }
}

/**
 * @param {Uint8Array} raw
 * @returns {string}
 */
function decodeGrpName(raw) {
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0) {
      end = i;
      break;
    }
  }
  return String.fromCharCode(...raw.subarray(0, end));
}
