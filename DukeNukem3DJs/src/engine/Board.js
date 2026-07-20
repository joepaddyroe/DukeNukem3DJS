import { MAXSECTORS, MAXWALLS, MAXSPRITES } from '../core/gameConstants.js';

/**
 * Build map board (ENGINE.C globals: sector[], wall[], sprite[]).
 * Struct layouts match BUILD.H (#pragma pack(1)).
 */
export class Board {
  constructor() {
    this.mapversion = 7;
    this.numsectors = 0;
    this.numwalls = 0;
    this.numsprites = 0;

    /** @type {Sector[]} */
    this.sectors = [];
    /** @type {Wall[]} */
    this.walls = [];
    /** @type {Sprite[]} */
    this.sprites = [];

    /** Start pose from map header (loadboard outs). */
    this.start = {
      posx: 0,
      posy: 0,
      posz: 0,
      ang: 0,
      cursectnum: 0,
    };
  }
}

/**
 * @typedef {Object} Sector
 * @property {number} wallptr
 * @property {number} wallnum
 * @property {number} ceilingz
 * @property {number} floorz
 * @property {number} ceilingstat
 * @property {number} floorstat
 * @property {number} ceilingpicnum
 * @property {number} ceilingheinum
 * @property {number} ceilingshade
 * @property {number} ceilingpal
 * @property {number} ceilingxpanning
 * @property {number} ceilingypanning
 * @property {number} floorpicnum
 * @property {number} floorheinum
 * @property {number} floorshade
 * @property {number} floorpal
 * @property {number} floorxpanning
 * @property {number} floorypanning
 * @property {number} visibility
 * @property {number} filler
 * @property {number} lotag
 * @property {number} hitag
 * @property {number} extra
 */

/**
 * @typedef {Object} Wall
 * @property {number} x
 * @property {number} y
 * @property {number} point2
 * @property {number} nextwall
 * @property {number} nextsector
 * @property {number} cstat
 * @property {number} picnum
 * @property {number} overpicnum
 * @property {number} shade
 * @property {number} pal
 * @property {number} xrepeat
 * @property {number} yrepeat
 * @property {number} xpanning
 * @property {number} ypanning
 * @property {number} lotag
 * @property {number} hitag
 * @property {number} extra
 */

/**
 * @typedef {Object} Sprite
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} cstat
 * @property {number} picnum
 * @property {number} shade
 * @property {number} pal
 * @property {number} clipdist
 * @property {number} filler
 * @property {number} xrepeat
 * @property {number} yrepeat
 * @property {number} xoffset
 * @property {number} yoffset
 * @property {number} sectnum
 * @property {number} statnum
 * @property {number} ang
 * @property {number} owner
 * @property {number} xvel
 * @property {number} yvel
 * @property {number} zvel
 * @property {number} lotag
 * @property {number} hitag
 * @property {number} extra
 */

export { MAXSECTORS, MAXWALLS, MAXSPRITES };
