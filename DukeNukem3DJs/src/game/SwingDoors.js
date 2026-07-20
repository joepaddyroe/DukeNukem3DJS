/**
 * Swing doors — SECTOR.C case 23 + ACTORS.C SE lotag 11 + GAME.C spawn init.
 */
import { SECTOREFFECTOR } from './Names.js';
import {
  clearHitTypes,
  ensureHitType,
  getTempWallPtr,
  setTempWallPtr,
  msx,
  msy,
  MAX_MS,
} from './HitType.js';
import { dragpoint, rotatepoint } from '../engine/WallGeom.js';

/**
 * GAME.C spawn SECTOREFFECTOR lotag 11 subset + yvel = sector.extra.
 * @param {import('../engine/Board.js').Board} board
 */
export function initSwingDoors(board) {
  clearHitTypes(board.numsprites);
  setTempWallPtr(0);

  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((sp.lotag & 0xff) !== 11) continue;

    const sect = sp.sectnum | 0;
    const sec = board.sectors[sect];
    if (!sec) continue;

    // GAME.C: sp->yvel = sector[sect].extra
    sp.yvel = sec.extra | 0;

    const ht = ensureHitType(i);
    const t = ht.temp_data;
    // ang > 1024 → T4 = 2 else -2
    t[3] = (sp.ang | 0) > 1024 ? 2 : -2;
    t[0] = 0;
    t[2] = 0;
    t[4] = 0;
    t[5] = 0;

    let tw = getTempWallPtr();
    t[1] = tw; // T2 = start index into msx/msy
    const startwall = sec.wallptr | 0;
    const endwall = startwall + (sec.wallnum | 0);
    for (let s = startwall; s < endwall; s++) {
      if (tw >= MAX_MS) break;
      msx[tw] = ((board.walls[s].x | 0) - (sp.x | 0)) | 0;
      msy[tw] = ((board.walls[s].y | 0) - (sp.y | 0)) | 0;
      tw++;
    }
    setTempWallPtr(tw);
  }
}

/**
 * ACTORS.C ms() — rotate sector walls around effector.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} i sprite index
 */
function ms(board, i) {
  const s = board.sprites[i];
  if (!s) return;
  const ht = ensureHitType(i);
  const t = ht.temp_data;
  // xvel translation (usually 0 for swing doors)
  // skipped — needs sintable; SE11 keeps xvel 0

  let j = t[1] | 0; // T2
  const k = t[2] | 0; // T3 angle
  const sec = board.sectors[s.sectnum];
  if (!sec) return;
  const startwall = sec.wallptr | 0;
  const endwall = startwall + (sec.wallnum | 0);
  for (let x = startwall; x < endwall; x++) {
    const rp = rotatepoint(0, 0, msx[j], msy[j], k & 2047);
    dragpoint(board, x, (s.x | 0) + rp.x, (s.y | 0) + rp.y);
    j++;
  }
}

/**
 * ACTORS.C moveeffectors case 11 — advance swinging doors.
 * @param {import('../engine/Board.js').Board} board
 */
export function moveSwingDoors(board) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 11) continue;

    const ht = ensureHitType(i);
    const t = ht.temp_data;

    if ((t[5] | 0) > 0) {
      t[5]--;
      continue;
    }

    if (!(t[4] | 0)) continue; // T5 == 0 → idle

    const SP = s.yvel | 0;
    const k = ((SP >> 3) * (t[3] | 0)) | 0;
    t[2] = (t[2] + k) | 0;
    t[4] = (t[4] + k) | 0;
    ms(board, i);

    if ((t[4] | 0) <= -511 || (t[4] | 0) >= 512) {
      t[4] = 0;
      t[2] &= 0xffffff00;
      ms(board, i);
    }
  }
}

/**
 * SECTOR.C operatesectors case 23.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
export function operateSwingDoor(board, sn) {
  let j = -1;
  let q = 0;

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 11) continue;
    if ((s.sectnum | 0) !== (sn | 0)) continue;
    const t5 = ensureHitType(i).temp_data[4] | 0;
    if (!t5) {
      j = i;
      break;
    }
  }

  if (j < 0) return;

  const l = board.sectors[board.sprites[j].sectnum].lotag & 0x8000;
  const jHitag = board.sprites[j].hitag | 0;

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 11) continue;
    if ((s.hitag | 0) !== jHitag) continue;

    const sec = board.sectors[s.sectnum];
    if (!sec) continue;
    if ((sec.lotag & 0x8000) !== l) continue;

    const t = ensureHitType(i).temp_data;
    if (t[4] | 0) continue; // already moving

    if (sec.lotag & 0x8000) sec.lotag &= 0x7fff;
    else sec.lotag |= 0x8000;

    t[4] = 1;
    t[3] = (-(t[3] | 0)) | 0;
    q = 1;
  }

  return q;
}

/**
 * True if any SE11 with this hitag/lotag is mid-swing (check_activator_motion).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sectnum
 */
export function swingDoorBusy(board, sectnum) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 11) continue;
    if ((s.sectnum | 0) !== (sectnum | 0)) continue;
    if (ensureHitType(i).temp_data[4] | 0) return true;
  }
  return false;
}
