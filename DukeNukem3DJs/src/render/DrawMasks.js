import { APLAYER } from '../engine/SectorQuery.js';
import { BUILD_ANGLE_MASK } from '../core/renderConstants.js';
import { buildTables } from '../math/BuildTables.js';

/** Build rejects face sprites with yp <= 4<<8. */
const MIN_SPRITE_YP = 4 << 8;

/**
 * Picnums Duke hides at load / animatesprites (GAME.C) — without game init
 * these still have xrepeat>0 and draw as broken face sprites.
 * SECTOREFFECTOR, ACTIVATOR, TOUCHPLATE, ACTIVATORLOCKED, MUSICANDSFX,
 * LOCATORS, CYCLER, MASTERSWITCH, RESPAWN, GPSPEED, FOF.
 */
const HIDDEN_PICNUMS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]);

/**
 * drawmasks subset — face + wall sprites (MASKWALL2 fences).
 * Sprites are queued during drawrooms and flushed after sky fill.
 */
export class DrawMasks {
  /**
   * @param {import('./SoftwareRenderer.js').SoftwareRenderer} renderer
   * @param {import('../grp/ArtTiles.js').ArtTiles} art
   */
  constructor(renderer, art) {
    this.renderer = renderer;
    this.art = art;
    /** @type {Set<number>} */
    this._drawn = new Set();
    /** @type {{ spr: import('../engine/Board.js').Sprite, index: number, yp: number, xp: number, kind: 'face'|'wall', clipX1: number, clipX2: number, uClip: Int16Array, dClip: Int16Array }[]} */
    this._queue = [];
  }

  beginFrame() {
    this._drawn.clear();
    this._queue.length = 0;
  }

  /**
   * Queue sprites in a sector (drawn later via flush).
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {number} sectnum
   * @param {number} clipX1
   * @param {number} clipX2
   */
  queueSectorSprites(rooms, sectnum, clipX1, clipX2) {
    const board = rooms.board;
    if (!board) return;

    const n = clipX2 - clipX1 + 1;
    if (n <= 0) return;
    const uClip = new Int16Array(n);
    const dClip = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      uClip[i] = rooms.umost[clipX1 + i];
      dClip[i] = rooms.dmost[clipX1 + i];
    }

    for (let i = 0; i < board.numsprites; i++) {
      if (this._drawn.has(i)) continue;
      const spr = board.sprites[i];
      if (spr.sectnum !== sectnum) continue;
      if ((spr.cstat & 0x8000) !== 0) continue;
      if (spr.xrepeat <= 0 || spr.yrepeat <= 0) continue;
      const pic = spr.picnum & 0xffff;
      if (pic === APLAYER || HIDDEN_PICNUMS.has(pic)) continue;

      const kindBits = spr.cstat & 48;
      if (kindBits !== 0 && kindBits !== 16) continue;

      const dx = spr.x - rooms.posx;
      const dy = spr.y - rooms.posy;
      // ENGINE.C scansector: face sprites need xs*cos+ys*sin > 0
      const forward = dx * rooms.cos + dy * rooms.sin;
      if (kindBits === 0 && !(forward > 0)) continue;

      const xp = (dy * rooms.cos - dx * rooms.sin) >> 6;
      const yp = forward >> 6;
      if (kindBits === 0 && yp <= MIN_SPRITE_YP) continue;

      this._drawn.add(i);
      this._queue.push({
        spr,
        index: i,
        yp: Math.max(yp, MIN_SPRITE_YP + 1),
        xp,
        kind: kindBits === 16 ? 'wall' : 'face',
        clipX1,
        clipX2,
        uClip,
        dClip,
      });
    }
  }

  /**
   * Draw queued sprites (call after fillOpenColumns / sky).
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   */
  flush(rooms) {
    this._queue.sort((a, b) => b.yp - a.yp);
    for (const item of this._queue) {
      // Use saved portal clips — do not clobber rooms.umost/dmost (Build uses
      // bakumost / per-sprite window; mutating globals after fillOpenColumns is OK
      // but writing them mid-flush breaks later sprites that share columns).
      if (item.kind === 'wall') {
        this.drawWallSprite(
          rooms,
          item.spr,
          item.clipX1,
          item.clipX2,
          item.uClip,
          item.dClip,
        );
      } else {
        this.drawFaceSprite(
          rooms,
          item.spr,
          item.xp,
          item.yp,
          item.clipX1,
          item.clipX2,
          item.uClip,
          item.dClip,
        );
      }
    }
    this._queue.length = 0;
  }

  /**
   * Wall-aligned sprite ((cstat&48)==16) — courtyard MASKWALL2 fences.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {number} clipX1
   * @param {number} clipX2
   * @param {Int16Array} uClip
   * @param {Int16Array} dClip
   */
  drawWallSprite(rooms, spr, clipX1, clipX2, uClip, dClip) {
    const { buffer } = this.renderer;
    const tilenum = spr.picnum & 0xffff;
    this.art.loadtile(tilenum);
    const xspan = this.art.tilesizx[tilenum] | 0;
    const yspan = this.art.tilesizy[tilenum] | 0;
    if (xspan <= 0 || yspan <= 0) return;

    const ang = spr.ang & BUILD_ANGLE_MASK;
    const sn = buildTables.sin(ang);
    const cs = buildTables.cos(ang);
    const xv = spr.xrepeat * sn;
    const yv = spr.xrepeat * -cs;

    let xoff = spr.xoffset | 0;
    let yoff = spr.yoffset | 0;
    if (spr.cstat & 4) xoff = -xoff;
    if (spr.cstat & 8) yoff = -yoff;

    const i = (xspan >> 1) + xoff;
    const wx1 = (spr.x - (xv * i) / 65536) | 0;
    const wy1 = (spr.y - (yv * i) / 65536) | 0;
    const wx2 = (wx1 + (xv * xspan) / 65536) | 0;
    const wy2 = (wy1 + (yv * xspan) / 65536) | 0;

    const a = rooms.transform(wx1, wy1);
    const b = rooms.transform(wx2, wy2);
    let xp1 = a.xp;
    let yp1 = a.yp;
    let xp2 = b.xp;
    let yp2 = b.yp;

    if (yp1 < 256 && yp2 < 256) return;

    let swapped = false;
    if (xp1 * yp2 - xp2 * yp1 >= 0) {
      if (spr.cstat & 64) return;
      let t = xp1;
      xp1 = xp2;
      xp2 = t;
      t = yp1;
      yp1 = yp2;
      yp2 = t;
      swapped = true;
    }

    const half = buffer.halfxdimen;
    const xdimen = buffer.xdimen;
    let xb1;
    let xb2;
    let yb1 = yp1;
    let yb2 = yp2;

    if (xp1 >= -yp1) {
      if (xp1 > yp1 || yp1 === 0) return;
      xb1 = half + ((xp1 * half) / yp1) | 0;
      if (xp1 >= 0) xb1++;
      if (xb1 >= xdimen) xb1 = xdimen - 1;
      yb1 = yp1;
    } else {
      if (xp2 < -yp2) return;
      xb1 = 0;
      const denom = yp1 - yp2 + xp1 - xp2;
      if (denom === 0) return;
      yb1 = yp1 + (((yp2 - yp1) * (xp1 + yp1)) / denom) | 0;
    }
    if (yb1 < 256) return;

    if (xp2 <= yp2) {
      if (xp2 < -yp2 || yp2 === 0) return;
      xb2 = half + ((xp2 * half) / yp2) | 0;
      if (xp2 >= 0) xb2++;
      xb2 -= 1;
      if (xb2 >= xdimen) xb2 = xdimen - 1;
      yb2 = yp2;
    } else {
      if (xp1 > yp1) return;
      xb2 = xdimen - 1;
      const denom = xp2 - xp1 + yp1 - yp2;
      if (denom === 0) return;
      yb2 = yp1 + (((yp2 - yp1) * (yp1 - xp1)) / denom) | 0;
    }
    if (yb2 < 256 || xb1 > xb2) return;

    const lx = Math.max(xb1, clipX1);
    const rx = Math.min(xb2, clipX2);
    if (lx > rx) return;

    let z2 = spr.z - ((yoff * spr.yrepeat) << 2);
    if (spr.cstat & 128) {
      z2 += (yspan * spr.yrepeat) << 1;
    }
    const z1s = z2 - ((yspan * spr.yrepeat) << 2);

    const fullDx = xb2 - xb1 + 1;
    const yTop1 = rooms.zToScreen(z1s - rooms.posz, yb1);
    const yTop2 = rooms.zToScreen(z1s - rooms.posz, yb2);
    const yBot1 = rooms.zToScreen(z2 - rooms.posz, yb1);
    const yBot2 = rooms.zToScreen(z2 - rooms.posz, yb2);
    const topInc = fullDx > 0 ? ((yTop2 - yTop1) << 16) / fullDx : 0;
    const botInc = fullDx > 0 ? ((yBot2 - yBot1) << 16) / fullDx : 0;
    let topF = (yTop1 << 16) + topInc * (lx - xb1);
    let botF = (yBot1 << 16) + botInc * (lx - xb1);

    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, spr.shade | 0),
    );
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;
    const mirrorX = swapped !== ((spr.cstat & 4) !== 0);
    const mirrorY = (spr.cstat & 8) !== 0;

    for (let x = lx; x <= rx; x++) {
      const ci = x - clipX1;
      const uMost = ci >= 0 && ci < uClip.length ? uClip[ci] : 0;
      const dMost = ci >= 0 && ci < dClip.length ? dClip[ci] : buffer.ydimen;
      const u0 = Math.max(uMost, topF >> 16);
      const u1 = Math.min(dMost, (botF >> 16) + 1);
      if (u1 > u0) {
        const t = fullDx > 0 ? (x - xb1) / fullDx : 0;
        let texX = (t * xspan) | 0;
        if (mirrorX) texX = xspan - 1 - texX;
        if (texX < 0) texX = 0;
        if (texX >= xspan) texX = xspan - 1;
        const col = this.art.getColumn(tilenum, texX);
        if (col) {
          const screenX = windowx1 + x;
          const yTop = topF >> 16;
          const yBot = botF >> 16;
          const span = Math.max(1, yBot - yTop);
          for (let y = u0; y < u1; y++) {
            let v = ((y - yTop) * yspan) / span;
            if (mirrorY) v = yspan - 1 - v;
            let ty = v | 0;
            if (ty < 0) ty = 0;
            if (ty >= yspan) ty = yspan - 1;
            const texel = col[ty] & 255;
            if (texel === 255) continue;
            pixels[ylookup[y + windowy1] + screenX] = tables[shadeOff + texel];
          }
        }
      }
      topF += topInc;
      botF += botInc;
    }
  }

  /**
   * Face sprite path from ENGINE.C drawsprite ((cstat&48)==0).
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {number} xp
   * @param {number} yp
   * @param {number} clipX1
   * @param {number} clipX2
   * @param {Int16Array} uClip
   * @param {Int16Array} dClip
   */
  drawFaceSprite(rooms, spr, xp, yp, clipX1, clipX2, uClip, dClip) {
    const { buffer } = this.renderer;
    const tilenum = spr.picnum & 0xffff;
    this.art.loadtile(tilenum);
    const xspan = this.art.tilesizx[tilenum] | 0;
    const yspan = this.art.tilesizy[tilenum] | 0;
    if (xspan <= 0 || yspan <= 0) return;

    const xdimen = buffer.xdimen;
    const siz = ((rooms.xdimenscale * 0x80000) / yp) | 0;
    if (siz <= 0) return;

    const xv = (spr.xrepeat << 16) | 0;
    const xsiz = ((siz * xv * xspan) / 0x40000000) | 0;
    const ysiz = ((siz * spr.yrepeat * yspan) / 16384) | 0;
    if (xsiz <= 1 || ysiz <= 1) return;

    const xb = (((xp + yp) * (xdimen << 7)) / yp) | 0;
    const xoff = spr.xoffset | 0;
    const yoff = spr.yoffset | 0;
    const xoffPix = ((siz * xv * xoff) / 0x40000000) | 0;

    let x1 = xb - (xsiz >> 1);
    if (xspan & 1) x1 += ((siz * xv) / 0x80000000) | 0;
    if ((spr.cstat & 4) === 0) x1 -= xoffPix;
    else x1 += xoffPix;

    let y1 =
      ((((spr.z - rooms.posz) * siz) / 65536) | 0) -
      (((siz * spr.yrepeat * yoff) / 16384) | 0);
    y1 += (rooms.globalhoriz << 8) - ysiz;
    if (spr.cstat & 128) {
      y1 += ysiz >> 1;
      if (yspan & 1) y1 += ((siz * spr.yrepeat) / 32768) | 0;
    }

    const x2 = x1 + xsiz - 1;
    const y2 = y1 + ysiz - 1;
    if ((y1 >> 8) > (y2 >> 8)) return;

    let lx = (x1 >> 8) + 1;
    let rx = x2 >> 8;
    if (lx < 0) lx = 0;
    if (rx >= xdimen) rx = xdimen - 1;
    if (lx < clipX1) lx = clipX1;
    if (rx > clipX2) rx = clipX2;
    if (lx > rx) return;

    let topY = y1 >> 8;
    let botY = y2 >> 8;
    if (topY >= botY) return;

    const mirrorX = (spr.cstat & 4) !== 0;
    const mirrorY = (spr.cstat & 8) !== 0;
    const linuminc = mirrorX
      ? -((xspan * 0x1000000) / xsiz)
      : (xspan * 0x1000000) / xsiz;
    let linum = mirrorX
      ? (((lx << 8) - x2) * linuminc) / 256
      : (((lx << 8) - x1) * linuminc) / 256;

    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, spr.shade | 0),
    );
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;

    for (let x = lx; x <= rx; x++) {
      const ci = x - clipX1;
      const uMost = ci >= 0 && ci < uClip.length ? uClip[ci] : 0;
      const dMost = ci >= 0 && ci < dClip.length ? dClip[ci] : buffer.ydimen;
      const u0 = Math.max(uMost, topY);
      const u1 = Math.min(dMost, botY + 1);
      if (u1 > u0) {
        let texX = (linum / 0x1000000) | 0;
        if (texX < 0) texX = 0;
        if (texX >= xspan) texX = xspan - 1;
        const col = this.art.getColumn(tilenum, texX);
        if (col) {
          const screenX = windowx1 + x;
          for (let y = u0; y < u1; y++) {
            let v = (((y << 8) - y1) * yspan) / ysiz;
            if (mirrorY) v = yspan - 1 - v;
            let ty = v | 0;
            if (ty < 0) ty = 0;
            if (ty >= yspan) ty = yspan - 1;
            const texel = col[ty] & 255;
            if (texel === 255) continue;
            pixels[ylookup[y + windowy1] + screenX] = tables[shadeOff + texel];
          }
        }
      }
      linum += linuminc;
    }
  }
}
