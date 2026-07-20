/**
 * Build-style fixed-point helpers (PRAGMAS.H / ENGINE.C mulscale family).
 * Values are treated as signed 32-bit integers.
 */

/** Truncate to signed 32-bit. */
export function int32(value) {
  return value | 0;
}

/**
 * (a * b) >> scale — Ken's mulscale.
 * @param {number} a
 * @param {number} b
 * @param {number} scale
 * @returns {number}
 */
export function mulscale(a, b, scale) {
  return Number((BigInt(a | 0) * BigInt(b | 0)) >> BigInt(scale)) | 0;
}

/** @param {number} a @param {number} b */
export function mulscale2(a, b) {
  return mulscale(a, b, 2);
}

/** @param {number} a @param {number} b */
export function mulscale5(a, b) {
  return mulscale(a, b, 5);
}

/** @param {number} a @param {number} b */
export function mulscale11(a, b) {
  return mulscale(a, b, 11);
}

/** @param {number} a @param {number} b */
export function mulscale8(a, b) {
  return mulscale(a, b, 8);
}

/** @param {number} a @param {number} b */
export function mulscale9(a, b) {
  return mulscale(a, b, 9);
}

/** @param {number} a @param {number} b */
export function mulscale10(a, b) {
  return mulscale(a, b, 10);
}

/** @param {number} a @param {number} b */
export function mulscale14(a, b) {
  return mulscale(a, b, 14);
}

/** @param {number} a @param {number} b */
export function mulscale15(a, b) {
  return mulscale(a, b, 15);
}

/** @param {number} a @param {number} b */
export function mulscale16(a, b) {
  return mulscale(a, b, 16);
}

/** @param {number} a @param {number} b */
export function mulscale18(a, b) {
  return mulscale(a, b, 18);
}

/** @param {number} a @param {number} b */
export function mulscale19(a, b) {
  return mulscale(a, b, 19);
}

/** @param {number} a @param {number} b */
export function mulscale20(a, b) {
  return mulscale(a, b, 20);
}

/** @param {number} a @param {number} b */
export function mulscale21(a, b) {
  return mulscale(a, b, 21);
}

/** @param {number} a @param {number} b */
export function mulscale24(a, b) {
  return mulscale(a, b, 24);
}

/** @param {number} a @param {number} b */
export function mulscale30(a, b) {
  return mulscale(a, b, 30);
}

/** @param {number} a @param {number} b */
export function mulscale31(a, b) {
  return mulscale(a, b, 31);
}

/**
 * ((a*b)+(c*d)) >> scale
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} scale
 */
export function dmulscale(a, b, c, d, scale) {
  return (
    Number(
      (BigInt(a | 0) * BigInt(b | 0) + BigInt(c | 0) * BigInt(d | 0)) >>
        BigInt(scale),
    ) | 0
  );
}

/** @param {number} a @param {number} b @param {number} c @param {number} d */
export function dmulscale6(a, b, c, d) {
  return dmulscale(a, b, c, d, 6);
}

/** @param {number} a @param {number} b @param {number} c @param {number} d */
export function dmulscale10(a, b, c, d) {
  return dmulscale(a, b, c, d, 10);
}

/** @param {number} a @param {number} b @param {number} c @param {number} d */
export function dmulscale14(a, b, c, d) {
  return dmulscale(a, b, c, d, 14);
}

/** @param {number} a @param {number} b @param {number} c @param {number} d */
export function dmulscale24(a, b, c, d) {
  return dmulscale(a, b, c, d, 24);
}

/** @param {number} a @param {number} b @param {number} c @param {number} d */
export function dmulscale32(a, b, c, d) {
  return dmulscale(a, b, c, d, 32);
}

/**
 * ENGINE.C reciptable — used by krecipasm.
 * reciptable[i] = divscale30(2048, i+2048)
 * @type {Int32Array}
 */
const reciptable = (() => {
  const t = new Int32Array(2048);
  for (let i = 0; i < 2048; i++) {
    t[i] = Number((BigInt(2048) << 30n) / BigInt(i + 2048)) | 0;
  }
  return t;
})();

const _krecipBits = new DataView(new ArrayBuffer(4));

/**
 * Ken's krecipasm — ENGINE.C FPU recip + reciptable (not 2^32/n).
 * Portable form from JFBuild: float bits → table → sar by exponent.
 * @param {number} n
 * @returns {number}
 */
export function krecipasm(n) {
  const v = n | 0;
  if (v === 0) return 0x7fffffff;
  _krecipBits.setFloat32(0, v, true);
  const bits = _krecipBits.getInt32(0, true);
  const shift = (((bits - 0x3f800000) | 0) >> 23) & 31;
  return (reciptable[(bits >> 12) & 2047] >> shift) ^ (bits >> 31);
}

/** @param {number} a */
export function klabs(a) {
  const v = a | 0;
  return v < 0 ? (-v) | 0 : v;
}

/**
 * (a << scale) / b — Ken's divscale.
 * @param {number} a
 * @param {number} b
 * @param {number} scale
 * @returns {number}
 */
export function divscale(a, b, scale) {
  if (b === 0) {
    return (a ^ b) < 0 ? -0x80000000 : 0x7fffffff;
  }
  return Number((BigInt(a | 0) << BigInt(scale)) / BigInt(b | 0)) | 0;
}

/** @param {number} a @param {number} b */
export function divscale12(a, b) {
  return divscale(a, b, 12);
}

/** @param {number} a @param {number} b */
export function divscale14(a, b) {
  return divscale(a, b, 14);
}

/** @param {number} a @param {number} b */
export function divscale16(a, b) {
  return divscale(a, b, 16);
}

/** @param {number} a @param {number} b */
export function divscale26(a, b) {
  return divscale(a, b, 26);
}

/** @param {number} a @param {number} b */
export function divscale28(a, b) {
  return divscale(a, b, 28);
}

/** @param {number} a @param {number} b */
export function divscale30(a, b) {
  return divscale(a, b, 30);
}

/** @param {number} a @param {number} b */
export function divscale32(a, b) {
  return divscale(a, b, 32);
}

/** Approximate nsqrtasm — integer sqrt. */
export function nsqrtasm(n) {
  const v = n >>> 0;
  if (v === 0) return 0;
  return Math.floor(Math.sqrt(v)) | 0;
}

/**
 * Scale value from one range into another (ENGINE.C scale()).
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
export function scale(a, b, c) {
  if (c === 0) {
    return 0;
  }
  return Number((BigInt(a | 0) * BigInt(b | 0)) / BigInt(c | 0)) | 0;
}
