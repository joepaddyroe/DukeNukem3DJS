/**
 * ACTORS.C SEENINE / OOZFILTER + FANSPRITE break — E1L1 roof crash.
 * C refs: GAME.C spawn SEENINE/FANSPRITE; ACTORS.C SEENINE detonate; SECTOR.C checkhitsprite FAN.
 */
import {
  SECTOREFFECTOR,
  FANSPRITE,
  FANSPRITEBROKE,
  FANSHADOW,
  FANSHADOWBROKE,
  SEENINE,
  SEENINEDEAD,
  OOZFILTER,
  EXPLOSION2,
} from './Names.js';
import { ensureHitType } from './HitType.js';
import { klabs } from '../math/fixed.js';
import { insertSprite } from './Spawn.js';

/** USER.CON */
const SEENINEBLASTRADIUS = 2048;
const GENERICIMPACTDAMAGE = 10;

/**
 * GAME.C spawn setup for fans, seenines, and SE lotag 13.
 * @param {import('../engine/Board.js').Board} board
 */
export function initSeenines(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    const pic = sp.picnum & 0xffff;

    if (pic === FANSPRITE) {
      // GAME.C: clipdist + cstat |= 257 (block + hitscan)
      sp.clipdist = 32;
      sp.cstat = (sp.cstat | 257) | 0;
      continue;
    }

    if (pic === SEENINE || pic === OOZFILTER) {
      sp.shade = -16;
      if ((sp.xrepeat | 0) <= 8) {
        sp.cstat = 32768;
        sp.xrepeat = 0;
        sp.yrepeat = 0;
      } else {
        sp.cstat = 1 + 256;
      }
      sp.extra = GENERICIMPACTDAMAGE << 2;
      sp.owner = i;
      const ht = ensureHitType(i);
      ht.temp_data[3] = 0;
      continue;
    }

    if (pic === SECTOREFFECTOR && (sp.lotag & 0xff) === 13) {
      initSe13(board, i, sp);
    }
  }
}

/**
 * GAME.C spawn SE lotag 13 — collapse sector to SE z until detonated.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} i
 * @param {import('../engine/Board.js').Sprite} sp
 */
function initSe13(board, i, sp) {
  const sect = sp.sectnum | 0;
  const sec = board.sectors[sect];
  if (!sec) return;

  const ht = ensureHitType(i);
  const t = ht.temp_data;
  t[0] = sec.ceilingz | 0; // T1 restore ceiling
  t[1] = sec.floorz | 0; // T2 restore floor
  t[2] = 0;
  t[3] = 0;
  t[4] = 0;

  // GAME.C: sp->yvel = sector[sect].extra (GPSPEED)
  sp.yvel = sec.extra | 0;

  const dCeil = klabs((t[0] | 0) - (sp.z | 0));
  const dFlor = klabs((t[1] | 0) - (sp.z | 0));
  sp.owner = dCeil < dFlor ? 1 : 0;

  if ((sp.ang | 0) === 512) {
    if (sp.owner) sec.ceilingz = sp.z | 0;
    else sec.floorz = sp.z | 0;
  } else {
    sec.ceilingz = sp.z | 0;
    sec.floorz = sp.z | 0;
  }

  if (sec.ceilingstat & 1) {
    sec.ceilingstat ^= 1;
    t[3] = 1;
    if (!sp.owner && (sp.ang | 0) === 512) {
      sec.ceilingstat ^= 1;
      t[3] = 0;
    }
    sec.ceilingshade = sec.floorshade | 0;
  }

  sp.cstat = (sp.cstat | 32768) | 0;
  sp.xrepeat = 0;
  sp.yrepeat = 0;
}

/**
 * Per-tic SEENINE countdown / detonate + SE 13 open.
 * @param {import('../engine/Board.js').Board} board
 */
export function processSeenines(board) {
  if (!board) return;

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    const pic = s.picnum & 0xffff;
    if (
      pic !== OOZFILTER &&
      pic !== SEENINE &&
      pic !== SEENINEDEAD &&
      pic !== SEENINEDEAD + 1
    ) {
      continue;
    }
    if ((s.xrepeat | 0) === 0 && (s.shade | 0) !== -32 && (s.shade | 0) !== -33) {
      continue;
    }

    const ht = ensureHitType(i);
    const t = ht.temp_data;
    const shade = s.shade | 0;

    if (shade !== -32 && shade !== -33) {
      if (shade === -31) {
        // Master-switch style auto-arm
        armSeenineChain(board, s);
        t[3] = 1;
      }
      continue;
    }

    if (shade === -32) {
      if ((s.lotag | 0) > 0) {
        s.lotag = (s.lotag | 0) - 3;
        if ((s.lotag | 0) <= 0) s.lotag = -99;
      } else {
        s.shade = -33;
      }
      continue;
    }

    // shade === -33 — death anim then detonate
    if ((s.xrepeat | 0) > 0) {
      t[2] = (t[2] | 0) + 1;
      if ((t[2] | 0) === 3) {
        t[2] = 0;
        if (pic === OOZFILTER) {
          detonateSeenine(board, i, s, t);
          continue;
        }
        if (pic !== SEENINEDEAD + 1) {
          if (pic === SEENINEDEAD) s.picnum = SEENINEDEAD + 1;
          else if (pic === SEENINE) s.picnum = SEENINEDEAD;
        } else {
          detonateSeenine(board, i, s, t);
        }
      }
    } else {
      detonateSeenine(board, i, s, t);
    }
  }

  moveSe13(board);
  tickExplosions(board);
}

/**
 * Shrink transient EXPLOSION2 sprites.
 * @param {import('../engine/Board.js').Board} board
 */
function tickExplosions(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== EXPLOSION2) continue;
    if ((s.xrepeat | 0) === 0) continue;
    const life = (s.extra | 0) - 1;
    s.extra = life;
    if (life <= 0) {
      s.xrepeat = 0;
      s.yrepeat = 0;
      s.cstat = 32768;
    }
  }
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../engine/Board.js').Sprite} s
 */
function armSeenineChain(board, s) {
  const hitag = s.hitag | 0;
  for (let j = 0; j < board.numsprites; j++) {
    const o = board.sprites[j];
    const op = o.picnum & 0xffff;
    if ((o.hitag | 0) !== hitag) continue;
    if (op !== SEENINE && op !== OOZFILTER) continue;
    o.shade = -32;
  }
}

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {number} i
 * @param {import('../engine/Board.js').Sprite} s
 * @param {number[]} t
 */
function detonateSeenine(board, i, s, t) {
  const hitag = s.hitag | 0;

  // Activate SE 13 / related effectors with matching hitag
  for (let j = 0; j < board.numsprites; j++) {
    const o = board.sprites[j];
    if ((o.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((o.hitag | 0) !== hitag) continue;
    const lotag = o.lotag & 0xff;
    const ot = ensureHitType(j).temp_data;
    if (lotag === 13 && (ot[2] | 0) === 0) ot[2] = 1;
    else if (lotag === 8) ot[4] = 1;
    else if (lotag === 18 && (ot[0] | 0) === 0) ot[0] = 1;
    else if (lotag === 21) ot[0] = 1;
  }

  s.z = ((s.z | 0) - (32 << 8)) | 0;

  if (((t[3] | 0) === 1 && (s.xrepeat | 0)) || (s.lotag | 0) === -99) {
    const blast = insertSprite(board, {
      x: s.x,
      y: s.y,
      z: s.z,
      sectnum: s.sectnum,
      picnum: EXPLOSION2,
      shade: -127,
      xrepeat: 64,
      yrepeat: 64,
      cstat: 0,
      statnum: 5,
    });
    if (blast >= 0) {
      // brief visual — cleared by life if Weapons fx, else shrink next frames
      board.sprites[blast].extra = 12;
    }
    hitradiusBreak(board, s.x | 0, s.y | 0, s.z | 0, SEENINEBLASTRADIUS);
  }

  s.xrepeat = 0;
  s.yrepeat = 0;
  s.cstat = 32768;
  s.picnum = SEENINEDEAD + 1;
  s.shade = 0;
}

/**
 * Simplified hitradius — break fans (and arm other seenines) in range.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} r
 */
function hitradiusBreak(board, x, y, z, r) {
  for (let j = 0; j < board.numsprites; j++) {
    const sj = board.sprites[j];
    if ((sj.xrepeat | 0) === 0) continue;
    const dx = klabs((sj.x | 0) - x);
    const dy = klabs((sj.y | 0) - y);
    if (dx + dy >= r) continue;

    const pic = sj.picnum & 0xffff;
    if (pic === FANSPRITE) {
      breakFan(board, j);
    } else if (pic === SEENINE || pic === OOZFILTER) {
      if ((sj.shade | 0) !== -32 && (sj.shade | 0) !== -33) {
        sj.shade = -32;
      }
    }
  }
}

/**
 * SECTOR.C checkhitsprite FANSPRITE.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} i
 */
export function breakFan(board, i) {
  const s = board.sprites[i];
  if (!s || (s.picnum & 0xffff) !== FANSPRITE) return;
  s.picnum = FANSPRITEBROKE;
  s.cstat = (s.cstat & (65535 - 257)) | 0;
  const sec = board.sectors[s.sectnum];
  if (sec && (sec.floorpicnum & 0xffff) === FANSHADOW) {
    sec.floorpicnum = FANSHADOWBROKE;
  }
}

/**
 * Bullet / blast hit on sprite (SECTOR.C checkhitsprite subset).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} hitsprite
 * @returns {boolean} handled
 */
export function checkHitSprite(board, hitsprite) {
  if (hitsprite < 0) return false;
  const s = board.sprites[hitsprite];
  if (!s || (s.xrepeat | 0) === 0) return false;
  const pic = s.picnum & 0xffff;

  if (pic === FANSPRITE) {
    breakFan(board, hitsprite);
    return true;
  }

  if (pic === SEENINE || pic === OOZFILTER) {
    if ((s.shade | 0) !== -32 && (s.shade | 0) !== -33) {
      s.lotag = 0;
      ensureHitType(hitsprite).temp_data[3] = 1;
      armSeenineChain(board, s);
      // solo (hitag 0): arm self
      if ((s.hitag | 0) === 0) s.shade = -32;
    }
    return true;
  }

  return false;
}

/**
 * ACTORS.C SE lotag 13 move — reopen collapsed sector.
 * @param {import('../engine/Board.js').Board} board
 */
function moveSe13(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 13) continue;

    const ht = ensureHitType(i);
    const t = ht.temp_data;
    if (!(t[2] | 0)) continue;

    const sec = board.sectors[s.sectnum];
    if (!sec) continue;

    const speed = (s.yvel | 0) !== 0 ? (s.yvel | 0) : 256;
    const step = ((speed << 5) | 1) | 0;
    const sgn = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

    if ((s.ang | 0) === 512) {
      if (s.owner) {
        if (klabs((t[0] | 0) - (sec.ceilingz | 0)) >= step) {
          sec.ceilingz =
            ((sec.ceilingz | 0) + sgn((t[0] | 0) - (sec.ceilingz | 0)) * step) | 0;
        } else sec.ceilingz = t[0] | 0;
      } else if (klabs((t[1] | 0) - (sec.floorz | 0)) >= step) {
        sec.floorz =
          ((sec.floorz | 0) + sgn((t[1] | 0) - (sec.floorz | 0)) * step) | 0;
      } else sec.floorz = t[1] | 0;
    } else {
      if (klabs((t[1] | 0) - (sec.floorz | 0)) >= step) {
        sec.floorz =
          ((sec.floorz | 0) + sgn((t[1] | 0) - (sec.floorz | 0)) * step) | 0;
      } else sec.floorz = t[1] | 0;
      if (klabs((t[0] | 0) - (sec.ceilingz | 0)) >= step) {
        sec.ceilingz =
          ((sec.ceilingz | 0) + sgn((t[0] | 0) - (sec.ceilingz | 0)) * step) | 0;
      } else sec.ceilingz = t[0] | 0;
    }

    if ((t[3] | 0) === 1) {
      t[3] = 2;
      sec.ceilingstat ^= 1;
    }

    t[2] = (t[2] | 0) + 1;
    if ((t[2] | 0) > 256) {
      s.xrepeat = 0;
      s.yrepeat = 0;
      t[2] = 0;
    }
  }
}
