/**
 * PREMAP.C sector.extra defaults + GPSPEED application.
 * Also GAME.C spawn skill cull for pal≠0 pickups (via Pickups.js).
 */
import { cullMultiplayerPickups } from './Pickups.js';

export const GPSPEED = 10;

/**
 * PREMAP.C: sector.extra = 256, then GPSPEED lotag overwrites + hide sprite.
 * @param {import('../engine/Board.js').Board} board
 */
export function applyPremapExtras(board) {
  for (let i = 0; i < board.numsectors; i++) {
    board.sectors[i].extra = 256;
  }
  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== GPSPEED) continue;
    const sec = board.sectors[s.sectnum];
    if (sec) sec.extra = s.lotag | 0;
    // deletesprite equivalent — hide
    s.cstat = (s.cstat | 32768) | 0;
    s.xrepeat = 0;
    s.yrepeat = 0;
  }
  cullMultiplayerPickups(board);
}
