/**
 * ACTORS.C transporters (stat 9 / SE lotag 7) — E1L1 roof exit.
 */
import { SECTOREFFECTOR } from './Names.js';
import { ensureHitType } from './HitType.js';
import { PHEIGHT, updatesector } from '../engine/SectorQuery.js';
import { klabs } from '../math/fixed.js';

/**
 * GAME.C spawn SECTOREFFECTOR lotag 7 — pair by hitag, remember floor vs air.
 * @param {import('../engine/Board.js').Board} board
 */
export function initTransporters(board) {
  /** @type {number[]} */
  const list = [];
  for (let i = 0; i < board.numsprites; i++) {
    const sp = board.sprites[i];
    if ((sp.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((sp.lotag & 0xff) !== 7) continue;
    list.push(i);
  }

  for (const i of list) {
    const sp = board.sprites[i];
    const sec = board.sectors[sp.sectnum];
    if (!sec) continue;

    sp.yvel = sec.extra | 0;
    // Visible cstat cleared — transporters are markers, not drawn as SE tile
    sp.cstat = 0;
    sp.xrepeat = 0;
    sp.yrepeat = 0;

    let owner = i;
    for (const j of list) {
      if (j === i) continue;
      if ((board.sprites[j].hitag | 0) === (sp.hitag | 0)) {
        owner = j;
        break;
      }
    }
    sp.owner = owner;

    const ht = ensureHitType(i);
    ht.temp_data[0] = 0; // T1 cooldown
    ht.temp_data[4] = (sec.floorz | 0) === (sp.z | 0) ? 1 : 0; // T5 onfloorz
  }
}

/**
 * ACTORS.C moveexits / transporter subset for local player.
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player} p
 */
export function processTransporters(board, p) {
  p.on_warping_sector = 0;

  if ((p.transporter_hold | 0) > 0) {
    p.transporter_hold--;
  } else if ((p.transporter_hold | 0) < 0) {
    p.transporter_hold++;
  }

  for (let i = 0; i < board.numsprites; i++) {
    const s = board.sprites[i];
    if ((s.picnum & 0xffff) !== SECTOREFFECTOR) continue;
    if ((s.lotag & 0xff) !== 7) continue;
    if ((s.owner | 0) === i) continue; // unpaired

    const sect = s.sectnum | 0;
    if ((p.cursectnum | 0) !== sect) continue;

    const ht = ensureHitType(i);
    const t = ht.temp_data;
    if ((t[0] | 0) > 0) t[0]--;

    p.on_warping_sector = 1;
    const onfloorz = t[4] | 0;
    const sectlotag = board.sectors[sect]?.lotag | 0;
    const ow = s.owner | 0;
    const dest = board.sprites[ow];
    if (!dest) continue;

    if ((p.transporter_hold | 0) === 0 && (p.jumping_counter | 0) === 0) {
      if (
        p.on_ground &&
        sectlotag === 0 &&
        onfloorz &&
        (s.pal | 0) === 0
      ) {
        warpPlayer(board, p, s, dest, i, ow, t);
        return;
      }
    } else if (!(sectlotag === 1 && p.on_ground === 1)) {
      continue;
    }

    // Mid-air / shaft transporter (E1L1 roof hole)
    if (!onfloorz && klabs((s.z | 0) - (p.posz | 0)) < 6144) {
      p.posx = (p.posx + ((dest.x | 0) - (s.x | 0))) | 0;
      p.posy = (p.posy + ((dest.y | 0) - (s.y | 0))) | 0;
      p.posz = ((dest.z | 0) + 6144) | 0;
      p.bobposx = p.posx;
      p.bobposy = p.posy;
      p.posxv = 0;
      p.posyv = 0;
      p.poszv = 0;
      const ns = updatesector(p.posx, p.posy, board, dest.sectnum | 0);
      p.cursectnum = ns >= 0 ? ns : dest.sectnum | 0;
      p.ang = dest.ang & 2047;
      if ((dest.owner | 0) !== ow) p.transporter_hold = -2;
      return;
    }
  }
}

/**
 * Floor transporter warp.
 * @param {import('../engine/Board.js').Board} board
 * @param {import('./Player.js').Player} p
 * @param {import('../engine/Board.js').Sprite} src
 * @param {import('../engine/Board.js').Sprite} dest
 * @param {number} i
 * @param {number} ow
 * @param {number[]} t
 */
function warpPlayer(board, p, src, dest, i, ow, t) {
  p.ang = dest.ang & 2047;
  if ((dest.owner | 0) !== ow) {
    t[0] = 13;
    ensureHitType(ow).temp_data[0] = 13;
    p.transporter_hold = 13;
  }
  p.posx = dest.x | 0;
  p.posy = dest.y | 0;
  p.posz = ((dest.z | 0) - PHEIGHT) | 0;
  p.bobposx = p.posx;
  p.bobposy = p.posy;
  p.posxv = 0;
  p.posyv = 0;
  p.poszv = 0;
  const ns = updatesector(p.posx, p.posy, board, dest.sectnum | 0);
  p.cursectnum = ns >= 0 ? ns : dest.sectnum | 0;
}
