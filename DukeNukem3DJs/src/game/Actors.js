/**
 * ACTORS.C / GAME.C enemy subset — E1L1 LIZTROOP + PIGCOP.
 * Hardcoded AI (no CON): wake → seek → shoot → die.
 */
import {
  FIRELASER,
  LIZTROOP,
  LIZTROOPDSPRITE,
  LIZTROOPDUCKING,
  LIZTROOPJETPACK,
  LIZTROOPJUSTSIT,
  LIZTROOPONTOILET,
  LIZTROOPRUNNING,
  LIZTROOPSHOOT,
  LIZTROOPSTAYPUT,
  PIGCOP,
  PIGCOPDEADSPRITE,
  PIGCOPDIVE,
  PIGCOPSTAYPUT,
} from './Names.js';
import { ensureHitType } from './HitType.js';
import { canSee } from '../engine/CanSee.js';
import { clipmove, getangle, CLIPMASK0 } from '../engine/ClipMove.js';
import { getzsofslope, updatesector } from '../engine/SectorQuery.js';
import { CLIPMASK1 } from '../engine/Hitscan.js';
import { nsqrtasm, klabs } from '../math/fixed.js';
import { buildTables } from '../math/BuildTables.js';
import { insertSprite } from './Spawn.js';
import { BUILD_ANGLE_MASK } from '../core/renderConstants.js';

/** USER.CON */
export const TROOPSTRENGTH = 30;
export const PIGCOPSTRENGTH = 100;
export const FIRELASER_WEAPON_STRENGTH = 7;
export const PISTOL_WEAPON_STRENGTH = 6;

/** USER.CON TROOPWALKVELS */
const TROOP_WALK_VEL = 72;
const PIG_WALK_VEL = 64;

/** Show all skill-tagged map enemies (lotag 0–3). */
export const PLAYER_SKILL = 4;

const FOURSLEIGHT = 1 << 8;

/** Wake / engage ranges (Build units). */
const WAKE_DIST = 10240;
const SHOOT_DIST = 4096;
const KEEP_DIST = 1536;

/** temp_data modes */
const MODE_SLEEP = 0;
const MODE_SEEK = 1;
const MODE_SHOOT = 2;
const MODE_DYING = 3;
const MODE_DEAD = 4;

/** LIZTROOPDSPRITE — ATROOPDEAD frame offset 54 */
const LIZTROOP_DEAD = LIZTROOPDSPRITE;

/**
 * @param {number} pic
 */
export function isEnemyPic(pic) {
  switch (pic & 0xffff) {
    case LIZTROOP:
    case LIZTROOPRUNNING:
    case LIZTROOPSTAYPUT:
    case LIZTROOPSHOOT:
    case LIZTROOPJETPACK:
    case LIZTROOPONTOILET:
    case LIZTROOPJUSTSIT:
    case LIZTROOPDUCKING:
    case PIGCOP:
    case PIGCOPSTAYPUT:
    case PIGCOPDIVE:
      return true;
    default:
      return false;
  }
}

/**
 * @param {number} pic
 */
function isTroopPic(pic) {
  switch (pic & 0xffff) {
    case LIZTROOP:
    case LIZTROOPRUNNING:
    case LIZTROOPSTAYPUT:
    case LIZTROOPSHOOT:
    case LIZTROOPJETPACK:
    case LIZTROOPONTOILET:
    case LIZTROOPJUSTSIT:
    case LIZTROOPDUCKING:
      return true;
    default:
      return false;
  }
}

/**
 * @param {number} pic
 */
function isPigPic(pic) {
  const p = pic & 0xffff;
  return p === PIGCOP || p === PIGCOPSTAYPUT || p === PIGCOPDIVE;
}

/**
 * GAME.C spawn badguy pass.
 * @param {import('../engine/Board.js').Board} board
 */
export function initActors(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    const pic = sp.picnum & 0xffff;
    if (!isEnemyPic(pic)) continue;

    const ht = ensureHitType(i);

    if (pic === LIZTROOPSTAYPUT || pic === PIGCOPSTAYPUT) {
      ht.actorstayput = sp.sectnum | 0;
    }

    // Skill / monsters_off cull
    if ((sp.lotag | 0) > PLAYER_SKILL) {
      hideActor(sp);
      continue;
    }

    if ((sp.pal | 0) === 0 && isTroopPic(pic)) sp.pal = 22;

    sp.xrepeat = 40;
    sp.yrepeat = 40;
    sp.clipdist = 80;
    // Face + block + hitscan (clear wall/floor orient bits from map)
    sp.cstat = 257;
    sp.owner = i;
    sp.statnum = 1; // awake (skip sleep list for v1)
    sp.extra = isPigPic(pic) ? PIGCOPSTRENGTH : TROOPSTRENGTH;

    // Normalize variant pics to base for AI (keep stayput flag)
    if (isTroopPic(pic) && pic !== LIZTROOPSHOOT) {
      sp.picnum = LIZTROOP;
      ht.temp_data[5] = 0;
    } else if (isPigPic(pic)) {
      sp.picnum = PIGCOP;
      ht.temp_data[5] = 1;
    }

    // Rest on floor
    const florz = getzsofslope(board, sp.sectnum, sp.x | 0, sp.y | 0).florz | 0;
    sp.z = (florz - FOURSLEIGHT) | 0;
    ht.floorz = florz;
    ht.temp_data[0] = MODE_SLEEP;
    ht.temp_data[1] = 0;
    ht.temp_data[2] = 0;
    ht.timetosleep = 0;
  }
}

/**
 * @param {import('../engine/Board.js').Sprite} sp
 */
function hideActor(sp) {
  sp.cstat = (sp.cstat | 32768) | 0;
  sp.xrepeat = 0;
  sp.yrepeat = 0;
  sp.extra = 0;
}

/**
 * @param {number} pic
 */
function isActiveEnemyPic(pic) {
  const p = pic & 0xffff;
  if (p === LIZTROOPSHOOT || p === LIZTROOP_DEAD) return true;
  if (p === PIGCOP || p === PIGCOPDEADSPRITE) return true;
  // Walk / death frames relative to LIZTROOP
  if (p >= LIZTROOP && p <= LIZTROOP + 54) return true;
  return isEnemyPic(p);
}

/**
 * Apply bullet damage (Weapons.js).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} i
 * @param {number} damage
 * @returns {boolean} handled as enemy
 */
export function damageActor(board, i, damage) {
  const sp = board.sprites[i];
  if (!sp || (sp.xrepeat | 0) === 0) return false;
  if (!isActiveEnemyPic(sp.picnum)) return false;
  if ((sp.extra | 0) <= 0) return true;

  sp.extra = ((sp.extra | 0) - (damage | 0)) | 0;
  const ht = ensureHitType(i);
  if ((ht.temp_data[0] | 0) === MODE_SLEEP) ht.temp_data[0] = MODE_SEEK;
  if ((sp.extra | 0) <= 0) {
    sp.extra = 0;
    ht.temp_data[0] = MODE_DYING;
    ht.temp_data[1] = 0;
    sp.cstat &= ~257;
  }
  return true;
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player} p
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 */
export function processActors(board, p, art) {
  if (!board || p.cursectnum < 0) return;
  if (!buildTables.loaded) buildTables.generateFallback();

  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.xrepeat | 0) === 0) continue;
    const pic = sp.picnum & 0xffff;
    if (!isActiveEnemyPic(pic)) continue;

    const ht = ensureHitType(i);
    let mode = ht.temp_data[0] | 0;

    if (mode === MODE_DEAD) continue;

    if (mode === MODE_DYING) {
      tickDying(sp, ht, pic);
      continue;
    }

    // Floor snap
    if ((sp.sectnum | 0) < 0 || (sp.sectnum | 0) >= board.numsectors) continue;
    const florz = getzsofslope(board, sp.sectnum, sp.x | 0, sp.y | 0).florz | 0;
    sp.z = (florz - FOURSLEIGHT) | 0;
    ht.floorz = florz;

    const dx = ((p.posx | 0) - (sp.x | 0)) | 0;
    const dy = ((p.posy | 0) - (sp.y | 0)) | 0;
    const dist = (nsqrtasm(Math.imul(dx, dx) + Math.imul(dy, dy)) + 1) | 0;
    const angTo = getangle(dx, dy);

    const eyeZ = ((sp.z | 0) - (40 << 8)) | 0;
    const see = canSee(
      board,
      sp.x | 0,
      sp.y | 0,
      eyeZ,
      sp.sectnum | 0,
      p.posx | 0,
      p.posy | 0,
      p.posz | 0,
      p.cursectnum | 0,
    );

    if (mode === MODE_SLEEP) {
      if (dist < WAKE_DIST && see) {
        mode = MODE_SEEK;
        ht.temp_data[0] = mode;
      } else continue;
    }

    // Face player
    sp.ang = angTo & BUILD_ANGLE_MASK;

    if (see && dist < SHOOT_DIST && dist > 256) {
      mode = MODE_SHOOT;
      ht.temp_data[0] = mode;
    } else if (mode === MODE_SHOOT && (!see || dist >= SHOOT_DIST + 512)) {
      mode = MODE_SEEK;
      ht.temp_data[0] = mode;
    }

    if (mode === MODE_SHOOT) {
      tickShoot(board, art, sp, ht, p, dist, i);
    } else {
      tickSeek(board, art, sp, ht, p, dist, angTo, i);
    }
  }

  processLasers(board, p, art);
}

/**
 * @param {import('../engine/Board.js').Sprite} sp
 * @param {import('./HitType.js').HitType} ht
 * @param {number} pic
 */
function tickDying(sp, ht, pic) {
  ht.temp_data[1] = (ht.temp_data[1] | 0) + 1;
  const t = ht.temp_data[1] | 0;
  const pig = (ht.temp_data[5] | 0) === 1;
  if (pig) {
    sp.picnum = PIGCOPDEADSPRITE;
  } else {
    if (t < 16) sp.picnum = (LIZTROOP + 50 + Math.min(4, (t >> 2) | 0)) | 0;
    else sp.picnum = LIZTROOP_DEAD;
  }
  if (t >= 20) {
    ht.temp_data[0] = MODE_DEAD;
    sp.cstat &= ~257;
  }
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {import('../engine/Board.js').Sprite} sp
 * @param {import('./HitType.js').HitType} ht
 * @param {import('./Player.js').Player} p
 * @param {number} dist
 * @param {number} angTo
 * @param {number} i
 */
function tickSeek(board, art, sp, ht, p, dist, angTo, i) {
  const pig = (ht.temp_data[5] | 0) === 1;
  // Keep base tile — CON walk frames are view-rotated, not picnum+1..3
  sp.picnum = pig ? PIGCOP : LIZTROOP;

  ht.temp_data[2] = ((ht.temp_data[2] | 0) + 1) | 0;

  const stay = ht.actorstayput | 0;
  if (stay >= 0 && (sp.sectnum | 0) !== stay) {
    // Stayput: face only, don't leave sector
    return;
  }

  if (dist <= KEEP_DIST) return;

  const vel = pig ? PIG_WALK_VEL : TROOP_WALK_VEL;
  moveActor(board, art, sp, angTo, vel, i);
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {import('../engine/Board.js').Sprite} sp
 * @param {import('./HitType.js').HitType} ht
 * @param {import('./Player.js').Player} p
 * @param {number} dist
 * @param {number} i
 */
function tickShoot(board, art, sp, ht, p, dist, i) {
  const pig = (ht.temp_data[5] | 0) === 1;
  sp.picnum = pig ? PIGCOP : LIZTROOPSHOOT;

  ht.temp_data[1] = (ht.temp_data[1] | 0) + 1;
  if ((ht.temp_data[1] | 0) < 12) return;
  ht.temp_data[1] = 0;

  if (pig) {
    // Hitscan shotgun-ish
    shootAtPlayer(board, art, sp, p, 10);
  } else {
    spawnLaser(board, sp, i);
  }
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {import('../engine/Board.js').Sprite} sp
 * @param {number} ang
 * @param {number} vel
 * @param {number} _selfIndex
 */
function moveActor(board, art, sp, ang, vel, _selfIndex) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;
  const a = ang & BUILD_ANGLE_MASK;
  const xvect = Math.imul(vel, st[(a + 512) & 2047]) | 0;
  const yvect = Math.imul(vel, st[a & 2047]) | 0;

  const oldCstat = sp.cstat | 0;
  sp.cstat = (oldCstat & ~1) | 0; // don't clip against self

  const r = clipmove({
    board,
    art,
    x: sp.x | 0,
    y: sp.y | 0,
    z: sp.z | 0,
    sectnum: sp.sectnum | 0,
    xvect,
    yvect,
    walldist: (sp.clipdist << 2) | 0,
    ceildist: 4 << 8,
    flordist: 20 << 8,
    cliptype: CLIPMASK0,
  });

  sp.cstat = oldCstat;
  sp.x = r.x | 0;
  sp.y = r.y | 0;

  const prevSect = sp.sectnum | 0;
  let sect = updatesector(sp.x, sp.y, board, r.sectnum | 0);
  if (sect < 0) sect = updatesector(sp.x, sp.y, board, prevSect);
  if (sect < 0) sect = prevSect;
  if (sect < 0 || sect >= board.numsectors || !board.sectors[sect]) {
    // Left the map — freeze pose, keep last good sector if any
    if (prevSect >= 0 && prevSect < board.numsectors) sp.sectnum = prevSect;
    return;
  }
  sp.sectnum = sect;

  const florz = getzsofslope(board, sp.sectnum, sp.x, sp.y).florz | 0;
  sp.z = (florz - FOURSLEIGHT) | 0;
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../engine/Board.js').Sprite} sp
 * @param {number} owner
 */
function spawnLaser(board, sp, owner) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;
  const a = sp.ang & BUILD_ANGLE_MASK;
  const idx = insertSprite(board, {
    x: (sp.x + (st[(a + 512) & 2047] >> 9)) | 0,
    y: (sp.y + (st[a & 2047] >> 9)) | 0,
    z: ((sp.z | 0) - (32 << 8)) | 0,
    sectnum: sp.sectnum,
    picnum: FIRELASER,
    shade: -40,
    xrepeat: 16,
    yrepeat: 16,
    ang: a,
    cstat: 128,
    xvel: 600,
    zvel: 0,
    owner,
    statnum: 5,
    extra: FIRELASER_WEAPON_STRENGTH,
  });
  if (idx >= 0) ensureHitType(idx);
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {import('../engine/Board.js').Sprite} sp
 * @param {import('./Player.js').Player} p
 * @param {number} damage
 */
function shootAtPlayer(board, art, sp, p, damage) {
  const eyeZ = ((sp.z | 0) - (32 << 8)) | 0;
  if (
    canSee(
      board,
      sp.x | 0,
      sp.y | 0,
      eyeZ,
      sp.sectnum | 0,
      p.posx | 0,
      p.posy | 0,
      p.posz | 0,
      p.cursectnum | 0,
    )
  ) {
    hurtPlayer(p, damage);
  }
}

/**
 * @param {import('./Player.js').Player} p
 * @param {number} damage
 */
function hurtPlayer(p, damage) {
  if ((p.extra | 0) <= 0) return;
  // Armor absorbs half
  let dmg = damage | 0;
  const shield = p.shield_amount | 0;
  if (shield > 0) {
    const soak = Math.min(shield, (dmg + 1) >> 1);
    p.shield_amount = (shield - soak) | 0;
    dmg -= soak;
  }
  p.extra = Math.max(0, (p.extra | 0) - dmg);
  p.last_extra = p.extra | 0;
  if (dmg > 0) p.lastUse = `ow ${dmg}`;
}

/**
 * Move FIRELASER projectiles.
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player} p
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 */
function processLasers(board, p, art) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== FIRELASER) continue;
    if ((s.xrepeat | 0) === 0) continue;

    const a = s.ang & BUILD_ANGLE_MASK;
    const xv = Math.imul(s.xvel | 0, st[(a + 512) & 2047]) | 0;
    const yv = Math.imul(s.xvel | 0, st[a & 2047]) | 0;

    const r = clipmove({
      board,
      art,
      x: s.x | 0,
      y: s.y | 0,
      z: s.z | 0,
      sectnum: s.sectnum | 0,
      xvect: xv,
      yvect: yv,
      walldist: 32,
      ceildist: 4 << 8,
      flordist: 4 << 8,
      cliptype: CLIPMASK1,
    });

    s.x = r.x | 0;
    s.y = r.y | 0;
    s.sectnum = r.sectnum | 0;

    // Hit player?
    const dx = ((s.x | 0) - (p.posx | 0)) | 0;
    const dy = ((s.y | 0) - (p.posy | 0)) | 0;
    const dz = ((s.z | 0) - (p.posz | 0)) | 0;
    if (
      klabs(dx) < 320 &&
      klabs(dy) < 320 &&
      klabs(dz) < (48 << 8)
    ) {
      hurtPlayer(p, s.extra > 0 ? s.extra : FIRELASER_WEAPON_STRENGTH);
      hideActor(s);
      continue;
    }

    // Hit wall / expired
    if ((r.hit | 0) !== 0 || (s.sectnum | 0) < 0) {
      hideActor(s);
      continue;
    }

    // Lifetime via shade countdown
    s.shade = ((s.shade | 0) + 1) | 0;
    if ((s.shade | 0) > 40) hideActor(s);
  }
}
