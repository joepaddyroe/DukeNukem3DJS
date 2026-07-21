/**
 * DUKE3D.H hittype[] + GLOBAL.C msx/msy — effector / actor scratch.
 */

export const MAX_MS = 2048;

/**
 * @typedef {{
 *   temp_data: number[],
 *   actorstayput: number,
 *   floorz: number,
 *   ceilingz: number,
 *   timetosleep: number,
 * }} HitType
 */

/** @type {HitType[]} */
export const hittype = [];

/** Relative wall points for rotating sectors (GLOBAL.C). */
export const msx = new Int32Array(MAX_MS);
export const msy = new Int32Array(MAX_MS);

let tempwallptr = 0;

function blankHit() {
  return {
    temp_data: [0, 0, 0, 0, 0, 0],
    actorstayput: -1,
    floorz: 0,
    ceilingz: 0,
    timetosleep: 0,
  };
}

export function clearHitTypes(numsprites) {
  hittype.length = 0;
  for (let i = 0; i < (numsprites | 0); i++) {
    hittype.push(blankHit());
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
    hittype.push(blankHit());
  }
  const ht = hittype[i];
  if (ht.actorstayput === undefined) ht.actorstayput = -1;
  if (ht.floorz === undefined) ht.floorz = 0;
  if (ht.ceilingz === undefined) ht.ceilingz = 0;
  if (ht.timetosleep === undefined) ht.timetosleep = 0;
  return ht;
}
