/**
 * ENGINE.C nextsectorneighborz — find neighboring sector by floor/ceiling Z.
 * @param {import('./Board.js').Board} board
 * @param {number} sectnum
 * @param {number} thez
 * @param {number} topbottom 1 = floorz, else ceilingz
 * @param {number} direction 1 = next higher, else next lower
 * @returns {number} sector index or -1
 */
export function nextsectorneighborz(board, sectnum, thez, topbottom, direction) {
  if (sectnum < 0 || sectnum >= board.numsectors) return -1;
  let nextz = direction === 1 ? 0x7fffffff : -0x80000000;
  let sectortouse = -1;
  const sec = board.sectors[sectnum];
  const start = sec.wallptr;
  const end = start + sec.wallnum;
  for (let i = start; i < end; i++) {
    const wal = board.walls[i];
    const ns = wal.nextsector | 0;
    if (ns < 0) continue;
    const nsec = board.sectors[ns];
    const testz = topbottom === 1 ? nsec.floorz | 0 : nsec.ceilingz | 0;
    if (direction === 1) {
      if (testz > thez && testz < nextz) {
        nextz = testz;
        sectortouse = ns;
      }
    } else if (testz < thez && testz > nextz) {
      nextz = testz;
      sectortouse = ns;
    }
  }
  return sectortouse;
}
