/**
 * PREMAP.C sector.extra defaults + GPSPEED + GAME.C spawn setup.
 */
import { applySpawnSetup } from './SpawnSetup.js';

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
    s.cstat = (s.cstat | 32768) | 0;
    s.xrepeat = 0;
    s.yrepeat = 0;
  }
  applySpawnSetup(board);
}
