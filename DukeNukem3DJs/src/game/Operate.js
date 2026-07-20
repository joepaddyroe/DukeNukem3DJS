/**
 * SECTOR.C operatesectors + player USE (bit 29) subset — doors 20/21/22.
 */
import { neartag } from '../engine/NearTag.js';
import { nextsectorneighborz } from '../engine/NextSector.js';
import { setAnimation, getAnimationGoal } from './Animate.js';
import { BIT_OPEN } from './GetInput.js';

/**
 * SECTOR.C isanearoperator
 * @param {number} lotag
 */
export function isanearoperator(lotag) {
  switch (lotag & 0xff) {
    case 9:
    case 15:
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
    case 21:
    case 22:
    case 23:
    case 25:
    case 26:
    case 29:
      return 1;
    default:
      return 0;
  }
}

/**
 * SECTOR.C isanunderoperator
 * @param {number} lotag
 */
export function isanunderoperator(lotag) {
  switch (lotag & 0xff) {
    case 15:
    case 16:
    case 17:
    case 18:
    case 19:
    case 22:
    case 26:
      return 1;
    default:
      return 0;
  }
}

/**
 * Door speed from sector.extra (SECTOR.C setanimation thevel).
 * @param {import('../engine/Board.js').Sector} sptr
 */
function doorVel(sptr) {
  const v = sptr.extra | 0;
  return v !== 0 ? v : 128;
}

/**
 * SECTOR.C operatesectors — door / elevator subset.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
export function operateSectors(board, sn) {
  const sptr = board.sectors[sn];
  if (!sptr) return;
  const tag = sptr.lotag & (0xffff - 49152);
  const vel = doorVel(sptr);

  switch (tag & 0xff) {
    case 20: {
      // Ceiling door — SECTOR.C REDODOOR
      let j;
      if (sptr.lotag & 0x8000) {
        j = sptr.floorz | 0;
      } else {
        const ns = nextsectorneighborz(board, sn, sptr.ceilingz | 0, 0, -1);
        if (ns >= 0) {
          j = board.sectors[ns].ceilingz | 0;
        } else {
          sptr.lotag |= 32768;
          j = sptr.floorz | 0;
        }
      }
      sptr.lotag ^= 0x8000;
      setAnimation(board, sn, 'ceilingz', j, vel);
      return;
    }
    case 21: {
      let j;
      if (sptr.ceilingz === sptr.floorz) {
        const ns = nextsectorneighborz(board, sn, sptr.ceilingz | 0, 1, 1);
        j = ns >= 0 ? board.sectors[ns].floorz | 0 : sptr.floorz | 0;
      } else {
        j = sptr.ceilingz | 0;
      }
      sptr.lotag ^= 0x8000;
      setAnimation(board, sn, 'floorz', j, vel);
      return;
    }
    case 22: {
      if (sptr.lotag & 0x8000) {
        const q = ((sptr.ceilingz + sptr.floorz) >> 1) | 0;
        setAnimation(board, sn, 'floorz', q, vel);
        setAnimation(board, sn, 'ceilingz', q, vel);
      } else {
        let ns = nextsectorneighborz(board, sn, sptr.floorz | 0, 1, 1);
        let q = ns >= 0 ? board.sectors[ns].floorz | 0 : sptr.floorz | 0;
        setAnimation(board, sn, 'floorz', q, vel);
        ns = nextsectorneighborz(board, sn, sptr.ceilingz | 0, 0, -1);
        q = ns >= 0 ? board.sectors[ns].ceilingz | 0 : sptr.ceilingz | 0;
        setAnimation(board, sn, 'ceilingz', q, vel);
      }
      sptr.lotag ^= 0x8000;
      return;
    }
    case 16:
    case 17: {
      if (getAnimationGoal(board, sn, 'floorz') >= 0) return;
      let i = nextsectorneighborz(board, sn, sptr.floorz | 0, 1, 1);
      if (i < 0) i = nextsectorneighborz(board, sn, sptr.floorz | 0, 1, -1);
      if (i < 0) return;
      setAnimation(board, sn, 'floorz', board.sectors[i].floorz | 0, vel);
      return;
    }
    default:
      return;
  }
}

/**
 * Player USE (SECTOR.C after "space" / Open bit) — doors only subset.
 * @param {import('./Player.js').Player} p
 * @param {import('../engine/Board.js').Board} board
 * @param {import('../grp/ArtTiles.js').ArtTiles|null} art
 * @param {{ bits: number }} sync
 */
export function processUse(p, board, art, sync) {
  const open = (sync.bits & BIT_OPEN) !== 0;
  if (!open) {
    p.toggle_key_flag = 0;
    return;
  }
  if (p.toggle_key_flag) return;
  p.toggle_key_flag = 1;

  let hit = neartag({
    board,
    art,
    xs: p.posx,
    ys: p.posy,
    zs: p.posz,
    sectnum: p.cursectnum,
    ange: p.ang,
    neartagrange: 1280,
    tagsearch: 1,
  });

  if (hit.neartagsprite < 0 && hit.neartagwall < 0 && hit.neartagsector < 0) {
    hit = neartag({
      board,
      art,
      xs: p.posx,
      ys: p.posy,
      zs: (p.posz + (8 << 8)) | 0,
      sectnum: p.cursectnum,
      ange: p.ang,
      neartagrange: 1280,
      tagsearch: 1,
    });
  }
  if (hit.neartagsprite < 0 && hit.neartagwall < 0 && hit.neartagsector < 0) {
    hit = neartag({
      board,
      art,
      xs: p.posx,
      ys: p.posy,
      zs: (p.posz + (16 << 8)) | 0,
      sectnum: p.cursectnum,
      ange: p.ang,
      neartagrange: 1280,
      tagsearch: 1,
    });
  }

  let neartagsector = hit.neartagsector;

  if (neartagsector < 0 && hit.neartagsprite < 0 && hit.neartagwall < 0) {
    if (isanunderoperator(board.sectors[p.cursectnum]?.lotag ?? 0)) {
      neartagsector = p.cursectnum;
    }
  }

  if (neartagsector >= 0) {
    const sec = board.sectors[neartagsector];
    if (!sec) return;
    if (sec.lotag & 16384) return;
    if (isanearoperator(sec.lotag)) {
      operateSectors(board, neartagsector);
      p.lastUse = `sect=${neartagsector} lotag=${sec.lotag}`;
      return;
    }
  }

  if (isanunderoperator(board.sectors[p.cursectnum]?.lotag ?? 0)) {
    operateSectors(board, p.cursectnum);
    p.lastUse = `under=${p.cursectnum}`;
  }
}
