/**
 * PLAYER.C getinput subset — keyboard → sync loc (fvel/svel world mom, avel, bits).
 */
import { mulscale9 } from '../math/fixed.js';
import { buildTables } from '../math/BuildTables.js';
import { BUILD_ANGLE_MASK } from '../core/renderConstants.js';

/** PLAYER.C getinput constants. */
const TURBOTURNTIME = (120 / 8) | 0; // TICRATE/8
const NORMALTURN = 15;
const PREAMBLETURN = 5;
const NORMALKEYMOVE = 40;
const MAXVEL = (NORMALKEYMOVE * 2) + 10;
const MAXSVEL = MAXVEL;
const MAXANGVEL = 127;

/** Sync bit 0 = jump, bit 1 = crouch (PLAYER.C). */
export const BIT_JUMP = 1;
export const BIT_CROUCH = 2;

/**
 * @param {import('../platform/input/Keyboard.js').Keyboard} kb
 * @param {import('./Player.js').Player} player
 * @param {{ autoRun?: boolean }} [opts]
 * @returns {{ fvel: number, svel: number, avel: number, bits: number }}
 */
export function getInput(kb, player, opts = {}) {
  const autoRun = opts.autoRun !== false;
  const running = autoRun || kb.isDown('ShiftLeft') || kb.isDown('ShiftRight');

  let bits = 0;
  if (kb.isDown('Space')) bits |= BIT_JUMP;
  if (kb.isDown('ControlLeft') || kb.isDown('ControlRight')) bits |= BIT_CROUCH;

  let turnamount;
  let keymove;
  if (running) {
    turnamount = NORMALTURN << 1;
    keymove = NORMALKEYMOVE << 1;
  } else {
    turnamount = NORMALTURN;
    keymove = NORMALKEYMOVE;
  }

  let vel = 0;
  let svel = 0;
  let angvel = 0;

  if (kb.isDown('KeyW') || kb.isDown('ArrowUp')) vel += keymove;
  if (kb.isDown('KeyS') || kb.isDown('ArrowDown')) vel -= keymove;
  if (kb.isDown('KeyA')) svel += keymove;
  if (kb.isDown('KeyD')) svel -= keymove;

  const turnLeft = kb.isDown('ArrowLeft') || kb.isDown('KeyQ');
  const turnRight = kb.isDown('ArrowRight') || kb.isDown('KeyE');
  if (turnLeft) {
    player.turnheldtime += 1;
    angvel -= player.turnheldtime >= TURBOTURNTIME ? turnamount : PREAMBLETURN;
  } else if (turnRight) {
    player.turnheldtime += 1;
    angvel += player.turnheldtime >= TURBOTURNTIME ? turnamount : PREAMBLETURN;
  } else {
    player.turnheldtime = 0;
  }

  if (vel < -MAXVEL) vel = -MAXVEL;
  if (vel > MAXVEL) vel = MAXVEL;
  if (svel < -MAXSVEL) svel = -MAXSVEL;
  if (svel > MAXSVEL) svel = MAXSVEL;
  if (angvel < -MAXANGVEL) angvel = -MAXANGVEL;
  if (angvel > MAXANGVEL) angvel = MAXANGVEL;

  if (!buildTables.loaded) buildTables.generateFallback();
  const daang = player.ang & BUILD_ANGLE_MASK;
  const st = buildTables.sintable;

  // PLAYER.C: mom from vel/svel into world axes
  let momx = mulscale9(vel, st[(daang + 2560) & 2047]);
  let momy = mulscale9(vel, st[(daang + 2048) & 2047]);
  momx = (momx + mulscale9(svel, st[(daang + 2048) & 2047])) | 0;
  momy = (momy + mulscale9(svel, st[(daang + 1536) & 2047])) | 0;

  return {
    fvel: momx | 0,
    svel: momy | 0,
    avel: angvel | 0,
    bits: bits | 0,
  };
}
