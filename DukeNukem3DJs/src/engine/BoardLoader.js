import { Board, MAXSECTORS, MAXWALLS, MAXSPRITES } from './Board.js';
import { updatesector } from './SectorQuery.js';

const SECTOR_BYTES = 40;
const WALL_BYTES = 32;
const SPRITE_BYTES = 44;

/**
 * loadboard (ENGINE.C) — Build map version 7.
 *
 * @param {Uint8Array} data
 * @returns {Board}
 */
export function loadboard(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 0;

  const mapversion = view.getInt32(o, true);
  o += 4;
  if (mapversion !== 7) {
    throw new Error(`Unsupported mapversion ${mapversion} (need 7)`);
  }

  const board = new Board();
  board.mapversion = mapversion;
  board.start.posx = view.getInt32(o, true); o += 4;
  board.start.posy = view.getInt32(o, true); o += 4;
  board.start.posz = view.getInt32(o, true); o += 4;
  board.start.ang = view.getInt16(o, true); o += 2;
  board.start.cursectnum = view.getInt16(o, true); o += 2;

  board.numsectors = view.getUint16(o, true); o += 2;
  if (board.numsectors > MAXSECTORS) {
    throw new Error(`numsectors ${board.numsectors} > MAXSECTORS`);
  }

  board.sectors = new Array(board.numsectors);
  for (let i = 0; i < board.numsectors; i++) {
    board.sectors[i] = readSector(view, o);
    o += SECTOR_BYTES;
  }

  board.numwalls = view.getUint16(o, true); o += 2;
  if (board.numwalls > MAXWALLS) {
    throw new Error(`numwalls ${board.numwalls} > MAXWALLS`);
  }

  board.walls = new Array(board.numwalls);
  for (let i = 0; i < board.numwalls; i++) {
    board.walls[i] = readWall(view, o);
    o += WALL_BYTES;
  }

  board.numsprites = view.getUint16(o, true); o += 2;
  if (board.numsprites > MAXSPRITES) {
    throw new Error(`numsprites ${board.numsprites} > MAXSPRITES`);
  }

  board.sprites = new Array(board.numsprites);
  for (let i = 0; i < board.numsprites; i++) {
    board.sprites[i] = readSprite(view, o);
    o += SPRITE_BYTES;
  }

  // ENGINE.C loadboard: updatesector after load
  const sect = updatesector(
    board.start.posx,
    board.start.posy,
    board,
    board.start.cursectnum,
  );
  if (sect >= 0) board.start.cursectnum = sect;

  return board;
}

/**
 * @param {import('../grp/GroupFileSystem.js').GroupFileSystem} fs
 * @param {string} filename
 * @returns {Board}
 */
export function loadboardFromFs(fs, filename) {
  return loadboard(fs.read(filename));
}

/** @param {DataView} view @param {number} o */
function readSector(view, o) {
  return {
    wallptr: view.getInt16(o, true),
    wallnum: view.getInt16(o + 2, true),
    ceilingz: view.getInt32(o + 4, true),
    floorz: view.getInt32(o + 8, true),
    ceilingstat: view.getInt16(o + 12, true),
    floorstat: view.getInt16(o + 14, true),
    ceilingpicnum: view.getInt16(o + 16, true),
    ceilingheinum: view.getInt16(o + 18, true),
    ceilingshade: view.getInt8(o + 20),
    ceilingpal: view.getUint8(o + 21),
    ceilingxpanning: view.getUint8(o + 22),
    ceilingypanning: view.getUint8(o + 23),
    floorpicnum: view.getInt16(o + 24, true),
    floorheinum: view.getInt16(o + 26, true),
    floorshade: view.getInt8(o + 28),
    floorpal: view.getUint8(o + 29),
    floorxpanning: view.getUint8(o + 30),
    floorypanning: view.getUint8(o + 31),
    visibility: view.getUint8(o + 32),
    filler: view.getUint8(o + 33),
    lotag: view.getInt16(o + 34, true),
    hitag: view.getInt16(o + 36, true),
    extra: view.getInt16(o + 38, true),
  };
}

/** @param {DataView} view @param {number} o */
function readWall(view, o) {
  return {
    x: view.getInt32(o, true),
    y: view.getInt32(o + 4, true),
    point2: view.getInt16(o + 8, true),
    nextwall: view.getInt16(o + 10, true),
    nextsector: view.getInt16(o + 12, true),
    cstat: view.getInt16(o + 14, true),
    picnum: view.getInt16(o + 16, true),
    overpicnum: view.getInt16(o + 18, true),
    shade: view.getInt8(o + 20),
    pal: view.getUint8(o + 21),
    xrepeat: view.getUint8(o + 22),
    yrepeat: view.getUint8(o + 23),
    xpanning: view.getUint8(o + 24),
    ypanning: view.getUint8(o + 25),
    lotag: view.getInt16(o + 26, true),
    hitag: view.getInt16(o + 28, true),
    extra: view.getInt16(o + 30, true),
  };
}

/** @param {DataView} view @param {number} o */
function readSprite(view, o) {
  return {
    x: view.getInt32(o, true),
    y: view.getInt32(o + 4, true),
    z: view.getInt32(o + 8, true),
    cstat: view.getInt16(o + 12, true),
    picnum: view.getInt16(o + 14, true),
    shade: view.getInt8(o + 16),
    pal: view.getUint8(o + 17),
    clipdist: view.getUint8(o + 18),
    filler: view.getUint8(o + 19),
    xrepeat: view.getUint8(o + 20),
    yrepeat: view.getUint8(o + 21),
    xoffset: view.getInt8(o + 22),
    yoffset: view.getInt8(o + 23),
    sectnum: view.getInt16(o + 24, true),
    statnum: view.getInt16(o + 26, true),
    ang: view.getInt16(o + 28, true),
    owner: view.getInt16(o + 30, true),
    xvel: view.getInt16(o + 32, true),
    yvel: view.getInt16(o + 34, true),
    zvel: view.getInt16(o + 36, true),
    lotag: view.getInt16(o + 38, true),
    hitag: view.getInt16(o + 40, true),
    extra: view.getInt16(o + 42, true),
  };
}
