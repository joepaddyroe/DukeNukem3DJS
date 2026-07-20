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
export function mulscale16(a, b) {
  return mulscale(a, b, 16);
}

/** @param {number} a @param {number} b */
export function mulscale30(a, b) {
  return mulscale(a, b, 30);
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
export function divscale16(a, b) {
  return divscale(a, b, 16);
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
