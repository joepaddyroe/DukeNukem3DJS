/**
 * Spawn helpers — insert transient / effect sprites into the board.
 */
import { MAXSPRITES } from '../core/gameConstants.js';

/**
 * @param {import('../engine/Board.js').Board} board
 * @param {Partial<import('../engine/Board.js').Sprite> & {
 *   x: number, y: number, z: number, sectnum: number, picnum: number
 * }} fields
 * @returns {number} sprite index or -1
 */
export function insertSprite(board, fields) {
  if (board.numsprites >= MAXSPRITES) return -1;
  const spr = {
    x: fields.x | 0,
    y: fields.y | 0,
    z: fields.z | 0,
    cstat: fields.cstat ?? 0,
    picnum: fields.picnum | 0,
    shade: fields.shade ?? 0,
    pal: fields.pal ?? 0,
    clipdist: fields.clipdist ?? 32,
    filler: 0,
    xrepeat: fields.xrepeat ?? 64,
    yrepeat: fields.yrepeat ?? 64,
    xoffset: fields.xoffset ?? 0,
    yoffset: fields.yoffset ?? 0,
    sectnum: fields.sectnum | 0,
    statnum: fields.statnum ?? 0,
    ang: fields.ang ?? 0,
    owner: fields.owner ?? -1,
    xvel: fields.xvel ?? 0,
    yvel: fields.yvel ?? 0,
    zvel: fields.zvel ?? 0,
    lotag: fields.lotag ?? 0,
    hitag: fields.hitag ?? 0,
    extra: fields.extra ?? -1,
  };
  const idx = board.numsprites;
  board.sprites.push(spr);
  board.numsprites = board.sprites.length;
  return idx;
}
