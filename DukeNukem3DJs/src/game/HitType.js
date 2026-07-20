/**
 * DUKE3D.H hittype[] + GLOBAL.C msx/msy — effector / actor scratch.
 */

export const MAX_MS = 2048;

/**
 * @typedef {{
 *   temp_data: number[],
 * }} HitType
 */

/** @type {HitType[]} */
export const hittype = [];

/** Relative wall points for rotating sectors (GLOBAL.C). */
export const msx = new Int32Array(MAX_MS);
export const msy = new Int32Array(MAX_MS);

let tempwallptr = 0;

export function clearHitTypes(numsprites) {
  hittype.length = 0;
  for (let i = 0; i < (numsprites | 0); i++) {
    hittype.push({ temp_data: [0, 0, 0, 0, 0, 0] });
  }
  tempwallptr = 0;
  msx.fill(0);
  msy.fill(0);
}

/** @returns {number} */
export function getTempWallPtr() {
  return tempwallptr;
}

/** @param {number} v */
export function setTempWallPtr(v) {
  tempwallptr = v | 0;
}

/**
 * @param {number} i
 * @returns {HitType}
 */
export function ensureHitType(i) {
  while (hittype.length <= i) {
    hittype.push({ temp_data: [0, 0, 0, 0, 0, 0] });
  }
  return hittype[i];
}
