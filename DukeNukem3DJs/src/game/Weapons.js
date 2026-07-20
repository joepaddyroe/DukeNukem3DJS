/**
 * PLAYER.C pistol weapon subset — kickback, shoot(SHOTSPARK1), bullethole.
 */
import { hitscan, CLIPMASK1 } from '../engine/Hitscan.js';
import { getangle } from '../engine/ClipMove.js';
import { buildTables } from '../math/BuildTables.js';
import { insertSprite } from './Spawn.js';
import { BIT_FIRE } from './GetInput.js';

export const PISTOL_WEAPON = 1;
export const FIRSTGUN = 2524;
export const BULLETHOLE = 952;
export const SHOTSPARK1 = 2595;

/** @type {number[]} */
const PISTOL_KB_FRAMES = [0, 1, 2, 0, 0];

/**
 * @param {import('./Player.js').Player} p
 */
export function initPistol(p) {
  p.curr_weapon = PISTOL_WEAPON;
  p.kickback_pic = 0;
  p.weapon_pos = 0;
  p.ammo_amount = p.ammo_amount || [];
  for (let i = 0; i < 12; i++) {
    if (p.ammo_amount[i] == null) p.ammo_amount[i] = 0;
  }
  p.ammo_amount[PISTOL_WEAPON] = 200;
  p.gotweapon = p.gotweapon || [];
  p.gotweapon[PISTOL_WEAPON] = 1;
  /** @type {{ index: number, life: number }[]} */
  p.fxSprites = p.fxSprites || [];
  p.lastHit = null;
}

/**
 * Advance pistol kickback + fire (PLAYER.C SHOOTINCODE / PISTOL_WEAPON).
 * @param {import('./Player.js').Player} p
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {{ bits: number }} sync
 */
export function processWeapon(p, board, art, sync) {
  const sb = sync.bits | 0;
  const kb = () => p.kickback_pic | 0;
  const setKb = (v) => {
    p.kickback_pic = v | 0;
  };

  // Start fire
  if ((sb & BIT_FIRE) && kb() === 0 && p.weapon_pos === 0) {
    if (p.ammo_amount[PISTOL_WEAPON] > 0) {
      p.ammo_amount[PISTOL_WEAPON]--;
      setKb(1);
    }
  }

  if (p.curr_weapon !== PISTOL_WEAPON || kb() === 0) {
    tickFx(p, board);
    return;
  }

  if (kb() === 1) {
    shootPistol(p, board, art);
  }

  setKb(kb() + 1);

  if (kb() >= 5) {
    if (
      p.ammo_amount[PISTOL_WEAPON] <= 0 ||
      p.ammo_amount[PISTOL_WEAPON] % 12
    ) {
      setKb(0);
    }
    // else keep climbing through reload frames
  }

  if (kb() >= 27) setKb(0);

  tickFx(p, board);
}

/**
 * PLAYER.C shoot(SHOTSPARK1) player path subset.
 * @param {import('./Player.js').Player} p
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 */
function shootPistol(p, board, art) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;

  const sx = p.posx | 0;
  const sy = p.posy | 0;
  let sz = (p.posz + (4 << 8)) | 0;
  let sa = p.ang | 0;

  // Spread (PLAYER.C SHOTSPARK1)
  sa = (sa + 16 - ((Math.random() * 32) | 0)) & 2047;
  let zvel = ((100 - p.horiz) << 5) | 0;
  zvel += 128 - ((Math.random() * 256) | 0);
  sz -= 2 << 8;

  const hit = hitscan({
    board,
    art,
    xs: sx,
    ys: sy,
    zs: sz,
    sectnum: p.cursectnum,
    vx: st[(sa + 512) & 2047],
    vy: st[sa & 2047],
    vz: zvel << 6,
    cliptype: CLIPMASK1,
  });

  p.lastHit = hit;
  if (hit.hitsect < 0) return;

  // Spark at impact
  const spark = insertSprite(board, {
    x: hit.hitx,
    y: hit.hity,
    z: hit.hitz,
    sectnum: hit.hitsect,
    picnum: SHOTSPARK1,
    shade: -15,
    xrepeat: 10,
    yrepeat: 10,
    ang: sa,
    cstat: 0,
    statnum: 4,
  });
  if (spark >= 0) {
    p.fxSprites.push({ index: spark, life: 8 });
  }

  if (hit.hitsprite >= 0) {
    const spr = board.sprites[hit.hitsprite];
    if (spr && spr.extra > 0) spr.extra -= 6;
    spr.shade = -32;
    return;
  }

  if (hit.hitwall >= 0) {
    const wal = board.walls[hit.hitwall];
    if (!wal) return;
    if (wal.cstat & 16) return;
    if (wal.hitag !== 0) return;
    const sec = board.sectors[hit.hitsect];
    if (!sec || sec.lotag !== 0) return;

    const ang =
      getangle(
        (wal.x - board.walls[wal.point2].x) | 0,
        (wal.y - board.walls[wal.point2].y) | 0,
      ) + 512;

    insertSprite(board, {
      x: hit.hitx,
      y: hit.hity,
      z: hit.hitz,
      sectnum: hit.hitsect,
      picnum: BULLETHOLE,
      shade: 0,
      xrepeat: 8,
      yrepeat: 8,
      ang: ang & 2047,
      cstat: 16, // wall-aligned
      statnum: 5,
      xvel: -1,
    });
  }
}

/**
 * @param {import('./Player.js').Player} p
 * @param {import('../engine/Board.js').Board} board
 */
function tickFx(p, board) {
  const list = p.fxSprites;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].life--;
    if (list[i].life <= 0) {
      const spr = board.sprites[list[i].index];
      if (spr) {
        spr.xrepeat = 0;
        spr.yrepeat = 0;
      }
      list.splice(i, 1);
    }
  }
}

/**
 * PLAYER.C displayweapon gun_pos (ready pose + sway + hard landing).
 * @param {import('./Player.js').Player} p
 */
function displayGunPos(p) {
  const wp = p.weapon_pos | 0;
  let gunPos = 80 - wp * wp;
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;
  const sway = (p.weapon_sway ?? 1024) | 0;
  // Normal-size Duke: gun_pos -= klabs(sintable[(weapon_sway>>1)&2047]>>10)
  const bob = st[(sway >> 1) & 2047] | 0;
  gunPos -= (bob < 0 ? -bob : bob) >> 10;
  gunPos -= (p.hard_landing | 0) << 3;
  return gunPos;
}

/**
 * PLAYER.C displayweapon weapon_xoffset (horizontal sway).
 * @param {import('./Player.js').Player} p
 */
function displayWeaponXOffset(p) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;
  const sway = (p.weapon_sway ?? 1024) | 0;
  let ox = 160 - 90;
  ox -= ((st[((sway >> 1) + 512) & 2047] | 0) / (1024 + 512)) | 0;
  ox -= 58 + (p.weapon_ang | 0);
  return ox;
}

/**
 * Pistol tile for HUD (PLAYER.C displayweapons PISTOL_WEAPON frames).
 * @param {import('./Player.js').Player} p
 * @returns {{ pic: number, x: number, y: number }[]}
 */
export function pistolHudTiles(p) {
  const kb = p.kickback_pic | 0;
  const gunPos = displayGunPos(p);
  const weaponXOffset = displayWeaponXOffset(p);
  const lookingArc = ((p.look_ang | 0) < 0 ? -(p.look_ang | 0) : (p.look_ang | 0)) / 9 | 0;
  const look = (p.look_ang | 0) >> 1;
  /** @type {{ pic: number, x: number, y: number }[]} */
  const out = [];

  if (kb < 5) {
    const frame = PISTOL_KB_FRAMES[kb] ?? 0;
    let l = 195 - 12 + weaponXOffset;
    if (kb === 2) l -= 3;
    out.push({
      pic: FIRSTGUN + frame,
      x: l - look,
      y: lookingArc + 244 - gunPos,
    });
  } else if (kb < 10) {
    out.push({
      pic: FIRSTGUN + 4,
      x: 194 - look,
      y: lookingArc + 230 - gunPos,
    });
  } else if (kb < 15) {
    out.push({
      pic: FIRSTGUN + 6,
      x: 244 - (kb << 3) - look,
      y: lookingArc + 130 - gunPos + (kb << 4),
    });
    out.push({
      pic: FIRSTGUN + 5,
      x: 224 - look,
      y: lookingArc + 220 - gunPos,
    });
  } else if (kb < 20) {
    out.push({
      pic: FIRSTGUN + 6,
      x: 124 + (kb << 1) - look,
      y: lookingArc + 430 - gunPos - (kb << 3),
    });
    out.push({
      pic: FIRSTGUN + 5,
      x: 224 - look,
      y: lookingArc + 220 - gunPos,
    });
  } else if (kb < 23) {
    out.push({
      pic: FIRSTGUN + 8,
      x: 184 - look,
      y: lookingArc + 235 - gunPos,
    });
    out.push({
      pic: FIRSTGUN + 5,
      x: 224 - look,
      y: lookingArc + 210 - gunPos,
    });
  } else if (kb < 25) {
    out.push({
      pic: FIRSTGUN + 8,
      x: 164 - look,
      y: lookingArc + 245 - gunPos,
    });
    out.push({
      pic: FIRSTGUN + 5,
      x: 224 - look,
      y: lookingArc + 220 - gunPos,
    });
  } else if (kb < 27) {
    out.push({
      pic: FIRSTGUN + 5,
      x: 194 - look,
      y: lookingArc + 235 - gunPos,
    });
  } else {
    out.push({
      pic: FIRSTGUN,
      x: 183 - look,
      y: lookingArc + 244 - gunPos,
    });
  }

  return out;
}
