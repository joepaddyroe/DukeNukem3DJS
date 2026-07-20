/**
 * PLAYER.C processinput subset — gravity, jump, crouch, friction walk + clipmove.
 * Skips weapons, water/jetpack, sounds, damage, CON for now.
 */
import { TICSPERFRAME } from '../core/gameConstants.js';
import { BUILD_ANGLE_MASK } from '../core/renderConstants.js';
import { clipmove, pushmove, getzrange, CLIPMASK0 } from '../engine/ClipMove.js';
import { klabs, mulscale, nsqrtasm } from '../math/fixed.js';
import { buildTables } from '../math/BuildTables.js';
import { BIT_CROUCH, BIT_JUMP } from './GetInput.js';

/** USER.CON GRAVITATIONALCONSTANT */
export const GC = 176;

/** GLOBAL.C dukefriction default */
export const DUKEFRICTION = 0xcc00;

/**
 * Ken ksgn.
 * @param {number} a
 */
function ksgn(a) {
  const v = a | 0;
  if (v < 0) return -1;
  if (v > 0) return 1;
  return 0;
}

/**
 * One Duke play tic for local player.
 * @param {import('./Player.js').Player} p
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {{ fvel: number, svel: number, avel: number, bits: number }} sync
 */
export function processInput(p, board, art, sync) {
  if (!board || p.cursectnum < 0) return;

  const sb = sync.bits | 0;
  let psect = p.cursectnum | 0;
  const sec = board.sectors[psect];
  if (!sec) return;

  let psectlotag = sec.lotag | 0;
  p.spritebridge = 0;

  const zr = getzrange({
    board,
    art,
    x: p.posx,
    y: p.posy,
    z: p.posz,
    sectnum: psect,
    walldist: 163,
    cliptype: CLIPMASK0,
  });
  let cz = zr.ceilz | 0;
  let fz = zr.florz | 0;

  // Standing eye height constant (PLAYER.C i = 40)
  let i = 40;

  // --- vertical (land only; skip underwater/jetpack) ---
  if (psectlotag !== 2) {
    if (psectlotag === 1 && p.spritebridge === 0) {
      i = 34;
    }

    if (p.posz < (fz - (i << 8))) {
      // falling
      if (
        (sb & 3) === 0 &&
        p.on_ground &&
        (sec.floorstat & 2) &&
        p.posz >= (fz - (i << 8) - (16 << 8))
      ) {
        p.posz = fz - (i << 8);
      } else {
        p.on_ground = 0;
        p.poszv += GC + 80;
        if (p.poszv >= 4096 + 2048) p.poszv = 4096 + 2048;
        if (p.poszv > 2400 && p.falling_counter < 255) {
          p.falling_counter++;
        }
      }
    } else {
      p.falling_counter = 0;

      if (
        psectlotag !== 1 &&
        psectlotag !== 2 &&
        p.on_ground === 0 &&
        p.poszv > (6144 >> 1)
      ) {
        p.hard_landing = (p.poszv >> 10) | 0;
      }

      p.on_ground = 1;

      if (i === 40) {
        let k = ((fz - (i << 8)) - p.posz) >> 1;
        if (klabs(k) < 256) k = 0;
        p.posz += k;
        p.poszv -= 768;
        if (p.poszv < 0) p.poszv = 0;
      } else if (p.jumping_counter === 0) {
        p.posz += ((fz - (i << 7)) - p.posz) >> 1;
        if (p.posz > fz - (16 << 8)) {
          p.posz = fz - (16 << 8);
          p.poszv >>= 1;
        }
      }

      if (sb & BIT_CROUCH) {
        p.posz += 2048 + 768;
      }

      if ((sb & BIT_JUMP) === 0 && p.jumping_toggle === 1) {
        p.jumping_toggle = 0;
      } else if ((sb & BIT_JUMP) && p.jumping_toggle === 0) {
        if (p.jumping_counter === 0 && fz - cz > (56 << 8)) {
          p.jumping_counter = 1;
          p.jumping_toggle = 1;
        }
      }

      if (p.jumping_counter && (sb & BIT_JUMP) === 0) {
        p.jumping_toggle = 0;
      }
    }

    if (p.jumping_counter) {
      if ((sb & BIT_JUMP) === 0 && p.jumping_toggle === 1) {
        p.jumping_toggle = 0;
      }

      if (p.jumping_counter < 1024 + 256) {
        if (psectlotag === 1 && p.jumping_counter > 768) {
          p.jumping_counter = 0;
          p.poszv = -512;
        } else {
          if (!buildTables.loaded) buildTables.generateFallback();
          const st = buildTables.sintable;
          p.poszv -= (st[(2048 - 128 + p.jumping_counter) & 2047] / 12) | 0;
          p.jumping_counter += 180;
          p.on_ground = 0;
        }
      } else {
        p.jumping_counter = 0;
        p.poszv = 0;
      }
    }

    p.posz += p.poszv;

    if (p.posz < cz + (4 << 8)) {
      p.jumping_counter = 0;
      if (p.poszv < 0) {
        p.posxv = 0;
        p.posyv = 0;
      }
      p.poszv = 128;
      p.posz = cz + (4 << 8);
    }
  }

  // --- turn ---
  let doubvel = TICSPERFRAME;
  if (sync.avel) {
    const tempang = (sync.avel << 1) | 0;
    const angvel = (tempang * ksgn(doubvel)) | 0;
    p.ang = (p.ang + angvel) & BUILD_ANGLE_MASK;
  }

  // --- horizontal accel + friction ---
  if (p.posxv || p.posyv || sync.fvel || sync.svel) {
    p.posxv += ((sync.fvel * doubvel) << 6);
    p.posyv += ((sync.svel * doubvel) << 6);

    if (p.on_ground && (sb & BIT_CROUCH)) {
      p.posxv = mulscale(p.posxv, DUKEFRICTION - 0x2000, 16);
      p.posyv = mulscale(p.posyv, DUKEFRICTION - 0x2000, 16);
    } else if (psectlotag === 2) {
      p.posxv = mulscale(p.posxv, DUKEFRICTION - 0x1400, 16);
      p.posyv = mulscale(p.posyv, DUKEFRICTION - 0x1400, 16);
    } else {
      p.posxv = mulscale(p.posxv, DUKEFRICTION, 16);
      p.posyv = mulscale(p.posyv, DUKEFRICTION, 16);
    }

    if (Math.abs(p.posxv) < 2048 && Math.abs(p.posyv) < 2048) {
      p.posxv = 0;
      p.posyv = 0;
    }
  }

  // --- clipmove (PLAYER.C HORIZONLY) ---
  const flordist = psectlotag === 1 || p.spritebridge === 1 ? 4 << 8 : 20 << 8;

  let r = clipmove({
    board,
    art,
    x: p.posx,
    y: p.posy,
    z: p.posz,
    sectnum: p.cursectnum,
    xvect: p.posxv,
    yvect: p.posyv,
    walldist: 164,
    ceildist: 4 << 8,
    flordist,
    cliptype: CLIPMASK0,
  });

  if (r.sectnum >= 0) {
    const pushed = pushmove({
      board,
      x: r.x,
      y: r.y,
      z: r.z,
      sectnum: r.sectnum,
      walldist: 128,
      ceildist: 4 << 8,
      flordist,
      cliptype: CLIPMASK0,
    });
    p.posx = pushed.x;
    p.posy = pushed.y;
    p.cursectnum = pushed.sectnum >= 0 ? pushed.sectnum : r.sectnum;
  }

  // --- weapon sway (PLAYER.C ~2636) ---
  if ((p.bobvel | 0) < 32 || p.on_ground === 0 || (p.bobcounter | 0) === 1024) {
    const ws = p.weapon_sway & 2047;
    if (ws > 1024 + 96) p.weapon_sway -= 96;
    else if (ws < 1024 - 96) p.weapon_sway += 96;
    else p.weapon_sway = 1024;
  } else {
    p.weapon_sway = p.bobcounter | 0;
  }

  const dx = (p.posx - p.bobposx) | 0;
  const dy = (p.posy - p.bobposy) | 0;
  p.bobvel = nsqrtasm(Math.imul(dx, dx) + Math.imul(dy, dy));
  if (p.on_ground) p.bobcounter = (p.bobcounter + (p.bobvel >> 1)) | 0;

  p.bobposx = p.posx;
  p.bobposy = p.posy;
}
