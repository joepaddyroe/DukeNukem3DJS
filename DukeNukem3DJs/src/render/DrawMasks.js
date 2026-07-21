import {
  dmulscale6,
  dmulscale8,
  dmulscale10,
  dmulscale12,
  dmulscale32,
  divscale,
  divscale16,
  divscale18,
  divscale30,
  krecipasm,
  klabs,
  mulscale,
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
      this.drawFloorSprite(rooms, item.spr, item.yp);
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
   * ENGINE.C floor sprite (cstat&48)==32 — ceilsprite + ceilspritehline.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {import('../engine/Board.js').Sprite} spr
   * @param {number} yp spritesy depth
   */
  drawFloorSprite(rooms, spr, yp) {
    const tilenum = spr.picnum & 0xffff;
    this.art.loadtile(tilenum);
    const xspan = this.art.tilesizx[tilenum] | 0;
    const yspan = this.art.tilesizy[tilenum] | 0;
    if (xspan <= 0 || yspan <= 0) return;
    const gbuf = this.art.waloff[tilenum];
    if (!gbuf) return;

    const cstat = spr.cstat | 0;
    if (cstat & 64) {
      if ((rooms.posz > spr.z) === ((cstat & 8) === 0)) return;
    }

    const picanm = this.art.picanm[tilenum] | 0;
    let xoff = ((picanm << 16) >> 24) + (spr.xoffset | 0);
    let yoff = ((picanm << 8) >> 24) + (spr.yoffset | 0);
    if (cstat & 4) xoff = -xoff;
    if (cstat & 8) yoff = -yoff;

    const dax0 = (spr.x - rooms.posx) | 0;
    const day0 = (spr.y - rooms.posy) | 0;
    /** @type {number[]} */
    const rzi = new Array(16);
    /** @type {number[]} */
    const rxi = new Array(16);
    /** @type {number[]} */
    const ryi = new Array(16);
    rzi[0] = dmulscale10(rooms.cos, dax0, rooms.sin, day0);
    rxi[0] = dmulscale10(rooms.cos, day0, -rooms.sin, dax0);

    const iAng = (spr.ang + 2048 - rooms.ang) & BUILD_ANGLE_MASK;
    const cosang = buildTables.cos(iAng);
    const sinang = buildTables.sin(iAng);
    let dax = (((xspan >> 1) + xoff) * spr.xrepeat) | 0;
    let day = (((yspan >> 1) + yoff) * spr.yrepeat) | 0;
    rzi[0] = (rzi[0] + dmulscale12(sinang, dax, cosang, day)) | 0;
    rxi[0] = (rxi[0] + dmulscale12(sinang, day, -cosang, dax)) | 0;

    dax = (xspan * spr.xrepeat) | 0;
    day = (yspan * spr.yrepeat) | 0;
    rzi[1] = (rzi[0] - mulscale12(sinang, dax)) | 0;
    rxi[1] = (rxi[0] + mulscale12(cosang, dax)) | 0;
    dax = -mulscale12(cosang, day);
    day = -mulscale12(sinang, day);
    rzi[2] = (rzi[1] + dax) | 0;
    rxi[2] = (rxi[1] + day) | 0;
    rzi[3] = (rzi[0] + dax) | 0;
    rxi[3] = (rxi[0] + day) | 0;

    const ryi0 = scaleInt(spr.z - rooms.posz, rooms.yxaspect, 320 << 8);
    if (ryi0 === 0) return;
    ryi[0] = ryi[1] = ryi[2] = ryi[3] = ryi0;

    let z;
    let z1;
    let z2;
    if ((cstat & 4) === 0) {
      z = 0;
      z1 = 1;
      z2 = 3;
    } else {
      z = 1;
      z1 = 0;
      z2 = 2;
    }

    dax = (rzi[z1] - rzi[z]) | 0;
    day = (rxi[z1] - rxi[z]) | 0;
    let bot = dmulscale8(dax, dax, day, day);
    if (klabs(dax) >> 13 >= bot || klabs(day) >> 13 >= bot) return;
    let globalx1 = divscale18(dax, bot);
    let globalx2 = divscale18(day, bot);

    dax = (rzi[z2] - rzi[z]) | 0;
    day = (rxi[z2] - rxi[z]) | 0;
    bot = dmulscale8(dax, dax, day, day);
    if (klabs(dax) >> 13 >= bot || klabs(day) >> 13 >= bot) return;
    let globaly1 = divscale18(dax, bot);
    let globaly2 = divscale18(day, bot);

    let globalxpanning = (rxi[z] << 12) | 0;
    let globalypanning = (rzi[z] << 12) | 0;
    let globalzd = (ryi[z] << 12) | 0;

    const vr = rooms.viewingrange | 0;
    rzi[0] = mulscale16(rzi[0], vr);
    rzi[1] = mulscale16(rzi[1], vr);
    rzi[2] = mulscale16(rzi[2], vr);
    rzi[3] = mulscale16(rzi[3], vr);

    if (ryi[0] < 0) {
      let t = rxi[1];
      rxi[1] = rxi[3];
      rxi[3] = t;
      t = rzi[1];
      rzi[1] = rzi[3];
      rzi[3] = t;
    }

    // Clip polygon in view space (4 frustum edges) — ENGINE.C 3589–3686
    let npoints = 4;
    /** @type {number[]} */
    let rxi2 = new Array(16);
    /** @type {number[]} */
    let ryi2 = new Array(16);
    /** @type {number[]} */
    let rzi2 = new Array(16);

    // Edge 1: rxi+rzi >= 0
    let npoints2 = 0;
    let zzsgn = (rxi[0] + rzi[0]) | 0;
    for (z = 0; z < npoints; z++) {
      let zz = z + 1;
      if (zz === npoints) zz = 0;
      const zsgn = zzsgn;
      zzsgn = (rxi[zz] + rzi[zz]) | 0;
      if (zsgn >= 0) {
        rxi2[npoints2] = rxi[z];
        ryi2[npoints2] = ryi[z];
        rzi2[npoints2] = rzi[z];
        npoints2++;
      }
      if ((zsgn ^ zzsgn) < 0) {
        const t = divscale30(zsgn, (zsgn - zzsgn) | 0);
        rxi2[npoints2] = (rxi[z] + mulscale30(t, (rxi[zz] - rxi[z]) | 0)) | 0;
        ryi2[npoints2] = (ryi[z] + mulscale30(t, (ryi[zz] - ryi[z]) | 0)) | 0;
        rzi2[npoints2] = (rzi[z] + mulscale30(t, (rzi[zz] - rzi[z]) | 0)) | 0;
        npoints2++;
      }
    }
    if (npoints2 <= 2) return;

    // Edge 2: rxi-rzi <= 0
    npoints = 0;
    zzsgn = (rxi2[0] - rzi2[0]) | 0;
    for (z = 0; z < npoints2; z++) {
      let zz = z + 1;
      if (zz === npoints2) zz = 0;
      const zsgn = zzsgn;
      zzsgn = (rxi2[zz] - rzi2[zz]) | 0;
      if (zsgn <= 0) {
        rxi[npoints] = rxi2[z];
        ryi[npoints] = ryi2[z];
        rzi[npoints] = rzi2[z];
        npoints++;
      }
      if ((zsgn ^ zzsgn) < 0) {
        const t = divscale30(zsgn, (zsgn - zzsgn) | 0);
        rxi[npoints] =
          (rxi2[z] + mulscale30(t, (rxi2[zz] - rxi2[z]) | 0)) | 0;
        ryi[npoints] =
          (ryi2[z] + mulscale30(t, (ryi2[zz] - ryi2[z]) | 0)) | 0;
        rzi[npoints] =
          (rzi2[z] + mulscale30(t, (rzi2[zz] - rzi2[z]) | 0)) | 0;
        npoints++;
      }
    }
    if (npoints <= 2) return;

    const { buffer } = this.renderer;
    const halfxdimen = buffer.halfxdimen;
    const xdimen = buffer.xdimen;
    const ydimen = buffer.ydimen;
    const globalhoriz = rooms.globalhoriz | 0;

    // Edge 3: top of screen
    npoints2 = 0;
    zzsgn =
      Math.imul(ryi[0], halfxdimen) + Math.imul(rzi[0], globalhoriz - 0);
    for (z = 0; z < npoints; z++) {
      let zz = z + 1;
      if (zz === npoints) zz = 0;
      const zsgn = zzsgn;
      zzsgn =
        Math.imul(ryi[zz], halfxdimen) +
        Math.imul(rzi[zz], globalhoriz - 0);
      if (zsgn >= 0) {
        rxi2[npoints2] = rxi[z];
        ryi2[npoints2] = ryi[z];
        rzi2[npoints2] = rzi[z];
        npoints2++;
      }
      if ((zsgn ^ zzsgn) < 0) {
        const t = divscale30(zsgn, (zsgn - zzsgn) | 0);
        rxi2[npoints2] = (rxi[z] + mulscale30(t, (rxi[zz] - rxi[z]) | 0)) | 0;
        ryi2[npoints2] = (ryi[z] + mulscale30(t, (ryi[zz] - ryi[z]) | 0)) | 0;
        rzi2[npoints2] = (rzi[z] + mulscale30(t, (rzi[zz] - rzi[z]) | 0)) | 0;
        npoints2++;
      }
    }
    if (npoints2 <= 2) return;

    // Edge 4: bottom of screen
    npoints = 0;
    zzsgn =
      Math.imul(ryi2[0], halfxdimen) +
      Math.imul(rzi2[0], (globalhoriz - ydimen) | 0);
    for (z = 0; z < npoints2; z++) {
      let zz = z + 1;
      if (zz === npoints2) zz = 0;
      const zsgn = zzsgn;
      zzsgn =
        Math.imul(ryi2[zz], halfxdimen) +
        Math.imul(rzi2[zz], (globalhoriz - ydimen) | 0);
      if (zsgn <= 0) {
        rxi[npoints] = rxi2[z];
        ryi[npoints] = ryi2[z];
        rzi[npoints] = rzi2[z];
        npoints++;
      }
      if ((zsgn ^ zzsgn) < 0) {
        const t = divscale30(zsgn, (zsgn - zzsgn) | 0);
        rxi[npoints] =
          (rxi2[z] + mulscale30(t, (rxi2[zz] - rxi2[z]) | 0)) | 0;
        ryi[npoints] =
          (ryi2[z] + mulscale30(t, (ryi2[zz] - ryi2[z]) | 0)) | 0;
        rzi[npoints] =
          (rzi2[z] + mulscale30(t, (rzi2[zz] - rzi2[z]) | 0)) | 0;
        npoints++;
      }
    }
    if (npoints <= 2) return;

    // Project
    const xsi = new Int32Array(npoints);
    const ysi = new Int32Array(npoints);
    let lpoint = -1;
    let lmax = 0x7fffffff;
    let rpoint = -1;
    let rmax = -0x80000000;
    for (z = 0; z < npoints; z++) {
      xsi[z] =
        (scaleInt(rxi[z], xdimen << 15, rzi[z]) + (xdimen << 15)) | 0;
      ysi[z] =
        (scaleInt(ryi[z], xdimen << 15, rzi[z]) + (globalhoriz << 16)) | 0;
      if (xsi[z] < 0) xsi[z] = 0;
      if (xsi[z] > (xdimen << 16)) xsi[z] = xdimen << 16;
      if (ysi[z] < 0) ysi[z] = 0;
      if (ysi[z] > (ydimen << 16)) ysi[z] = ydimen << 16;
      if (xsi[z] < lmax) {
        lmax = xsi[z];
        lpoint = z;
      }
      if (xsi[z] > rmax) {
        rmax = xsi[z];
        rpoint = z;
      }
    }
    if (lpoint < 0 || rpoint < 0) return;

    const uwall = new Int16Array(xdimen);
    const dwall = new Int16Array(xdimen);
    uwall.fill(0);
    dwall.fill(ydimen);

    // uwall (top edges lpoint → rpoint)
    for (z = lpoint; z !== rpoint; ) {
      let zz = z + 1;
      if (zz === npoints) zz = 0;
      const dax1 = ((xsi[z] + 65535) >> 16) | 0;
      const dax2 = ((xsi[zz] + 65535) >> 16) | 0;
      if (dax2 > dax1) {
        const yinc = divscale16(ysi[zz] - ysi[z], xsi[zz] - xsi[z]);
        let y =
          (ysi[z] + mulscale16(((dax1 << 16) - xsi[z]) | 0, yinc)) | 0;
        for (let x = dax1; x < dax2; x++) {
          uwall[x] = y >> 16;
          y = (y + yinc) | 0;
        }
      }
      z = zz;
    }

    // dwall (bottom edges rpoint → lpoint)
    for (; z !== lpoint; ) {
      let zz = z + 1;
      if (zz === npoints) zz = 0;
      const dax1 = ((xsi[zz] + 65535) >> 16) | 0;
      const dax2 = ((xsi[z] + 65535) >> 16) | 0;
      if (dax2 > dax1) {
        const yinc = divscale16(ysi[zz] - ysi[z], xsi[zz] - xsi[z]);
        let y =
          (ysi[zz] + mulscale16(((dax1 << 16) - xsi[zz]) | 0, yinc)) | 0;
        for (let x = dax1; x < dax2; x++) {
          dwall[x] = y >> 16;
          y = (y + yinc) | 0;
        }
      }
      z = zz;
    }

    let lx = ((lmax + 65535) >> 16) | 0;
    let rx = ((rmax + 65535) >> 16) | 0;
    if (lx < 0) lx = 0;
    if (rx >= xdimen) rx = xdimen - 1;
    if (lx > rx) return;

    for (let x = lx; x <= rx; x++) {
      if (uwall[x] < rooms.umost[x]) uwall[x] = rooms.umost[x];
      if (dwall[x] > rooms.dmost[x]) dwall[x] = rooms.dmost[x];
    }

    // ENGINE.C floor-sprite smost clip
    const board = rooms.board;
    if (board) {
      for (let i = this.smostwallcnt - 1; i >= 0; i--) {
        const j = this.smostwall[i];
        if (rooms.xb1[j] > rx || rooms.xb2[j] < lx) continue;
        if (yp <= rooms.yb1[j] && yp <= rooms.yb2[j]) continue;

        const wallnum = rooms.thewall[j];
        const wal = board.walls[wallnum];
        const wal2 = board.walls[wal.point2];
        let xFront =
          Math.imul(wal2.x - wal.x, spr.y - wal.y) -
          Math.imul(spr.x - wal.x, wal2.y - wal.y);
        if (yp > rooms.yb1[j] && yp > rooms.yb2[j]) xFront = -1;
        if (
          xFront >= 0 &&
          (xFront !== 0 || wal.nextsector !== spr.sectnum)
        ) {
          continue;
        }

        const dalx2 = Math.max(rooms.xb1[j], lx);
        const darx2 = Math.min(rooms.xb2[j], rx);
        const typ = this.smostwalltype[i];
        if (typ === 0) {
          if (dalx2 <= darx2) {
            if (dalx2 === lx && darx2 === rx) return;
            for (let x = dalx2; x <= darx2; x++) dwall[x] = 0;
          }
        } else if (typ === 1) {
          const k = this.smoststart[i] - rooms.xb1[j];
          for (let x = dalx2; x <= darx2; x++) {
            const v = this.smost[k + x];
            if (v > uwall[x]) uwall[x] = v;
          }
        } else if (typ === 2) {
          const k = this.smoststart[i] - rooms.xb1[j];
          for (let x = dalx2; x <= darx2; x++) {
            const v = this.smost[k + x];
            if (v < dwall[x]) dwall[x] = v;
          }
        }
      }
    }

    // UV globals for ceilspritehline (picsiz-style floor log)
    let glogx = 15;
    while (glogx > 1 && (1 << glogx) > xspan) glogx--;
    let glogy = 15;
    while (glogy > 1 && (1 << glogy) > yspan) glogy--;
    if ((1 << glogx) !== xspan) {
      glogx++;
      globalx1 = mulscale(globalx1, xspan, glogx);
      globalx2 = mulscale(globalx2, xspan, glogx);
    }

    dax = globalxpanning;
    day = globalypanning;
    globalxpanning = -dmulscale6(globalx1, day, globalx2, dax);
    globalypanning = -dmulscale6(globaly1, day, globaly2, dax);

    const viewingrangerecip = buffer.viewingrangerecip ?? 65536;
    globalx2 = mulscale16(globalx2, vr);
    globaly2 = mulscale16(globaly2, vr);
    globalzd = mulscale16(globalzd, viewingrangerecip);

    globalx1 = Math.imul(globalx1 - globalx2, halfxdimen) | 0;
    globaly1 = Math.imul(globaly1 - globaly2, halfxdimen) | 0;

    const shadeOff = this.renderer.palookup.shadeOffset(
      Math.min(
        this.renderer.palookup.numShades - 1,
        Math.max(0, spr.shade | 0),
      ),
    );

    this.ceilspriteScan(rooms, {
      lx,
      rx: rx - 1,
      uwall,
      dwall,
      globalx1,
      globalx2,
      globaly1,
      globaly2,
      globalxpanning,
      globalypanning,
      globalzd,
      glogx,
      glogy,
      gbuf,
      shadeOff,
    });
  }

  /**
   * ENGINE.C ceilspritescan + lastx bookkeeping
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {object} st
   */
  ceilspriteScan(rooms, st) {
    const { lx, rx, uwall, dwall } = st;
    if (rx < lx) return;
    const lastx = new Int16Array(this.renderer.buffer.ydimen + 2);
    st._lastx = lastx;
    let y1 = uwall[lx] | 0;
    let y2 = y1;
    let x;
    for (x = lx; x <= rx; x++) {
      const twall = (uwall[x] - 1) | 0;
      const bwall = dwall[x] | 0;
      if (twall < bwall - 1) {
        if (twall >= y2) {
          while (y1 < y2 - 1) this.ceilspriteHline(rooms, st, x - 1, ++y1);
          y1 = twall;
        } else {
          while (y1 < twall) this.ceilspriteHline(rooms, st, x - 1, ++y1);
          while (y1 > twall) lastx[y1--] = x;
        }
        while (y2 > bwall) this.ceilspriteHline(rooms, st, x - 1, --y2);
        while (y2 < bwall) lastx[y2++] = x;
      } else {
        while (y1 < y2 - 1) this.ceilspriteHline(rooms, st, x - 1, ++y1);
        if (x === rx) break;
        y1 = uwall[x + 1] | 0;
        y2 = y1;
      }
    }
    while (y1 < y2 - 1) this.ceilspriteHline(rooms, st, rx, ++y1);
  }

  /**
   * ENGINE.C ceilspritehline — perspective UV via horizlookup + mhline.
   * @param {import('./DrawRooms.js').DrawRooms} rooms
   * @param {object} st
   * @param {number} x2
   * @param {number} y
   */
  ceilspriteHline(rooms, st, x2, y) {
    const lastx = st._lastx;
    if (!lastx || y < 0 || y >= lastx.length) return;
    const x1 = lastx[y] | 0;
    if (x2 < x1) return;

    const hl = rooms._horizLookup;
    const idx = (y - rooms.globalhoriz + hl.horizycent) | 0;
    if (idx < 0 || idx >= hl.horizlookup.length) return;
    const v = mulscale20(st.globalzd, hl.horizlookup[idx]);

    let bx =
      (mulscale14(
        Math.imul(st.globalx2, x1) + st.globalx1,
        v,
      ) +
        st.globalxpanning) |
      0;
    let by =
      (mulscale14(
        Math.imul(st.globaly2, x1) + st.globaly1,
        v,
      ) +
        st.globalypanning) |
      0;
    const xinc = mulscale14(st.globalx2, v);
    const yinc = mulscale14(st.globaly2, v);

    const { buffer } = this.renderer;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;
    const tables = this.renderer.palookup.tables;
    const shadeOff = st.shadeOff;
    const gbuf = st.gbuf;
    const glogx = st.glogx;
    const glogy = st.glogy;
    const xBits = (32 - glogx) | 0;
    const yBits = (32 - glogy) | 0;
    const row = (ylookup[(y + windowy1) | 0] + windowx1) | 0;

    for (let x = x1; x <= x2; x++) {
      const u = bx >>> 0;
      const vv = by >>> 0;
      const tidx = ((u >>> xBits) << glogy) + (vv >>> yBits);
      if (tidx >= 0 && tidx < gbuf.length) {
        const texel = gbuf[tidx] & 255;
        if (texel !== 255) {
          pixels[row + x] = tables[shadeOff + texel];
        }
      }
      bx = (bx + xinc) | 0;
      by = (by + yinc) | 0;
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
    return (
      dmulscale32(wal2.x - x1, spr.y - y1, -(spr.x - x1), wal2.y - y1) >= 0
    );
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

    // ENGINE.C: xv = mulscale16(xrepeat<<16, xyaspect); use int32 products
    const xv = mulscale16((spr.xrepeat | 0) << 16, xyaspect);
    const xsiz = mulscale30(siz, Math.imul(xv | 0, xspan | 0));
    const ysiz = mulscale14(siz, Math.imul(spr.yrepeat | 0, yspan | 0));
    if (xsiz <= 1 || ysiz <= 1) return;
    if (xspan >> 11 >= xsiz || yspan >= ysiz >> 1) return;

    const picanm = this.art.picanm[tilenum] | 0;
    const xoff = ((picanm << 16) >> 24) + (spr.xoffset | 0);
    const yoff = ((picanm << 8) >> 24) + (spr.yoffset | 0);

    let x1 = xb - (xsiz >> 1);
    if (xspan & 1) x1 += mulscale31(siz, xv);
    const iOff = mulscale30(siz, Math.imul(xv | 0, xoff | 0));
    if ((spr.cstat & 4) === 0) x1 -= iOff;
    else x1 += iOff;

    let y1 = mulscale16(spr.z - rooms.posz, siz);
    y1 -= mulscale14(siz, Math.imul(spr.yrepeat | 0, yoff | 0));
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
