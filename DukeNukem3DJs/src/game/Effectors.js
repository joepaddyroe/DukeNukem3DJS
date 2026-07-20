/**
 * Sector effectors — SECTOR.C operate + ACTORS.C move for SE 11 / 15 / 20.
 * (Swing doors, subway slides, extend-o-bridges.)
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
import { buildTables } from '../math/BuildTables.js';
import { nsqrtasm } from '../math/fixed.js';
import { applyPremapExtras } from './Premap.js';

/**
 * @param {number} dx
 * @param {number} dy
 */
function findDistance2D(dx, dy) {
  return nsqrtasm(Math.imul(dx | 0, dx | 0) + Math.imul(dy | 0, dy | 0));
}

/**
 * Init all supported SECTOREFFECTORs after map load.
 * @param {import('../engine/Board.js').Board} board
 */
export function initEffectors(board) {
  applyPremapExtras(board);
  clearHitTypes(board.numsprites);
  setTempWallPtr(0);

  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    const lotag = sp.lotag & 0xff;
    if (lotag !== 11 && lotag !== 15 && lotag !== 20) continue;

    const sect = sp.sectnum | 0;
    const sec = board.sectors[sect];
    if (!sec) continue;

    // GAME.C: sp->yvel = sector[sect].extra
    sp.yvel = sec.extra | 0;
    sp.cstat |= 32768;
    sp.xrepeat = 0;
    sp.yrepeat = 0;

    const ht = ensureHitType(i);
    const t = ht.temp_data;
    t[0] = 0;
    t[1] = 0;
    t[2] = 0;
    t[3] = 0;
    t[4] = 0;
    t[5] = 0;

    if (lotag === 11) {
      t[3] = (sp.ang | 0) > 1024 ? 2 : -2;
      let tw = getTempWallPtr();
      t[1] = tw;
      const startwall = sec.wallptr | 0;
      const endwall = startwall + (sec.wallnum | 0);
      for (let s = startwall; s < endwall; s++) {
        if (tw >= MAX_MS) break;
        msx[tw] = ((board.walls[s].x | 0) - (sp.x | 0)) | 0;
        msy[tw] = ((board.walls[s].y | 0) - (sp.y | 0)) | 0;
        tw++;
      }
      setTempWallPtr(tw);
    } else if (lotag === 15) {
      let tw = getTempWallPtr();
      t[1] = tw;
      const startwall = sec.wallptr | 0;
      const endwall = startwall + (sec.wallnum | 0);
      for (let s = startwall; s < endwall; s++) {
        if (tw >= MAX_MS) break;
        msx[tw] = ((board.walls[s].x | 0) - (sp.x | 0)) | 0;
        msy[tw] = ((board.walls[s].y | 0) - (sp.y | 0)) | 0;
        tw++;
      }
      setTempWallPtr(tw);
    } else if (lotag === 20) {
      // Two closest wall points → T2 / T3
      const startwall = sec.wallptr | 0;
      const endwall = startwall + (sec.wallnum | 0);
      let q = 0x7fffffff;
      let closest = startwall;
      for (let s = startwall; s < endwall; s++) {
        const d = findDistance2D(
          (sp.x - board.walls[s].x) | 0,
          (sp.y - board.walls[s].y) | 0,
        );
        if (d < q) {
          q = d;
          closest = s;
        }
      }
      t[1] = closest;
      q = 0x7fffffff;
      for (let s = startwall; s < endwall; s++) {
        if (s === (t[1] | 0)) continue;
        const d = findDistance2D(
          (sp.x - board.walls[s].x) | 0,
          (sp.y - board.walls[s].y) | 0,
        );
        if (d < q) {
          q = d;
          closest = s;
        }
      }
      t[2] = closest;
    }
  }
}

/** @deprecated use initEffectors */
export const initSwingDoors = initEffectors;

/**
 * ACTORS.C ms() — translate effector + rotate sector walls.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} i
 */
function ms(board, i) {
  const s = board.sprites[i];
  if (!s) return;
  const ht = ensureHitType(i);
  const t = ht.temp_data;

  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;
  const xv = s.xvel | 0;
  if (xv) {
    s.x =
      (s.x + ((xv * (st[(s.ang + 512) & 2047] | 0)) >> 14)) | 0;
    s.y = (s.y + ((xv * (st[s.ang & 2047] | 0)) >> 14)) | 0;
  }

  let j = t[1] | 0;
  const k = t[2] | 0;
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
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player|null} [player]
 */
export function moveEffectors(board, player = null) {
  if (!buildTables.loaded) buildTables.generateFallback();
  const st = buildTables.sintable;

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    const lotag = s.lotag & 0xff;
    const t = ensureHitType(i).temp_data;
    const SP = s.yvel | 0;

    if (lotag === 11) {
      if ((t[5] | 0) > 0) {
        t[5]--;
        continue;
      }
      if (!(t[4] | 0)) continue;
      const k = ((SP >> 3) * (t[3] | 0)) | 0;
      t[2] = (t[2] + k) | 0;
      t[4] = (t[4] + k) | 0;
      ms(board, i);
      if ((t[4] | 0) <= -511 || (t[4] | 0) >= 512) {
        t[4] = 0;
        t[2] &= 0xffffff00;
        ms(board, i);
      }
    } else if (lotag === 15) {
      if (!(t[4] | 0)) continue;
      s.xvel = 16;
      if ((t[4] | 0) === 1) {
        if ((t[3] | 0) >= (SP >> 3)) {
          t[4] = 0;
          s.xvel = 0;
          continue;
        }
        t[3]++;
      } else if ((t[4] | 0) === 2) {
        if ((t[3] | 0) < 1) {
          t[4] = 0;
          s.xvel = 0;
          continue;
        }
        t[3]--;
      }
      ms(board, i);
    } else if (lotag === 20) {
      if (!(t[0] | 0)) continue;
      s.xvel = (t[0] | 0) === 1 ? 8 : -8;
      const xv = s.xvel | 0;
      if (!xv) continue;

      const x = ((xv * (st[(s.ang + 512) & 2047] | 0)) >> 14) | 0;
      const l = ((xv * (st[s.ang & 2047] | 0)) >> 14) | 0;
      t[3] = (t[3] + xv) | 0;

      s.x = (s.x + x) | 0;
      s.y = (s.y + l) | 0;

      if ((t[3] | 0) <= 0 || ((t[3] | 0) >> 6) >= (SP >> 6)) {
        s.x = (s.x - x) | 0;
        s.y = (s.y - l) | 0;
        t[0] = 0;
        s.xvel = 0;
        continue;
      }

      dragpoint(board, t[1] | 0, (board.walls[t[1]].x + x) | 0, (board.walls[t[1]].y + l) | 0);
      dragpoint(board, t[2] | 0, (board.walls[t[2]].x + x) | 0, (board.walls[t[2]].y + l) | 0);

      const sec = board.sectors[s.sectnum];
      if (sec) {
        sec.floorxpanning = ((sec.floorxpanning | 0) - (x >> 3)) & 255;
        sec.floorypanning = ((sec.floorypanning | 0) - (l >> 3)) & 255;
        sec.ceilingxpanning = ((sec.ceilingxpanning | 0) - (x >> 3)) & 255;
        sec.ceilingypanning = ((sec.ceilingypanning | 0) - (l >> 3)) & 255;
      }

      if (
        player &&
        (player.cursectnum | 0) === (s.sectnum | 0) &&
        player.on_ground
      ) {
        player.posx = (player.posx + x) | 0;
        player.posy = (player.posy + l) | 0;
        player.bobposx = player.posx;
        player.bobposy = player.posy;
      }
    }
  }
}

/** @deprecated use moveEffectors */
export function moveSwingDoors(board, player = null) {
  moveEffectors(board, player);
}

/**
 * SECTOR.C case 23 — swing door.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
export function operateSwingDoor(board, sn) {
  let j = -1;

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 11) continue;
    if ((s.sectnum | 0) !== (sn | 0)) continue;
    if (!(ensureHitType(i).temp_data[4] | 0)) {
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
    if (!sec || (sec.lotag & 0x8000) !== l) continue;
    const t = ensureHitType(i).temp_data;
    if (t[4] | 0) continue;
    if (sec.lotag & 0x8000) sec.lotag &= 0x7fff;
    else sec.lotag |= 0x8000;
    t[4] = 1;
    t[3] = (-(t[3] | 0)) | 0;
  }
}

/**
 * SECTOR.C case 25 — subway slide.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
export function operateSubwayDoor(board, sn) {
  let j = -1;
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag | 0) !== 15) continue;
    if ((s.sectnum | 0) !== (sn | 0)) continue;
    j = i;
    break;
  }
  if (j < 0) return;

  const jHitag = board.sprites[j].hitag | 0;
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.hitag | 0) !== jHitag) continue;
    if ((s.lotag & 0xff) !== 15) continue;

    const sec = board.sectors[s.sectnum];
    if (!sec) continue;
    sec.lotag ^= 0x8000;
    s.ang = ((s.ang | 0) + 1024) & 2047;
    const t = ensureHitType(i).temp_data;
    t[4] = sec.lotag & 0x8000 ? 1 : 2;
  }
}

/**
 * SECTOR.C case 27 — extend-o-bridge.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
export function operateBridge(board, sn) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 20) continue;
    if ((s.sectnum | 0) !== (sn | 0)) continue;

    const sec = board.sectors[sn];
    if (!sec) return;
    sec.lotag ^= 0x8000;
    ensureHitType(i).temp_data[0] = sec.lotag & 0x8000 ? 1 : 2;
    return;
  }
}

/**
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
