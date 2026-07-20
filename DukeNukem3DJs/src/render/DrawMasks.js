import {
  dmulscale6,
  dmulscale8,
  dmulscale10,
  dmulscale12,
  dmulscale32,
  divscale,
  divscale18,
  divscale30,
  krecipasm,
  klabs,
  mulscale2,
  mulscale8,
  mulscale9,
  mulscale10,
  mulscale11,
  mulscale12,
  mulscale14,
  mulscale15,
  mulscale16,
  mulscale20,
  mulscale24,
  mulscale30,
  mulscale31,
  scale as scaleInt,
} from '../math/fixed.js';
import { APLAYER } from '../engine/SectorQuery.js';
import { BUILD_ANGLE_MASK } from '../core/renderConstants.js';
import { buildTables } from '../math/BuildTables.js';

/** Build rejects face sprites with yp <= 4<<8 (ENGINE.C drawmasks). */
const MIN_SPRITE_YP = 4 << 8;
/** ENGINE.C MAXYSAVES — smost clip buffer. */
const MAX_YSAVES = 4096;
const MAX_SMOST_WALLS = 512;

/**
 * Picnums Duke hides at load / animatesprites (GAME.C).
 */
const HIDDEN_PICNUMS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]);

/**
 * drawmasks subset — face/wall/floor sprites + maskwalls.
 * ENGINE.C: tsprites in scansector; maskwall[] in drawalls; interleaved in drawmasks.
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
    /** @type {{ spr: import('../engine/Board.js').Sprite, index: number, kind: 'face'|'wall'|'floor' }[]} */
    this._queue = [];
    /** @type {number[]} scan indices for maskwalls (ENGINE.C maskwall[]) */
    this._maskwalls = [];

    // ENGINE.C smost* — scan index + type + optional umost/dmost snapshots
    this.smostwall = new Int32Array(MAX_SMOST_WALLS);
    this.smostwalltype = new Uint8Array(MAX_SMOST_WALLS);
    this.smoststart = new Int32Array(MAX_SMOST_WALLS);
    this.smost = new Int16Array(MAX_YSAVES);
    this.smostwallcnt = 0;
    this.smostcnt = 0;
  }

  beginFrame() {
    this._drawn.clear();
    this._queue.length = 0;
    this._maskwalls.length = 0;
    this.smostwallcnt = 0;
    this.smostcnt = 0;
  }

  /**
   * ENGINE.C: maskwall[maskwallcnt++] = z when (cstat&48)==16
   * @param {number} scan
   */
  queueMaskWall(scan) {
    this._maskwalls.push(scan);
  }

  /** @returns {{ wall: number, cnt: number }} */
  markSmost() {
    return { wall: this.smostwallcnt, cnt: this.smostcnt };
  }

  /** @param {{ wall: number, cnt: number }} mark */
  restoreSmost(mark) {
    this.smostwallcnt = mark.wall;
    this.smostcnt = mark.cnt;
  }

  /**
   * ENGINE.C smost type 0 — solid / fully hidden wall.
   * @param {number} scan
   */
  addSmostType0(scan) {
    if (this.smostwallcnt >= MAX_SMOST_WALLS) return;
    this.smostwall[this.smostwallcnt] = scan;
    this.smostwalltype[this.smostwallcnt] = 0;
    this.smoststart[this.smostwallcnt] = 0;
    this.smostwallcnt++;
  }

  /**
   * ENGINE.C smost type 1 — copy umost[x1..x2].
   * @param {number} scan
   * @param {number} x1
   * @param {number} x2
   * @param {Int16Array} umost
   */
  addSmostUmost(scan, x1, x2, umost) {
    const n = x2 - x1 + 1;
    if (n <= 0 || this.smostwallcnt >= MAX_SMOST_WALLS) return;
    if (this.smostcnt + n > MAX_YSAVES) return;
    this.smoststart[this.smostwallcnt] = this.smostcnt;
    this.smostwall[this.smostwallcnt] = scan;
    this.smostwalltype[this.smostwallcnt] = 1;
    this.smostwallcnt++;
    for (let i = 0; i < n; i++) this.smost[this.smostcnt++] = umost[x1 + i];
  }

  /**
   * ENGINE.C smost type 2 — copy dmost[x1..x2].
   * @param {number} scan
   * @param {number} x1
   * @param {number} x2
   * @param {Int16Array} dmost
   */
  addSmostDmost(scan, x1, x2, dmost) {
    const n = x2 - x1 + 1;
    if (n <= 0 || this.smostwallcnt >= MAX_SMOST_WALLS) return;
    if (this.smostcnt + n > MAX_YSAVES) return;
    this.smoststart[this.smostwallcnt] = this.smostcnt;
    this.smostwall[this.smostwallcnt] = scan;
    this.smostwalltype[this.smostwallcnt] = 2;
    this.smostwallcnt++;
    for (let i = 0; i < n; i++) this.smost[this.smostcnt++] = dmost[x1 + i];
  }

  /**
   * ENGINE.C scansector tsprite collect.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {number} sectnum
   */
  queueSectorSprites(rooms, sectnum) {
    const board = rooms.board;
    if (!board) return;

    for (let i = 0; i < board.numsprites; i++) {
      if (this._drawn.has(i)) continue;
      const spr = board.sprites[i];
      if (spr.sectnum !== sectnum) continue;
      if ((spr.cstat & 0x8000) !== 0) continue;
      if (spr.xrepeat <= 0 || spr.yrepeat <= 0) continue;
      const pic = spr.picnum & 0xffff;
      if (pic === APLAYER || HIDDEN_PICNUMS.has(pic)) continue;

      const kindBits = spr.cstat & 48;
      if (kindBits !== 0 && kindBits !== 16 && kindBits !== 32) continue;

      const dx = spr.x - rooms.posx;
      const dy = spr.y - rooms.posy;
      if (kindBits === 0) {
        const forward = dx * rooms.cos + dy * rooms.sin;
        if (!(forward > 0)) continue;
      }

      this._drawn.add(i);
      let kind = 'face';
      if (kindBits === 16) kind = 'wall';
      else if (kindBits === 32) kind = 'floor';
      this._queue.push({
        spr,
        index: i,
        kind,
      });
    }
  }

  /**
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   */
  flush(rooms) {
    /** @type {{ spr: import('../engine/Board.js').Sprite, index: number, kind: 'face'|'wall'|'floor', xp: number, yp: number, xb: number }[]} */
    const list = [];

    for (const item of this._queue) {
      const spr = item.spr;
      const dx = spr.x - rooms.posx;
      const dy = spr.y - rooms.posy;
      const yp = dmulscale6(dx, rooms.cosVR, dy, rooms.sinVR);
      const xp = dmulscale6(dy, rooms.cos, -dx, rooms.sin);

      if (item.kind === 'face') {
        if (yp <= MIN_SPRITE_YP) continue;
      } else if (item.kind === 'floor') {
        // Floor sprites use flat Z; keep if roughly in front
        if (yp <= 0 && xp * xp + yp * yp < (256 * 256)) continue;
      } else if (yp <= 0) {
        continue;
      }

      const xb =
        yp !== 0
          ? scaleInt(xp + yp, rooms.renderer.buffer.xdimen << 7, yp)
          : 0;
      list.push({
        spr,
        index: item.index,
        kind: item.kind,
        xp,
        yp: item.kind === 'floor' ? Math.max(yp, 1) : yp,
        xb,
      });
    }

    // ENGINE.C: sort by increasing yp, draw far→near interleaved with maskwalls
    list.sort((a, b) => a.yp - b.yp);

    let si = list.length - 1;
    let mi = this._maskwalls.length - 1;
    const board = rooms.board;

    while (si >= 0 && mi >= 0 && board) {
      const sprItem = list[si];
      const mscan = this._maskwalls[mi];
      const wal = board.walls[rooms.thewall[mscan]];
      if (!this.spriteWallFront(sprItem.spr, wal, board)) {
        this.drawSpriteItem(rooms, sprItem);
        si--;
      } else {
        // Draw sprites behind this maskwall (in its x-range), then the wall
        const xb1 = rooms.xb1[mscan];
        const xb2 = rooms.xb2[mscan];
        while (si >= 0) {
          const s = list[si];
          const sx = s.xb >> 8;
          if (sx < xb1 || sx > xb2) break;
          if (this.spriteWallFront(s.spr, wal, board)) break;
          this.drawSpriteItem(rooms, s);
          si--;
        }
        this.drawMaskWall(rooms, mscan);
        mi--;
      }
    }
    while (si >= 0) {
      this.drawSpriteItem(rooms, list[si]);
      si--;
    }
    while (mi >= 0) {
      this.drawMaskWall(rooms, this._maskwalls[mi]);
      mi--;
    }
    this._queue.length = 0;
    this._maskwalls.length = 0;
  }

  /**
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {{ spr: import('../engine/Board.js').Sprite, kind: string, xp: number, yp: number, xb: number }} item
   */
  drawSpriteItem(rooms, item) {
    if (item.kind === 'wall') {
      this.drawWallSprite(rooms, item.spr, item.yp);
    } else if (item.kind === 'floor') {
      this.drawFloorSprite(rooms, item.spr);
    } else {
      this.drawFaceSprite(rooms, item.spr, item.xb, item.yp);
    }
  }

  /**
   * ENGINE.C drawmaskwall — masked mid texture on portal (overpicnum).
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {number} scan
   */
  drawMaskWall(rooms, scan) {
    const board = rooms.board;
    if (!board) return;
    const sectnum = rooms.thesector[scan];
    const sec = board.sectors[sectnum];
    const wal = board.walls[rooms.thewall[scan]];
    if (wal.nextsector < 0) return;
    const nsec = board.sectors[wal.nextsector];

    const z1 = Math.max(nsec.ceilingz, sec.ceilingz);
    const z2 = Math.min(nsec.floorz, sec.floorz);

    const xdimen = rooms.renderer.buffer.xdimen;
    const uwall = new Int16Array(xdimen);
    const dwall = new Int16Array(xdimen);
    const uplc = new Int16Array(xdimen);
    const dplc = new Int16Array(xdimen);

    rooms.wallMost(uwall, scan, sectnum, false);
    rooms.wallMost(uplc, scan, wal.nextsector, false);
    const xb1 = rooms.xb1[scan];
    const xb2 = rooms.xb2[scan];
    for (let x = xb1; x <= xb2; x++) {
      if (uplc[x] > uwall[x]) uwall[x] = uplc[x];
    }
    rooms.wallMost(dwall, scan, sectnum, true);
    rooms.wallMost(dplc, scan, wal.nextsector, true);
    for (let x = xb1; x <= xb2; x++) {
      if (dplc[x] < dwall[x]) dwall[x] = dplc[x];
    }

    // Clip to open portal window
    for (let x = xb1; x <= xb2; x++) {
      if (uwall[x] < rooms.umost[x]) uwall[x] = rooms.umost[x];
      if (dwall[x] > rooms.dmost[x]) dwall[x] = rooms.dmost[x];
    }

    const tilenum = wal.overpicnum & 0xffff;
    this.art.loadtile(tilenum);
    const xsiz = this.art.tilesizx[tilenum] | 0;
    const ysiz = this.art.tilesizy[tilenum] | 0;
    if (xsiz <= 0 || ysiz <= 0) return;

    const walxrepeat = (wal.xrepeat || 8) << 3;
    rooms.prepwallScan(scan, walxrepeat, wal.cstat);

    let globalorientation = wal.cstat | 0;
    let ybits = 0;
    while (ybits < 15 && (1 << ybits) < ysiz) ybits++;
    if ((1 << ybits) !== ysiz) ybits++;
    const shiftVal = 32 - ybits;
    let globalyscale = (wal.yrepeat || 8) << (shiftVal - 19);
    let globalzd =
      globalorientation & 4
        ? ((rooms.posz - z2) * globalyscale) << 8
        : ((rooms.posz - z1) * globalyscale) << 8;
    globalzd += (wal.ypanning || 0) << 24;
    if (globalorientation & 256) {
      globalyscale = -globalyscale;
      globalzd = -globalzd;
    }

    // smost occlusion (ENGINE.C drawmaskwall loop)
    for (let i = this.smostwallcnt - 1; i >= 0; i--) {
      const j = this.smostwall[i];
      if (rooms.xb1[j] > xb2 || rooms.xb2[j] < xb1) continue;
      if (rooms.wallfront(j, scan)) continue;
      const lx = Math.max(rooms.xb1[j], xb1);
      const rx = Math.min(rooms.xb2[j], xb2);
      const typ = this.smostwalltype[i];
      if (typ === 0) {
        if (lx <= rx) {
          if (lx === xb1 && rx === xb2) return;
          for (let x = lx; x <= rx; x++) dwall[x] = 0;
        }
      } else if (typ === 1) {
        const k = this.smoststart[i] - rooms.xb1[j];
        for (let x = lx; x <= rx; x++) {
          const v = this.smost[k + x];
          if (v > uwall[x]) uwall[x] = v;
        }
      } else if (typ === 2) {
        const k = this.smoststart[i] - rooms.xb1[j];
        for (let x = lx; x <= rx; x++) {
          const v = this.smost[k + x];
          if (v < dwall[x]) dwall[x] = v;
        }
      }
    }

    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, wal.shade | 0),
    );
    const xpan = wal.xpanning || 0;

    for (let x = xb1; x <= xb2; x++) {
      const y1 = uwall[x];
      const y2 = dwall[x] - 1;
      if (y2 < y1) continue;
      let texU = (rooms.lwall[x] + xpan) | 0;
      if (xsiz > 0) {
        texU %= xsiz;
        if (texU < 0) texU += xsiz;
      }
      rooms.drawWallCol(
        x,
        y1,
        y2,
        tilenum,
        texU,
        ysiz,
        shade,
        rooms.swall[x],
        globalyscale,
        globalzd,
        shiftVal,
        true,
      );
    }
  }

  /**
   * ENGINE.C floor sprite (cstat&48)==32 — subset: in-front quads only.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   */
  drawFloorSprite(rooms, spr) {
    const tilenum = spr.picnum & 0xffff;
    this.art.loadtile(tilenum);
    const xspan = this.art.tilesizx[tilenum] | 0;
    const yspan = this.art.tilesizy[tilenum] | 0;
    if (xspan <= 0 || yspan <= 0) return;

    const cstat = spr.cstat | 0;
    if (cstat & 64) {
      if ((rooms.posz > spr.z) === ((cstat & 8) === 0)) return;
    }

    const picanm = this.art.picanm[tilenum] | 0;
    let xoff = ((picanm << 16) >> 24) + (spr.xoffset | 0);
    let yoff = ((picanm << 8) >> 24) + (spr.yoffset | 0);
    if (cstat & 4) xoff = -xoff;
    if (cstat & 8) yoff = -yoff;

    // ENGINE.C: rotate center into view (dmulscale10)
    const dax0 = (spr.x - rooms.posx) | 0;
    const day0 = (spr.y - rooms.posy) | 0;
    let rzi = [
      dmulscale10(rooms.cos, dax0, rooms.sin, day0),
      0,
      0,
      0,
    ];
    let rxi = [
      dmulscale10(rooms.cos, day0, -rooms.sin, dax0),
      0,
      0,
      0,
    ];

    const iAng = (spr.ang + 2048 - rooms.ang) & BUILD_ANGLE_MASK;
    const cosang = buildTables.cos(iAng);
    const sinang = buildTables.sin(iAng);
    let dax = ((xspan >> 1) + xoff) * spr.xrepeat;
    let day = ((yspan >> 1) + yoff) * spr.yrepeat;
    rzi[0] += dmulscale12(sinang, dax, cosang, day);
    rxi[0] += dmulscale12(sinang, day, -cosang, dax);

    dax = xspan * spr.xrepeat;
    day = yspan * spr.yrepeat;
    rzi[1] = rzi[0] - mulscale12(sinang, dax);
    rxi[1] = rxi[0] + mulscale12(cosang, dax);
    dax = -mulscale12(cosang, day);
    day = -mulscale12(sinang, day);
    rzi[2] = rzi[1] + dax;
    rxi[2] = rxi[1] + day;
    rzi[3] = rzi[0] + dax;
    rxi[3] = rxi[0] + day;

    const ryi0 = scaleInt(spr.z - rooms.posz, rooms.yxaspect, 320 << 8);
    if (ryi0 === 0) return;
    const ryi = [ryi0, ryi0, ryi0, ryi0];

    // Subset: require all corners in front of near plane
    for (let z = 0; z < 4; z++) {
      rzi[z] = mulscale16(rzi[z], rooms.viewingrange);
      if (rzi[z] <= 256) return;
    }

    const { buffer } = this.renderer;
    const half = buffer.halfxdimen;
    const xdimen = buffer.xdimen;
    const ydimen = buffer.ydimen;
    /** @type {{ sx: number, sy: number, u: number, v: number }[]} */
    const pts = [];
    const uvs = [
      [0, 0],
      [xspan, 0],
      [xspan, yspan],
      [0, yspan],
    ];
    // Match cstat&4 corner order from C
    const order = (cstat & 4) === 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
    for (let oi = 0; oi < 4; oi++) {
      const z = order[oi];
      const sx = half + scaleInt(rxi[z], half, rzi[z]);
      const sy =
        rooms.globalhoriz + scaleInt(ryi[z], rooms.xdimenscale, rzi[z]);
      pts.push({ sx, sy, u: uvs[oi][0], v: uvs[oi][1] });
    }

    // Rasterize as two triangles with affine UV (visible subset)
    this.fillTexturedTri(rooms, tilenum, pts[0], pts[1], pts[2], spr.shade | 0);
    this.fillTexturedTri(rooms, tilenum, pts[0], pts[2], pts[3], spr.shade | 0);
  }

  /**
   * Affine textured triangle — floor-sprite subset (not full ceilspritehline).
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {number} tilenum
   * @param {{ sx: number, sy: number, u: number, v: number }} a
   * @param {{ sx: number, sy: number, u: number, v: number }} b
   * @param {{ sx: number, sy: number, u: number, v: number }} c
   * @param {number} shade
   */
  fillTexturedTri(rooms, tilenum, a, b, c, shade) {
    const xsiz = this.art.tilesizx[tilenum] | 0;
    const ysiz = this.art.tilesizy[tilenum] | 0;
    if (xsiz <= 0 || ysiz <= 0) return;
    const { buffer } = this.renderer;
    const xdimen = buffer.xdimen;
    const ydimen = buffer.ydimen;
    const pts = [a, b, c].sort((p, q) => p.sy - q.sy);
    const [p0, p1, p2] = pts;
    const y0 = Math.max(0, p0.sy | 0);
    const y2 = Math.min(ydimen - 1, p2.sy | 0);
    if (y2 < y0) return;

    const shadeOff = this.renderer.palookup.shadeOffset(
      Math.min(
        this.renderer.palookup.numShades - 1,
        Math.max(0, shade),
      ),
    );
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;

    const edgeInterp = (y, p, q) => {
      const dy = q.sy - p.sy;
      if (Math.abs(dy) < 1e-6) {
        return { x: p.sx, u: p.u, v: p.v };
      }
      const t = (y - p.sy) / dy;
      return {
        x: p.sx + (q.sx - p.sx) * t,
        u: p.u + (q.u - p.u) * t,
        v: p.v + (q.v - p.v) * t,
      };
    };

    for (let y = y0; y <= y2; y++) {
      let L;
      let R;
      if (y < p1.sy || p1.sy === p0.sy) {
        L = edgeInterp(y, p0, p2);
        R = edgeInterp(y, p0, p1);
      } else {
        L = edgeInterp(y, p0, p2);
        R = edgeInterp(y, p1, p2);
      }
      if (L.x > R.x) {
        const t = L;
        L = R;
        R = t;
      }
      let x0 = Math.max(0, (L.x | 0) + 1);
      let x1 = Math.min(xdimen - 1, R.x | 0);
      // Clip to umost/dmost
      const uClip = rooms.umost[x0] | 0;
      const dClip = rooms.dmost[x0] | 0;
      if (y < uClip || y >= dClip) continue;
      if (x1 < x0) continue;
      const dx = R.x - L.x;
      for (let x = x0; x <= x1; x++) {
        if (y < rooms.umost[x] || y >= rooms.dmost[x]) continue;
        const t = dx !== 0 ? (x - L.x) / dx : 0;
        let u = (L.u + (R.u - L.u) * t) | 0;
        let v = (L.v + (R.v - L.v) * t) | 0;
        u = ((u % xsiz) + xsiz) % xsiz;
        v = ((v % ysiz) + ysiz) % ysiz;
        const col = this.art.getColumn(tilenum, u);
        if (!col) continue;
        const texel = col[v] & 255;
        if (texel === 255) continue;
        pixels[ylookup[y + windowy1] + windowx1 + x] =
          tables[shadeOff + texel];
      }
    }
  }

  /**
   * ENGINE.C spritewallfront
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {import('../engine/Board.js').Wall} wal
   * @param {import('../engine/Board.js').Board} board
   */
  spriteWallFront(spr, wal, board) {
    const x1 = wal.x;
    const y1 = wal.y;
    const wal2 = board.walls[wal.point2];
    return dmulscale32(wal2.x - x1, spr.y - y1, -(spr.x - x1), wal2.y - y1) >= 0;
  }

  /**
   * ENGINE.C drawsprite face-sprite smost loop.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {number} yp
   * @param {number} lx
   * @param {number} rx
   * @param {Int16Array} uwall
   * @param {Int16Array} dwall
   * @returns {boolean} false if sprite fully occluded
   */
  applySmost(rooms, spr, yp, lx, rx, uwall, dwall) {
    const board = rooms.board;
    if (!board) return true;

    let daclip = 0;
    for (let i = this.smostwallcnt - 1; i >= 0; i--) {
      const typ = this.smostwalltype[i];
      if (typ & daclip) continue;

      const z = this.smostwall[i];
      const xb1 = rooms.xb1[z];
      const xb2 = rooms.xb2[z];
      const yb1 = rooms.yb1[z];
      const yb2 = rooms.yb2[z];
      if (xb1 > rx || xb2 < lx) continue;
      // Sprite closer than both wall ends → wall cannot occlude it
      if (yp <= yb1 && yp <= yb2) continue;
      const wal = board.walls[rooms.thewall[z]];
      if (this.spriteWallFront(spr, wal, board) && (yp <= yb1 || yp <= yb2)) {
        continue;
      }

      const dalx = Math.max(xb1, lx);
      const darx = Math.min(xb2, rx);

      if (typ === 0) {
        if (dalx <= darx) {
          if (dalx === lx && darx === rx) return false;
          for (let x = dalx; x <= darx; x++) {
            uwall[x] = 1;
            dwall[x] = 0;
          }
        }
      } else if (typ === 1) {
        const k = this.smoststart[i] - xb1;
        for (let x = dalx; x <= darx; x++) {
          const v = this.smost[k + x];
          if (v > uwall[x]) uwall[x] = v;
        }
        if (dalx === lx && darx === rx) daclip |= 1;
      } else if (typ === 2) {
        const k = this.smoststart[i] - xb1;
        for (let x = dalx; x <= darx; x++) {
          const v = this.smost[k + x];
          if (v < dwall[x]) dwall[x] = v;
        }
        if (dalx === lx && darx === rx) daclip |= 2;
      }
    }

    if (uwall[rx] >= dwall[rx]) {
      let x = lx;
      for (; x < rx; x++) {
        if (uwall[x] < dwall[x]) break;
      }
      if (x === rx) return false;
    }
    return true;
  }

  /**
   * Wall-aligned sprite ((cstat&48)==16).
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {number} sprYp
   */
  drawWallSprite(rooms, spr, sprYp) {
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

    const picanm = this.art.picanm[tilenum] | 0;
    let xoff = ((picanm << 16) >> 24) + (spr.xoffset | 0);
    let yoff = ((picanm << 8) >> 24) + (spr.yoffset | 0);
    if (spr.cstat & 4) xoff = -xoff;
    if (spr.cstat & 8) yoff = -yoff;

    const i = (xspan >> 1) + xoff;
    // ENGINE.C: mulscale16(xv,i) — keep int32, not JS float /65536
    const wx1 = (spr.x - mulscale16(xv, i)) | 0;
    const wy1 = (spr.y - mulscale16(yv, i)) | 0;
    const wx2 = (wx1 + mulscale16(xv, xspan)) | 0;
    const wy2 = (wy1 + mulscale16(yv, xspan)) | 0;

    const a = rooms.transform(wx1, wy1);
    const b = rooms.transform(wx2, wy2);
    let xp1 = a.xp;
    let yp1 = a.yp;
    let xp2 = b.xp;
    let yp2 = b.yp;

    if (yp1 < 256 && yp2 < 256) return;

    let swapped = false;
    if (dmulscale32(xp1, yp2, -xp2, yp1) >= 0) {
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
      xb1 = half + scaleInt(xp1, half, yp1);
      if (xp1 >= 0) xb1++;
      if (xb1 >= xdimen) xb1 = xdimen - 1;
      yb1 = yp1;
    } else {
      if (xp2 < -yp2) return;
      xb1 = 0;
      const denom = yp1 - yp2 + xp1 - xp2;
      if (denom === 0) return;
      yb1 = yp1 + scaleInt(yp2 - yp1, xp1 + yp1, denom);
    }
    if (yb1 < 256) return;

    if (xp2 <= yp2) {
      if (xp2 < -yp2 || yp2 === 0) return;
      xb2 = half + scaleInt(xp2, half, yp2) - 1;
      if (xp2 >= 0) xb2++;
      if (xb2 >= xdimen) xb2 = xdimen - 1;
      yb2 = yp2;
    } else {
      if (xp1 > yp1) return;
      xb2 = xdimen - 1;
      const denom = xp2 - xp1 + yp1 - yp2;
      if (denom === 0) return;
      yb2 = yp1 + scaleInt(yp2 - yp1, yp1 - xp1, denom);
    }
    if (yb2 < 256 || xb1 > xb2) return;

    const lx = xb1;
    const rx = xb2;
    const ydimen = buffer.ydimen;
    const uwall = new Int16Array(xdimen);
    const dwall = new Int16Array(xdimen);
    for (let x = lx; x <= rx; x++) {
      uwall[x] = 0;
      dwall[x] = ydimen;
    }
    // Face-style smost (wall-sprite C path is heavier; same front tests)
    if (!this.applySmost(rooms, spr, sprYp, lx, rx, uwall, dwall)) return;

    // ENGINE.C drawsprite wall-sprite U (3339–3366)
    const lwall = new Int32Array(xdimen + 4);
    let topinc = -mulscale10(yp1, xspan);
    const topDiff =
      (mulscale10(xp1, xdimen) - mulscale9(xb1 - half, yp1)) | 0;
    let top = (Math.imul(topDiff, xspan) >> 3) | 0;
    let botinc = (yp2 - yp1) >> 8;
    let bot =
      (mulscale11(xp1 - xp2, xdimen) + mulscale2(xb1 - half, botinc)) | 0;
    const jEnd = xb2 + 3;
    let z = mulscale20(top, krecipasm(bot));
    lwall[xb1] = z >> 8;
    for (let x = xb1 + 4; x <= jEnd; x += 4) {
      top = (top + topinc) | 0;
      bot = (bot + botinc) | 0;
      const zz = z;
      z = mulscale20(top, krecipasm(bot));
      lwall[x] = z >> 8;
      const iMid = (z + zz) >> 1;
      lwall[x - 2] = iMid >> 8;
      lwall[x - 3] = (iMid + zz) >> 9;
      lwall[x - 1] = (iMid + z) >> 9;
    }
    if (lwall[xb1] < 0) lwall[xb1] = 0;
    if (lwall[xb2] >= xspan) lwall[xb2] = xspan - 1;
    if (swapped !== ((spr.cstat & 4) !== 0)) {
      const last = xspan - 1;
      for (let x = xb1; x <= xb2; x++) {
        lwall[x] = last - lwall[x];
      }
    }

    let z2 = spr.z - ((yoff * spr.yrepeat) << 2);
    if (spr.cstat & 128) {
      z2 += (yspan * spr.yrepeat) << 1;
      if (yspan & 1) z2 += spr.yrepeat << 1;
    }
    const z1s = z2 - ((yspan * spr.yrepeat) << 2);

    const fullDx = xb2 - xb1 + 1;
    const yTop1 = rooms.zToScreen(z1s - rooms.posz, yb1);
    const yTop2 = rooms.zToScreen(z1s - rooms.posz, yb2);
    const yBot1 = rooms.zToScreen(z2 - rooms.posz, yb1);
    const yBot2 = rooms.zToScreen(z2 - rooms.posz, yb2);
    const topInc = fullDx > 0 ? ((yTop2 - yTop1) << 16) / fullDx : 0;
    const botIncY = fullDx > 0 ? ((yBot2 - yBot1) << 16) / fullDx : 0;
    let topF = (yTop1 << 16) + topInc * (lx - xb1);
    let botF = (yBot1 << 16) + botIncY * (lx - xb1);

    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, spr.shade | 0),
    );
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;
    const mirrorY = (spr.cstat & 8) !== 0;

    for (let x = lx; x <= rx; x++) {
      const u0 = Math.max(uwall[x], topF >> 16);
      const u1 = Math.min(dwall[x], (botF >> 16) + 1);
      if (u1 > u0) {
        let texX = lwall[x] | 0;
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
      botF += botIncY;
    }
  }

  /**
   * Face sprite ((cstat&48)==0) — ENGINE.C drawsprite.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {number} xb
   * @param {number} yp
   */
  drawFaceSprite(rooms, spr, xb, yp) {
    const { buffer } = this.renderer;
    const board = rooms.board;
    if (!board) return;
    const tilenum = spr.picnum & 0xffff;
    this.art.loadtile(tilenum);
    const xspan = this.art.tilesizx[tilenum] | 0;
    const yspan = this.art.tilesizy[tilenum] | 0;
    if (xspan <= 0 || yspan <= 0) return;
    if (yp <= MIN_SPRITE_YP) return;

    const xdimen = buffer.xdimen;
    const ydimen = buffer.ydimen;
    const xyaspect = buffer.xyaspect ?? 65536;

    const siz = divscale(rooms.xdimenscale, yp, 19);
    if (siz <= 0) return;

    const xv = mulscale16(spr.xrepeat << 16, xyaspect);
    const xsiz = mulscale30(siz, xv * xspan);
    const ysiz = mulscale14(siz, spr.yrepeat * yspan);
    if (xsiz <= 1 || ysiz <= 1) return;
    if (xspan >> 11 >= xsiz || yspan >= ysiz >> 1) return;

    const picanm = this.art.picanm[tilenum] | 0;
    const xoff = ((picanm << 16) >> 24) + (spr.xoffset | 0);
    const yoff = ((picanm << 8) >> 24) + (spr.yoffset | 0);

    let x1 = xb - (xsiz >> 1);
    if (xspan & 1) x1 += mulscale31(siz, xv);
    const iOff = mulscale30(siz, xv * xoff);
    if ((spr.cstat & 4) === 0) x1 -= iOff;
    else x1 += iOff;

    let y1 = mulscale16(spr.z - rooms.posz, siz);
    y1 -= mulscale14(siz, spr.yrepeat * yoff);
    y1 += (rooms.globalhoriz << 8) - ysiz;
    if (spr.cstat & 128) {
      y1 += ysiz >> 1;
      if (yspan & 1) y1 += mulscale15(siz, spr.yrepeat);
    }

    const x2 = x1 + xsiz - 1;
    const y2 = y1 + ysiz - 1;
    if ((y1 | 255) >= (y2 | 255)) return;

    let lx = (x1 >> 8) + 1;
    let rx = x2 >> 8;
    if (lx < 0) lx = 0;
    if (rx >= xdimen) rx = xdimen - 1;
    if (lx > rx) return;

    const sec = board.sectors[spr.sectnum];
    let startum = 0;
    let startdm = 0x7fffffff;
    if (sec) {
      if ((sec.ceilingstat & 3) === 0) {
        startum =
          rooms.globalhoriz +
          mulscale24(siz, sec.ceilingz - rooms.posz) -
          1;
      }
      if ((sec.floorstat & 3) === 0) {
        startdm =
          rooms.globalhoriz + mulscale24(siz, sec.floorz - rooms.posz) + 1;
      }
    }
    if (y1 >> 8 > startum) startum = y1 >> 8;
    if (y2 >> 8 < startdm) startdm = y2 >> 8;
    if (startum < -32768) startum = -32768;
    if (startdm > 32767) startdm = 32767;
    if (startum >= startdm) return;

    const uwall = new Int16Array(xdimen);
    const dwall = new Int16Array(xdimen);
    for (let x = lx; x <= rx; x++) {
      uwall[x] = startum > 0 ? startum : 0;
      dwall[x] = startdm < ydimen ? startdm : ydimen;
      if (uwall[x] < 0) uwall[x] = 0;
      if (dwall[x] > ydimen) dwall[x] = ydimen;
    }
    if (!this.applySmost(rooms, spr, yp, lx, rx, uwall, dwall)) return;

    const mirrorX = (spr.cstat & 4) !== 0;
    const mirrorY = (spr.cstat & 8) !== 0;
    let linuminc = mirrorX
      ? -divscale(xspan, xsiz, 24)
      : divscale(xspan, xsiz, 24);
    let linum = mirrorX
      ? mulscale8((lx << 8) - x2, linuminc)
      : mulscale8((lx << 8) - x1, linuminc);

    let yTop = y1;
    let yBot = y2;
    let yspanDraw = yspan;
    let yIncSign = 1;
    if (mirrorY) {
      yIncSign = -1;
      const tmp = yTop;
      yTop = yBot;
      yBot = tmp;
    }

    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, spr.shade | 0),
    );
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;

    for (let x = lx; x <= rx; x++) {
      const u0 = Math.max(uwall[x], Math.min(yTop, yBot) >> 8);
      const u1 = Math.min(dwall[x], (Math.max(yTop, yBot) >> 8) + 1);
      if (u1 > u0) {
        let texX = (linum / 0x1000000) | 0;
        if (texX < 0) texX = 0;
        if (texX >= xspan) texX = xspan - 1;
        const col = this.art.getColumn(tilenum, texX);
        if (col) {
          const screenX = windowx1 + x;
          const ysizPix = ysiz;
          for (let y = u0; y < u1; y++) {
            let v = (((y << 8) - y1) * yspanDraw) / ysizPix;
            if (yIncSign < 0) v = yspan - 1 - v;
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
