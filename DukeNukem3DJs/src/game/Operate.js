/**
 * SECTOR.C operatesectors + player USE (bit 29) — doors + switches.
 */
import { neartag } from '../engine/NearTag.js';
import { nextsectorneighborz } from '../engine/NextSector.js';
import { setAnimation, setWallAnimation, getAnimationGoal } from './Animate.js';
import { checkHitSwitch, ACTIVATOR, MASTERSWITCH } from './Switches.js';
import { operateSwingDoor, swingDoorBusy } from './SwingDoors.js';
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
 * True if sector has ACTIVATOR / MASTERSWITCH (must use switch, not USE).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
function sectorHasActivator(board, sn) {
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.sectnum | 0) !== (sn | 0)) continue;
    const pn = s.picnum & 0xffff;
    if (pn === ACTIVATOR || pn === MASTERSWITCH) return true;
  }
  return false;
}

/**
 * SECTOR.C operatesectors case 9 — sliding door (wall point anim).
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
function operateSlideDoor(board, sn) {
  const sptr = board.sectors[sn];
  if (!sptr) return;
  const startwall = sptr.wallptr | 0;
  const endwall = startwall + (sptr.wallnum | 0) - 1;
  const sp = (sptr.extra | 0) >> 4;

  let dax = 0;
  let day = 0;
  const count = endwall - startwall + 1;
  if (count <= 0) return;
  for (let i = startwall; i <= endwall; i++) {
    dax += board.walls[i].x | 0;
    day += board.walls[i].y | 0;
  }
  dax = (dax / count) | 0;
  day = (day / count) | 0;

  /** @type {number[]} */
  const wallfind = [-1, -1];
  for (let i = startwall; i <= endwall; i++) {
    const w = board.walls[i];
    if ((w.x | 0) === dax || (w.y | 0) === day) {
      if (wallfind[0] < 0) wallfind[0] = i;
      else wallfind[1] = i;
    }
  }
  if (wallfind[0] < 0 || wallfind[1] < 0) return;

  for (let j = 0; j < 2; j++) {
    const wf = wallfind[j];
    const wal = board.walls[wf];
    let i = wf - 1;
    if (i < startwall) i = endwall;
    const p2 = wal.point2 | 0;

    if ((wal.x | 0) === dax && (wal.y | 0) === day) {
      let dax2 =
        ((((board.walls[i].x | 0) + (board.walls[p2].x | 0)) >> 1) - (wal.x | 0)) | 0;
      let day2 =
        ((((board.walls[i].y | 0) + (board.walls[p2].y | 0)) >> 1) - (wal.y | 0)) | 0;
      if (dax2 !== 0) {
        dax2 =
          ((board.walls[board.walls[p2].point2].x | 0) - (board.walls[p2].x | 0)) | 0;
        setWallAnimation(board, sn, wf, 'x', (wal.x | 0) + dax2, sp);
        setWallAnimation(board, sn, i, 'x', (board.walls[i].x | 0) + dax2, sp);
        setWallAnimation(board, sn, p2, 'x', (board.walls[p2].x | 0) + dax2, sp);
      } else if (day2 !== 0) {
        day2 =
          ((board.walls[board.walls[p2].point2].y | 0) - (board.walls[p2].y | 0)) | 0;
        setWallAnimation(board, sn, wf, 'y', (wal.y | 0) + day2, sp);
        setWallAnimation(board, sn, i, 'y', (board.walls[i].y | 0) + day2, sp);
        setWallAnimation(board, sn, p2, 'y', (board.walls[p2].y | 0) + day2, sp);
      }
    } else {
      const dax2 =
        ((((board.walls[i].x | 0) + (board.walls[p2].x | 0)) >> 1) - (wal.x | 0)) | 0;
      const day2 =
        ((((board.walls[i].y | 0) + (board.walls[p2].y | 0)) >> 1) - (wal.y | 0)) | 0;
      if (dax2 !== 0) {
        setWallAnimation(board, sn, wf, 'x', dax, sp);
        setWallAnimation(board, sn, i, 'x', dax + dax2, sp);
        setWallAnimation(board, sn, p2, 'x', dax + dax2, sp);
      } else if (day2 !== 0) {
        setWallAnimation(board, sn, wf, 'y', day, sp);
        setWallAnimation(board, sn, i, 'y', day + day2, sp);
        setWallAnimation(board, sn, p2, 'y', day + day2, sp);
      }
    }
  }
}

/**
 * SECTOR.C operatesectors — door / elevator / slide subset.
 * @param {import('../engine/Board.js').Board} board
 * @param {number} sn
 */
export function operateSectors(board, sn) {
  const sptr = board.sectors[sn];
  if (!sptr) return;
  const tag = sptr.lotag & (0xffff - 49152);
  const vel = doorVel(sptr);

  switch (tag & 0xff) {
    case 9:
      operateSlideDoor(board, sn);
      return;
    case 23:
      operateSwingDoor(board, sn);
      return;
    case 20: {
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
 * Player USE — doors + switches (SECTOR.C open-key path subset).
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

  if (hit.neartagsprite >= 0) {
    if (checkHitSwitch(board, hit.neartagsprite, 1)) {
      p.lastUse = `switch-spr=${hit.neartagsprite}`;
      return;
    }
  }

  let neartagsector = hit.neartagsector;

  if (neartagsector < 0 && hit.neartagsprite < 0 && hit.neartagwall < 0) {
    if (isanunderoperator(board.sectors[p.cursectnum]?.lotag ?? 0)) {
      neartagsector = p.cursectnum;
    }
  }

  if (neartagsector >= 0 && (board.sectors[neartagsector]?.lotag & 16384)) {
    return;
  }

  if (neartagsector >= 0) {
    const sec = board.sectors[neartagsector];
    if (!sec) return;
    if (isanearoperator(sec.lotag)) {
      if (sectorHasActivator(board, neartagsector)) return;
      if ((sec.lotag & 0xff) === 23 && swingDoorBusy(board, neartagsector)) return;
      operateSectors(board, neartagsector);
      p.lastUse = `sect=${neartagsector} lotag=${sec.lotag}`;
      return;
    }
  }

  if (isanunderoperator(board.sectors[p.cursectnum]?.lotag ?? 0)) {
    if ((board.sectors[p.cursectnum].lotag & 16384) === 0) {
      if (sectorHasActivator(board, p.cursectnum)) return;
      operateSectors(board, p.cursectnum);
      p.lastUse = `under=${p.cursectnum}`;
      return;
    }
  }

  if (hit.neartagwall >= 0) {
    if (checkHitSwitch(board, hit.neartagwall, 0)) {
      p.lastUse = `switch-wal=${hit.neartagwall}`;
    }
  }
}
