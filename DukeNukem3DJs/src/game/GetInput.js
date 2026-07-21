/**
 * PLAYER.C getinput subset — keyboard + mouse → sync loc.
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

/** Sync bit 0 = jump, bit 1 = crouch, bit 2 = fire (PLAYER.C). */
export const BIT_JUMP = 1;
export const BIT_CROUCH = 2;
export const BIT_FIRE = 4;
/** Look up / down (PLAYER.C bits 13 / 14). */
export const BIT_LOOK_UP = 1 << 13;
export const BIT_LOOK_DOWN = 1 << 14;
/** Center view (PLAYER.C bit 18). */
export const BIT_CENTER_VIEW = 1 << 18;
/** PLAYER.C loc.bits bit 29 — Open / USE */
export const BIT_OPEN = 1 << 29;

/** Mouse → ang / horiz scale (pixels per tic). */
const MOUSE_TURN_SCALE = 0.35;
const MOUSE_LOOK_SCALE = 0.45;

/**
 * @param {import('../platform/input/Keyboard.js').Keyboard} kb
 * @param {import('./Player.js').Player} player
 * @param {{ autoRun?: boolean }} [opts]
 * @returns {{ fvel: number, svel: number, avel: number, bits: number, horz: number }}
 */
export function getInput(kb, player, opts = {}) {
  const autoRun = opts.autoRun !== false;
  const running = autoRun || kb.isDown('ShiftLeft') || kb.isDown('ShiftRight');

  let bits = 0;
  if (kb.isDown('Space')) bits |= BIT_JUMP;
  // Z/C crouch (vanilla-ish); Ctrl+mouse = fire like classic Duke
  if (kb.isDown('KeyZ') || kb.isDown('KeyC')) bits |= BIT_CROUCH;
  if (
    kb.isDown('ControlLeft') ||
    kb.isDown('ControlRight') ||
    kb.isMouseDown(0)
  ) {
    bits |= BIT_FIRE;
  }
  // E = Open/USE (turn stays on arrows + Q)
  if (kb.isDown('KeyE')) bits |= BIT_OPEN;

  // Look up / down — PageUp/Down or R/F
  if (kb.isDown('PageUp') || kb.isDown('KeyR')) bits |= BIT_LOOK_UP;
  if (kb.isDown('PageDown') || kb.isDown('KeyF')) bits |= BIT_LOOK_DOWN;
  if (kb.isDown('Home')) bits |= BIT_CENTER_VIEW;

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
  let horz = 0;

  if (kb.isDown('KeyW') || kb.isDown('ArrowUp')) vel += keymove;
  if (kb.isDown('KeyS') || kb.isDown('ArrowDown')) vel -= keymove;
  if (kb.isDown('KeyA')) svel += keymove;
  if (kb.isDown('KeyD')) svel -= keymove;

  const turnLeft = kb.isDown('ArrowLeft') || kb.isDown('KeyQ');
  const turnRight = kb.isDown('ArrowRight');
  if (turnLeft) {
    player.turnheldtime += 1;
    angvel -= player.turnheldtime >= TURBOTURNTIME ? turnamount : PREAMBLETURN;
  } else if (turnRight) {
    player.turnheldtime += 1;
    angvel += player.turnheldtime >= TURBOTURNTIME ? turnamount : PREAMBLETURN;
  } else {
    player.turnheldtime = 0;
  }

  // Pointer-lock mouse look
  const { dx, dy } = kb.consumeMouseDelta();
  if (dx || dy) {
    angvel += dx * MOUSE_TURN_SCALE;
    // Mouse forward = look up (increase horiz), matching typical FPS
    horz -= dy * MOUSE_LOOK_SCALE;
  }

  if (vel < -MAXVEL) vel = -MAXVEL;
  if (vel > MAXVEL) vel = MAXVEL;
  if (svel < -MAXSVEL) svel = -MAXSVEL;
  if (svel > MAXSVEL) svel = MAXSVEL;
  if (angvel < -MAXANGVEL) angvel = -MAXANGVEL;
  if (angvel > MAXANGVEL) angvel = MAXANGVEL;
  if (horz < -127) horz = -127;
  if (horz > 127) horz = 127;

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
    horz: horz | 0,
  };
}
