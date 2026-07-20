import {
  divscale12,
  divscale16,
  divscale30,
  divscale32,
  dmulscale6,
  dmulscale32,
  mulscale2,
  mulscale5,
  mulscale11,
  mulscale16,
  mulscale18,
  mulscale19,
  mulscale20,
  mulscale21,
  mulscale30,
  scale as scaleInt,
} from '../math/fixed.js';
import { setupFlatPlane, sampleFlatPlane } from './FlatPlane.js';
import { HorizLookup, setupFlatScan, sampleFlatScan } from './FlatScan.js';
import { BUILD_ANGLE_MASK, BUILD_ANGLES } from '../core/renderConstants.js';
import { pickSpawn, inside, EYEHEIGHT, getzsofslope } from '../engine/SectorQuery.js';
import { clipmove, CLIPMASK0 } from '../engine/ClipMove.js';
import { buildTables } from '../math/BuildTables.js';

/** Build rejects walls with yp < 256 after dmulscale6 (ENGINE.C scansector). */
const NEAR_Y = 256;
/** Max wall scans per frame (ENGINE.C MAXWALLSB-ish). */
const MAX_SCANS = 2048;
/** Approximate walk — full Duke friction/vel later. */
const MOVE_SPEED = 80;
const STRAFE_SPEED = 70;

/**
 * Build-style drawrooms: scansector → bunches → drawalls front-to-back.
 * Replaces the DFS portal recursion that could not match ENGINE.C occlusion.
 */
export class DrawRooms {
  /**
   * @param {import('./SoftwareRenderer.js').SoftwareRenderer} renderer
   * @param {import('../grp/ArtTiles.js').ArtTiles} art
   */
  constructor(renderer, art) {
    this.renderer = renderer;
    this.art = art;

    /** @type {import('../engine/Board.js').Board|null} */
    this.board = null;

    this.posx = 0;
    this.posy = 0;
    this.posz = 0;
    this.ang = 0;
    this.horiz = 100;
    this.cursectnum = 0;

    this.umost = new Int16Array(2048);
    this.dmost = new Int16Array(2048);
    this.uplc = new Int16Array(2048);
    this.dplc = new Int16Array(2048);
    this.uwall = new Int16Array(2048);
    this.dwall = new Int16Array(2048);

    this.cos = 0;
    this.sin = 0;
    /** viewingrange-scaled trig for yp (ENGINE.C cosviewingrangeglobalang). */
    this.cosVR = 0;
    this.sinVR = 0;
    this.viewingrange = 65536;
    this.yxaspect = 65536;
    this.globalhoriz = 100;
    this.xdimenscale = 65536;
    this.xdimscale = 65536;

    /** @type {Set<number>} */
    this.gotSectors = new Set();

    this.xb1 = new Int32Array(MAX_SCANS);
    this.xb2 = new Int32Array(MAX_SCANS);
    this.yb1 = new Int32Array(MAX_SCANS);
    this.yb2 = new Int32Array(MAX_SCANS);
    this.rx1 = new Int32Array(MAX_SCANS);
    this.ry1 = new Int32Array(MAX_SCANS);
    this.rx2 = new Int32Array(MAX_SCANS);
    this.ry2 = new Int32Array(MAX_SCANS);
    this.p2 = new Int32Array(MAX_SCANS);
    this.thesector = new Int32Array(MAX_SCANS);
    this.thewall = new Int32Array(MAX_SCANS);
    this.bunchfirst = new Int32Array(MAX_SCANS);
    this.bunchlast = new Int32Array(MAX_SCANS);
    this.numscans = 0;
    this.numbunches = 0;

    this.lwall = new Int32Array(2048);
    this.swall = new Int32Array(2048);

    /** @type {import('./FlatPlane.js').FlatPlane|null} */
    this._ceilPlane = null;
    /** @type {import('./FlatPlane.js').FlatPlane|null} */
    this._florPlane = null;
    /** @type {import('./FlatScan.js').FlatScan|null} */
    this._ceilScan = null;
    /** @type {import('./FlatScan.js').FlatScan|null} */
    this._florScan = null;
    this._horizLookup = new HorizLookup();
    this._skyCeil = false;
    this._skyFlor = false;

    /** @type {import('./DrawMasks.js').DrawMasks|null} */
    this.drawMasks = null;

    this.globparaflorclip = true;
    this.globparaceilclip = true;
    /** ENGINE.C globaluclip / globaldclip for owallmost. */
    this.globaluclip = 0;
    this.globaldclip = 0;

    /**
     * Debug: 'normal' | 'wallsOnly' | 'coverage'
     * 1/2/3 keys cycle via SoftwareRenderer.tick
     */
    this.debugVisMode = 'normal';
    this.lastNumscans = 0;
    this.lastNumbunches = 0;
    this.lastOpenCols = 0;
  }

  /**
   * @param {import('../engine/Board.js').Board} board
   */
  setBoard(board) {
    this.board = board;
    const spawn = pickSpawn(board);
    this.posx = spawn.posx;
    this.posy = spawn.posy;
    this.posz = spawn.posz;
    this.ang = spawn.ang & BUILD_ANGLE_MASK;
    this.cursectnum = spawn.cursectnum;
    this.horiz = 100;
    this.spawnInfo = spawn;
    this._refreshDebug();
  }

  /** @returns {string} */
  getDebugStatus() {
    const d = this.debug;
    if (!d) return '';
    return (
      `spawn=${d.source} sect=${this.cursectnum} inside=${d.inside} vis=${this.debugVisMode}\n` +
      `pos=(${this.posx},${this.posy},${this.posz}) ang=${this.ang}\n` +
      `ceil=${d.ceilz} floor=${d.floorz} eyeAboveFloor=${d.eyeAboveFloor}\n` +
      `spriteZ=${d.spriteZ} florz-EYE=${d.floorMinusEye} Δ=${d.zDeltaVsSnap}\n` +
      `scans=${this.lastNumscans} bunches=${this.lastNumbunches} openCols=${this.lastOpenCols} got=${this.gotSectors.size}\n` +
      `keys: WASD · ←→/QE · 1=normal 2=wallsOnly 3=coverage`
    );
  }

  /** @param {number} deltaAng */
  turn(deltaAng) {
    this.ang = (this.ang + deltaAng) & BUILD_ANGLE_MASK;
  }

  /**
   * @param {number} forward
   * @param {number} strafe
   * @param {number} turn
   */
  move(forward, strafe, turn) {
    if (turn) this.turn(turn | 0);
    if (!this.board || (!forward && !strafe)) {
      this._refreshDebug();
      return;
    }

    const c = buildTables.cos(this.ang);
    const s = buildTables.sin(this.ang);
    // ENGINE.C player move: sintable scaled; keep walk speed comparable
    const dx = ((forward * MOVE_SPEED * c - strafe * STRAFE_SPEED * s) >> 14) | 0;
    const dy = ((forward * MOVE_SPEED * s + strafe * STRAFE_SPEED * c) >> 14) | 0;

    const moved = clipmove({
      board: this.board,
      x: this.posx,
      y: this.posy,
      z: this.posz,
      sectnum: this.cursectnum,
      xvect: dx << 14,
      yvect: dy << 14,
      walldist: 164,
      ceildist: 4 << 8,
      flordist: 20 << 8,
      cliptype: CLIPMASK0,
      pheight: EYEHEIGHT,
    });

    this.posx = moved.x;
    this.posy = moved.y;
    this.posz = moved.z;
    this.cursectnum = moved.sectnum;
    this._refreshDebug();
  }

  _refreshDebug() {
    const board = this.board;
    if (!board) return;
    const z = getzsofslope(board, this.cursectnum, this.posx, this.posy);
    const spriteZ = this.spawnInfo?.spriteZ ?? this.posz;
    const floorMinusEye = z.florz - EYEHEIGHT;
    this.debug = {
      source: this.spawnInfo?.source ?? '?',
      inside: inside(this.posx, this.posy, board, this.cursectnum),
      ceilz: z.ceilz,
      floorz: z.florz,
      eyeAboveFloor: z.florz - this.posz,
      spriteZ,
      floorMinusEye,
      zDeltaVsSnap: this.posz - floorMinusEye,
    };
  }

  drawrooms() {
    const board = this.board;
    const { buffer } = this.renderer;
    if (!board || board.numsectors <= 0) return;

    const xdimen = buffer.xdimen;
    const ydimen = buffer.ydimen;

    this.umost = new Int16Array(xdimen);
    this.dmost = new Int16Array(xdimen);
    for (let i = 0; i < xdimen; i++) {
      this.umost[i] = 0;
      this.dmost[i] = ydimen;
    }

    // ENGINE.C: cosglobalang = sintable[(ang+512)&2047]; singlobalang = sintable[ang]
    this.cos = buildTables.cos(this.ang);
    this.sin = buildTables.sin(this.ang);
    // ENGINE.C setview → setaspect(65536, divscale16(ydim*320, xdim*200))
    this.viewingrange = buffer.viewingrange ?? 65536;
    this.yxaspect = buffer.yxaspect ?? 65536;
    this.cosVR = mulscale16(this.cos, this.viewingrange);
    this.sinVR = mulscale16(this.sin, this.viewingrange);
    // xdimenscale = scale(xdimen, yxaspect, 320)
    this.xdimenscale = scaleInt(xdimen, this.yxaspect, 320);
    const xyaspect = divscale32(1, this.yxaspect);
    this.xdimscale = scaleInt(320, xyaspect, xdimen);
    this.globalhoriz =
      (ydimen >> 1) + mulscale16(this.horiz - 100, this.xdimenscale);
    this.globaluclip = (0 - this.globalhoriz) * this.xdimscale;
    this.globaldclip = (ydimen - this.globalhoriz) * this.xdimscale;
    this._horizLookup.rebuild(buffer.ydim, divscale32(1, this.yxaspect));

    const camZ = getzsofslope(
      board,
      this.cursectnum,
      this.posx,
      this.posy,
    );
    this.globparaceilclip = 1;
    this.globparaflorclip = 1;
    if (this.posz < camZ.ceilz) this.globparaceilclip = 0;
    if (this.posz > camZ.florz) this.globparaflorclip = 0;

    this.gotSectors.clear();
    this.numscans = 0;
    this.numbunches = 0;
    if (this.drawMasks) this.drawMasks.beginFrame();

    this.scansector(this.cursectnum);
    this.lastNumscans = this.numscans;
    const bunchesThisFrame = this.numbunches;

    // ENGINE.C drawrooms: while bunches remain, draw frontmost via bunchfront.
    let guard = 0;
    while (this.numbunches > 0 && guard++ < 512) {
      const closest = this.pickFrontBunch();
      this.drawalls(closest);

      this.numbunches--;
      this.bunchfirst[closest] = this.bunchfirst[this.numbunches];
      this.bunchlast[closest] = this.bunchlast[this.numbunches];
    }
    this.lastNumbunches = bunchesThisFrame;

    let openCols = 0;
    for (let x = 0; x < xdimen; x++) {
      if (this.umost[x] < this.dmost[x]) openCols++;
    }
    this.lastOpenCols = openCols;

    if (this.debugVisMode === 'coverage') {
      this.paintCoverageOverlay();
    } else {
      this.fillOpenColumns();
      if (this.drawMasks && this.debugVisMode === 'normal') {
        this.drawMasks.flush(this);
      }
    }
  }

  /**
   * Paint columns still open after drawrooms (magenta = never claimed by walls).
   * Green tick at mid = column was fully closed.
   */
  paintCoverageOverlay() {
    const xdimen = this.renderer.buffer.xdimen;
    const ydimen = this.renderer.buffer.ydimen;
    const mid = (ydimen / 2) | 0;
    for (let x = 0; x < xdimen; x++) {
      const u = this.umost[x];
      const d = this.dmost[x];
      if (u < d) {
        // Unclaimed vertical span — visibility hole
        this.fillCol(x, u, d - 1, 168);
      } else {
        this.fillCol(x, mid, mid, 120);
      }
    }
  }

  /**
   * ENGINE.C drawrooms bunch pick — frontmost via bunchfront (not depth).
   * @returns {number}
   */
  pickFrontBunch() {
    const n = this.numbunches;
    if (n <= 1) return 0;

    /** @type {Uint8Array} */
    const seen = new Uint8Array(n);
    seen[0] = 1;
    let closest = 0;

    for (let i = 1; i < n; i++) {
      const j = this.bunchfront(i, closest);
      if (j < 0) continue;
      seen[i] = 1;
      if (j === 0) {
        seen[closest] = 1;
        closest = i;
      }
    }

    // Double-check (ENGINE.C). Cap swaps so inconsistent wallfront cannot hang.
    let swaps = 0;
    const swapLimit = Math.max(16, n * 4);
    for (let i = 0; i < n; ) {
      if (seen[i]) {
        i++;
        continue;
      }
      const j = this.bunchfront(i, closest);
      if (j < 0) {
        i++;
        continue;
      }
      seen[i] = 1;
      if (j === 0) {
        seen[closest] = 1;
        closest = i;
        swaps++;
        if (swaps > swapLimit) break;
        i = 0;
        continue;
      }
      i++;
    }

    return closest;
  }

  /**
   * ENGINE.C scansector — collect wall scans + bunches; flood via sectorborder.
   * @param {number} sectnum
   */
  scansector(sectnum) {
    const board = this.board;
    if (!board || sectnum < 0 || sectnum >= board.numsectors) return;
    if (this.gotSectors.has(sectnum)) return;

    /** @type {number[]} ENGINE.C sectorborder[256] */
    const border = [sectnum];

    while (border.length > 0) {
      const sn = border.pop();
      if (sn === undefined || this.gotSectors.has(sn)) continue;
      this.gotSectors.add(sn);

      // ENGINE.C scansector: collect tsprites when sector is first visited
      if (this.drawMasks) this.drawMasks.queueSectorSprites(this, sn);

      const sec = board.sectors[sn];
      const startwall = sec.wallptr;
      const endwall = startwall + sec.wallnum;
      const bunchfrst = this.numbunches;
      const numscansbefore = this.numscans;
      let scanfirst = this.numscans;
      let xp1 = 0;
      let yp1 = 0;
      let xp2 = 0;
      let yp2 = 0;

      for (let z = startwall; z < endwall; z++) {
        const wal = board.walls[z];
        const wal2 = board.walls[wal.point2];
        const nextsectnum = wal.nextsector;

        const x1 = wal.x - this.posx;
        const y1 = wal.y - this.posy;
        const x2 = wal2.x - this.posx;
        const y2 = wal2.y - this.posy;

        // ENGINE.C: flood into nearby portal sectors (cross-product proximity).
        if (
          nextsectnum >= 0 &&
          (wal.cstat & 32) === 0 &&
          !this.gotSectors.has(nextsectnum) &&
          border.length < 256
        ) {
          const templong = (x1 * y2 - x2 * y1) | 0;
          if (templong >= -262144 && templong <= 262143) {
            const cross2 = mulscale5(templong, templong);
            const dx = x2 - x1;
            const dy = y2 - y1;
            if (cross2 <= dx * dx + dy * dy) {
              border.push(nextsectnum);
            }
          }
        }

        // ENGINE.C: reuse prior endpoint when walls are chained (point2 continuity).
        if (z === startwall || board.walls[z - 1].point2 !== z) {
          xp1 = dmulscale6(y1, this.cos, -x1, this.sin);
          yp1 = dmulscale6(x1, this.cosVR, y1, this.sinVR);
        } else {
          xp1 = xp2;
          yp1 = yp2;
        }
        xp2 = dmulscale6(y2, this.cos, -x2, this.sin);
        yp2 = dmulscale6(x2, this.cosVR, y2, this.sinVR);

        this.tryAddWallScan(sn, z, xp1, yp1, xp2, yp2);

        // ENGINE.C: runs after skipitaddwall — even when this wall was rejected.
        // Closing only on successful adds orphans entire scan chains (no bunchfirst).
        if (wal.point2 < z && scanfirst < this.numscans) {
          this.p2[this.numscans - 1] = scanfirst;
          scanfirst = this.numscans;
        }
      }

      for (let z = numscansbefore; z < this.numscans; z++) {
        const nxt = this.p2[z];
        // Invalid next (past this sector's scans) → terminate; head is collected below.
        if (nxt < 0 || nxt >= this.numscans) {
          this.p2[z] = -1;
          continue;
        }
        if (
          board.walls[this.thewall[z]].point2 !== this.thewall[nxt] ||
          this.xb2[z] >= this.xb1[nxt]
        ) {
          this.bunchfirst[this.numbunches++] = this.p2[z];
          this.p2[z] = -1;
        }
      }

      // Any scan still linked from a prior node is not a head. Heads with no
      // bunchfirst (linear chains that never hit the break condition) would
      // never draw — collect them. ENGINE.C relies on cycles + breaks; we
      // also mark true heads after the break pass.
      if (this.numscans > numscansbefore) {
        const reachable = new Uint8Array(this.numscans);
        for (let z = numscansbefore; z < this.numscans; z++) {
          const nxt = this.p2[z];
          if (nxt >= numscansbefore && nxt < this.numscans) reachable[nxt] = 1;
        }
        for (let b = bunchfrst; b < this.numbunches; b++) {
          let s = this.bunchfirst[b];
          for (let n = 0; n < MAX_SCANS && s >= 0; n++) {
            reachable[s] = 1;
            s = this.p2[s];
          }
        }
        for (let z = numscansbefore; z < this.numscans; z++) {
          if (reachable[z]) continue;
          // True head of an undrawn chain
          this.bunchfirst[this.numbunches++] = z;
          reachable[z] = 1;
          let s = this.p2[z];
          for (let n = 0; n < MAX_SCANS && s >= 0; n++) {
            reachable[s] = 1;
            s = this.p2[s];
          }
        }
      }

      for (let z = bunchfrst; z < this.numbunches; z++) {
        this.bunchlast[z] = this.scanChainEnd(this.bunchfirst[z]);
      }
    }
  }

  /**
   * Walk p2 chain to last node; break cycles (closed wall loops).
   * @param {number} start
   * @returns {number}
   */
  scanChainEnd(start) {
    let zz = start;
    for (let n = 0; n < MAX_SCANS; n++) {
      const nxt = this.p2[zz];
      if (nxt < 0) return zz;
      if (nxt === start) {
        // Unbroken polygon cycle — force a break
        this.p2[zz] = -1;
        return zz;
      }
      zz = nxt;
    }
    this.p2[zz] = -1;
    return zz;
  }

  /**
   * Iterate scans in a bunch with cycle protection.
   * @param {number} start
   * @param {(scan: number) => void} fn
   */
  forBunchScans(start, fn) {
    let s = start;
    for (let n = 0; n < MAX_SCANS && s >= 0; n++) {
      fn(s);
      const nxt = this.p2[s];
      if (nxt === start) break;
      s = nxt;
    }
  }

  /**
   * ENGINE.C scansector wall projection (integer path — no float near-clip).
   * Angle-sensitive vanishing usually comes from wrong clip/facing here.
   * @param {number} sectnum
   * @param {number} wallIndex
   * @param {number} xp1
   * @param {number} yp1
   * @param {number} xp2
   * @param {number} yp2
   * @returns {boolean}
   */
  tryAddWallScan(sectnum, wallIndex, xp1, yp1, xp2, yp2) {
    if (this.numscans >= MAX_SCANS - 1) return false;
    const { buffer } = this.renderer;
    const half = buffer.halfxdimen;
    const xdimen = buffer.xdimen;

    if (yp1 < NEAR_Y && yp2 < NEAR_Y) return false;

    // ENGINE.C: dmulscale32(xp1,yp2,-xp2,yp1) >= 0 → wall NOT facing you
    if (dmulscale32(xp1, yp2, -xp2, yp1) >= 0) return false;

    let xb1;
    let xb2;
    let yb1;
    let yb2;

    if (xp1 >= -yp1) {
      if (xp1 > yp1 || yp1 === 0) return false;
      xb1 = half + scaleInt(xp1, half, yp1);
      if (xp1 >= 0) xb1++; // SIGNED divide fix
      if (xb1 >= xdimen) xb1 = xdimen - 1;
      yb1 = yp1;
    } else {
      if (xp2 < -yp2) return false;
      xb1 = 0;
      const templong = yp1 - yp2 + xp1 - xp2;
      if (templong === 0) return false;
      yb1 = yp1 + scaleInt(yp2 - yp1, xp1 + yp1, templong);
    }
    if (yb1 < NEAR_Y) return false;

    if (xp2 <= yp2) {
      if (xp2 < -yp2 || yp2 === 0) return false;
      xb2 = half + scaleInt(xp2, half, yp2) - 1;
      if (xp2 >= 0) xb2++; // SIGNED divide fix
      if (xb2 >= xdimen) xb2 = xdimen - 1;
      yb2 = yp2;
    } else {
      if (xp1 > yp1) return false;
      xb2 = xdimen - 1;
      const templong = xp2 - xp1 + yp1 - yp2;
      if (templong === 0) return false;
      yb2 = yp1 + scaleInt(yp2 - yp1, yp1 - xp1, templong);
    }
    if (yb2 < NEAR_Y || xb1 > xb2) return false;

    const n = this.numscans;
    this.xb1[n] = xb1;
    this.xb2[n] = xb2;
    this.yb1[n] = yb1;
    this.yb2[n] = yb2;
    this.rx1[n] = xp1;
    this.ry1[n] = yp1;
    this.rx2[n] = xp2;
    this.ry2[n] = yp2;
    this.thesector[n] = sectnum;
    this.thewall[n] = wallIndex;
    this.p2[n] = n + 1;
    this.numscans++;
    return true;
  }

  /**
   * @param {number} l1 scan index
   * @param {number} l2 scan index
   * @returns {number} 1 if l1 in front, 0 if l2 in front, -1 inconclusive
   */
  wallfront(l1, l2) {
    const board = this.board;
    const wal1 = board.walls[this.thewall[l1]];
    const wal1b = board.walls[wal1.point2];
    const wal2 = board.walls[this.thewall[l2]];
    const wal2b = board.walls[wal2.point2];

    const x11 = wal1.x;
    const y11 = wal1.y;
    const x21 = wal1b.x;
    const y21 = wal1b.y;
    const x12 = wal2.x;
    const y12 = wal2.y;
    const x22 = wal2b.x;
    const y22 = wal2b.y;

    const dx = x21 - x11;
    const dy = y21 - y11;
    let t1 = dmul2(x12 - x11, dy, -dx, y12 - y11);
    let t2 = dmul2(x22 - x11, dy, -dx, y22 - y11);
    if (t1 === 0) {
      t1 = t2;
      if (t1 === 0) return -1;
    }
    if (t2 === 0) t2 = t1;
    if ((t1 ^ t2) >= 0) {
      t2 = dmul2(this.posx - x11, dy, -dx, this.posy - y11);
      return (t2 ^ t1) >= 0 ? 1 : 0;
    }

    const dx2 = x22 - x12;
    const dy2 = y22 - y12;
    t1 = dmul2(x11 - x12, dy2, -dx2, y11 - y12);
    t2 = dmul2(x21 - x12, dy2, -dx2, y21 - y12);
    if (t1 === 0) {
      t1 = t2;
      if (t1 === 0) return -1;
    }
    if (t2 === 0) t2 = t1;
    if ((t1 ^ t2) >= 0) {
      t2 = dmul2(this.posx - x12, dy2, -dx2, this.posy - y12);
      return (t2 ^ t1) < 0 ? 1 : 0;
    }
    return -2; // ENGINE.C inconclusive
  }

  /**
   * @param {number} b1
   * @param {number} b2
   * @returns {number}
   */
  bunchfront(b1, b2) {
    const b1f = this.bunchfirst[b1];
    const x1b1 = this.xb1[b1f];
    const x2b2 = this.xb2[this.bunchlast[b2]] + 1;
    if (x1b1 >= x2b2) return -1;
    const b2f = this.bunchfirst[b2];
    const x1b2 = this.xb1[b2f];
    const x2b1 = this.xb2[this.bunchlast[b1]] + 1;
    if (x1b2 >= x2b1) return -1;

    if (x1b1 >= x1b2) {
      let i = b2f;
      for (let n = 0; n < MAX_SCANS && this.xb2[i] < x1b1; n++) {
        const nxt = this.p2[i];
        if (nxt < 0) break;
        i = nxt;
      }
      return this.wallfront(b1f, i);
    }
    let i = b1f;
    for (let n = 0; n < MAX_SCANS && this.xb2[i] < x1b2; n++) {
      const nxt = this.p2[i];
      if (nxt < 0) break;
      i = nxt;
    }
    return this.wallfront(i, b2f);
  }

  /**
   * ENGINE.C drawalls — floors/ceils from uplc/dplc, then walls, then scan next.
   * @param {number} bunch
   */
  drawalls(bunch) {
    const board = this.board;
    const { buffer } = this.renderer;
    let z = this.bunchfirst[bunch];
    const sectnum = this.thesector[z];
    const sec = board.sectors[sectnum];

    this._ceilScan = setupFlatScan({
      sec,
      board,
      art: this.art,
      isCeil: true,
      posx: this.posx,
      posy: this.posy,
      posz: this.posz,
      cos: this.cos,
      sin: this.sin,
      viewingrangerecip: buffer.viewingrangerecip ?? 65536,
      halfxdimen: buffer.halfxdimen,
    });
    this._florScan = setupFlatScan({
      sec,
      board,
      art: this.art,
      isCeil: false,
      posx: this.posx,
      posy: this.posy,
      posz: this.posz,
      cos: this.cos,
      sin: this.sin,
      viewingrangerecip: buffer.viewingrangerecip ?? 65536,
      halfxdimen: buffer.halfxdimen,
    });
    // Slopes still use FlatPlane (grouscan later)
    this._ceilPlane = this._ceilScan
      ? null
      : setupFlatPlane({
          sec,
          isCeil: true,
          posz: this.posz,
          art: this.art,
          board,
        });
    this._florPlane = this._florScan
      ? null
      : setupFlatPlane({
          sec,
          isCeil: false,
          posz: this.posz,
          art: this.art,
          board,
        });
    this._skyCeil = (sec.ceilingstat & 1) !== 0;
    this._skyFlor = (sec.floorstat & 1) !== 0;

    // uplc/dplc for every pixel covered by a wall in this bunch
    const xdimen = this.renderer.buffer.xdimen;
    const ydimen = this.renderer.buffer.ydimen;
    const first = this.bunchfirst[bunch];
    const last = this.bunchlast[bunch];
    // ENGINE.C: ceilscan/florscan(xb1[bunchfirst], xb2[bunchlast]) — chain is L→R.
    let xLo = this.xb1[first];
    let xHi = this.xb2[last];
    if (xHi < xLo) {
      // Safety if a chain is still unsorted: fall back to min/max
      xLo = xdimen;
      xHi = -1;
      this.forBunchScans(first, (s) => {
        if (this.xb1[s] < xLo) xLo = this.xb1[s];
        if (this.xb2[s] > xHi) xHi = this.xb2[s];
      });
    }
    if (xHi < xLo) return;

    for (let x = xLo; x <= xHi; x++) {
      this.uplc[x] = 0;
      this.dplc[x] = ydimen;
    }

    let andwstat1 = 0xff;
    let andwstat2 = 0xff;
    this.forBunchScans(first, (s) => {
      andwstat1 &= this.wallMost(this.uplc, s, sectnum, false);
      andwstat2 &= this.wallMost(this.dplc, s, sectnum, true);
    });

    if ((andwstat1 & 3) !== 3 || (andwstat2 & 12) !== 12) {
      this.drawBunchPlanes(
        sectnum,
        xLo,
        xHi,
        (andwstat1 & 3) !== 3,
        (andwstat2 & 12) !== 12,
      );
    }

    this.forBunchScans(first, (s) => {
      this.drawallsWall(s);
    });
  }

  /**
   * ENGINE.C wallmost — flat → owallmost; sloped → Z at wall ends + same frustum clip.
   * (Full vanilla view-ray slope Z is incomplete here — do not half-port without
   * verifying globals: cos/sin viewingrange, krecipasm table, owallmost path.)
   * @param {Int16Array} mostbuf
   * @param {number} scan
   * @param {number} sectnum
   * @param {boolean} isFloor
   * @returns {number} bad flags
   */
  wallMost(mostbuf, scan, sectnum, isFloor) {
    const board = this.board;
    const sec = board.sectors[sectnum];
    const zFlat = (isFloor ? sec.floorz : sec.ceilingz) - this.posz;
    const sloped = isFloor
      ? (sec.floorstat & 2) !== 0
      : (sec.ceilingstat & 2) !== 0;

    // ENGINE.C: non-slope (or first wall of sector) → constant-Z owallmost
    if (!sloped || this.thewall[scan] === sec.wallptr) {
      return this.owallMost(mostbuf, scan, zFlat);
    }

    const wal = board.walls[this.thewall[scan]];
    const wal2 = board.walls[wal.point2];
    const z1s = getzsofslope(board, sectnum, wal.x, wal.y);
    const z2s = getzsofslope(board, sectnum, wal2.x, wal2.y);
    const z1 = ((isFloor ? z1s.florz : z1s.ceilz) - this.posz) << 7;
    const z2 = ((isFloor ? z2s.florz : z2s.ceilz) - this.posz) << 7;
    return this.owallMostVarying(mostbuf, scan, z1, z2);
  }

  /**
   * ENGINE.C owallmost — clip constant Z plane to view frustum, then lerp.
   * @param {Int16Array} mostbuf
   * @param {number} w
   * @param {number} zRel floorz/ceilingz − posz (not <<7)
   * @returns {number}
   */
  owallMost(mostbuf, w, zRel) {
    const z = zRel << 7;
    return this.owallMostVarying(mostbuf, w, z, z);
  }

  /**
   * Shared owallmost / wallmost span fill with optional different endpoint Z (<<7).
   * @param {Int16Array} mostbuf
   * @param {number} w
   * @param {number} z1 already <<7 relative
   * @param {number} z2 already <<7 relative
   * @returns {number}
   */
  owallMostVarying(mostbuf, w, z1, z2) {
    const ydimen = this.renderer.buffer.ydimen;
    const xdimen = this.renderer.buffer.xdimen;
    const yb1 = this.yb1[w];
    const yb2 = this.yb2[w];
    const xb1 = this.xb1[w];
    const xb2 = this.xb2[w];
    if (xb1 > xb2) return 0;

    const s1 = mulscale20(this.globaluclip, yb1);
    const s2 = mulscale20(this.globaluclip, yb2);
    const s3 = mulscale20(this.globaldclip, yb1);
    const s4 = mulscale20(this.globaldclip, yb2);
    let bad =
      (z1 < s1 ? 1 : 0) +
      (z2 < s2 ? 2 : 0) +
      (z1 > s3 ? 4 : 0) +
      (z2 > s4 ? 8 : 0);

    let ix1 = xb1;
    let ix2 = xb2;
    let iy1 = yb1;
    let iy2 = yb2;
    let zz1 = z1;
    let zz2 = z2;
    const oz1 = z1;
    const oz2 = z2;
    const sameZ = z1 === z2;

    if ((bad & 3) === 3) {
      this.fillMost(mostbuf, ix1, ix2 - ix1 + 1, 0);
      return bad;
    }
    if ((bad & 12) === 12) {
      this.fillMost(mostbuf, ix1, ix2 - ix1 + 1, ydimen);
      return bad;
    }

    if (bad & 3) {
      // ENGINE.C owallmost: constant-Z uses (s2-s1); sloped uses (s2-s1+oz1-oz2)
      const denom = sameZ ? s2 - s1 : s2 - s1 + oz1 - oz2;
      const t = divscale30(oz1 - s1, denom);
      const inty = yb1 + mulscale30(yb2 - yb1, t);
      const intz = sameZ ? oz1 : oz1 + mulscale30(oz2 - oz1, t);
      // ENGINE.C does not clamp xcross
      const xcross =
        xb1 + scaleInt(mulscale30(yb2, t), xb2 - xb1, inty);
      if ((bad & 3) === 2) {
        if (xb1 <= xcross) {
          zz2 = intz;
          iy2 = inty;
          ix2 = xcross;
        }
        this.fillMost(mostbuf, xcross + 1, xb2 - xcross, 0);
      } else {
        if (xcross <= xb2) {
          zz1 = intz;
          iy1 = inty;
          ix1 = xcross;
        }
        this.fillMost(mostbuf, xb1, xcross - xb1 + 1, 0);
      }
    }

    if (bad & 12) {
      const denom = sameZ ? s4 - s3 : s4 - s3 + oz1 - oz2;
      const t = divscale30(oz1 - s3, denom);
      const inty = yb1 + mulscale30(yb2 - yb1, t);
      const intz = sameZ ? oz1 : oz1 + mulscale30(oz2 - oz1, t);
      const xcross =
        xb1 + scaleInt(mulscale30(yb2, t), xb2 - xb1, inty);
      if ((bad & 12) === 8) {
        if (xb1 <= xcross) {
          zz2 = intz;
          iy2 = inty;
          ix2 = xcross;
        }
        this.fillMost(mostbuf, xcross + 1, xb2 - xcross, ydimen);
      } else {
        if (xcross <= xb2) {
          zz1 = intz;
          iy1 = inty;
          ix1 = xcross;
        }
        this.fillMost(mostbuf, xb1, xcross - xb1 + 1, ydimen);
      }
    }

    if (ix1 > ix2) return bad;
    const count = ix2 - ix1 + 1;
    // ENGINE.C: scale(..., iy) with no floor-to-1; iy is post-near-clip depth
    let y = scaleInt(zz1, this.xdimenscale, iy1) << 4;
    const yinc =
      (((scaleInt(zz2, this.xdimenscale, iy2) << 4) - y) / count) | 0;
    this.interpMost(mostbuf, ix1, count, y + (this.globalhoriz << 16), yinc);

    // ENGINE.C clamps endpoints only
    if (mostbuf[ix1] < 0) mostbuf[ix1] = 0;
    if (mostbuf[ix1] > ydimen) mostbuf[ix1] = ydimen;
    if (mostbuf[ix2] < 0) mostbuf[ix2] = 0;
    if (mostbuf[ix2] > ydimen) mostbuf[ix2] = ydimen;
    return bad;
  }

  /** @param {number} x @param {number} lo @param {number} hi */
  clampX(x, lo, hi) {
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x | 0;
  }

  /**
   * @param {Int16Array} mostbuf
   * @param {number} x0
   * @param {number} n
   * @param {number} val
   */
  fillMost(mostbuf, x0, n, val) {
    if (n <= 0) return;
    const xdimen = this.renderer.buffer.xdimen;
    let start = x0 | 0;
    let end = start + (n | 0);
    if (start < 0) start = 0;
    if (end > xdimen) end = xdimen;
    for (let x = start; x < end; x++) mostbuf[x] = val;
  }

  /**
   * qinterpolatedown16short
   * @param {Int16Array} mostbuf
   * @param {number} x0
   * @param {number} n
   * @param {number} y16
   * @param {number} yinc
   */
  interpMost(mostbuf, x0, n, y16, yinc) {
    let y = y16 | 0;
    const inc = yinc | 0;
    for (let i = 0; i < n; i++) {
      mostbuf[x0 + i] = y >> 16;
      y += inc;
    }
  }

  /**
   * @param {number} sectnum
   * @param {number} x1
   * @param {number} x2
   * @param {boolean} drawCeil
   * @param {boolean} drawFlor
   */
  drawBunchPlanes(sectnum, x1, x2, drawCeil = true, drawFlor = true) {
    if (this.debugVisMode === 'wallsOnly') return;

    const sec = this.board.sectors[sectnum];

    for (let x = x1; x <= x2; x++) {
      if (this.umost[x] >= this.dmost[x]) continue;

      if (drawCeil) {
        if (this._skyCeil) {
          // ENGINE.C parascan ceiling: topptr=umost, botptr=uplc (not dmost!)
          const skyBot = Math.min(this.dmost[x], Math.max(this.umost[x], this.uplc[x]));
          if (skyBot > this.umost[x]) {
            this.drawSkyCol(x, this.umost[x], skyBot - 1, sec, true);
          }
        } else {
          const cBot = Math.min(this.dmost[x], Math.max(this.umost[x], this.uplc[x]));
          if (cBot > this.umost[x]) {
            this.drawPlaneCol(
              x,
              this.umost[x],
              cBot - 1,
              this._ceilScan,
              this._ceilPlane,
              shadeColor(sec.ceilingshade, 18),
            );
          }
        }
      }

      if (!drawFlor) continue;

      const fTop = Math.max(this.umost[x], Math.min(this.dmost[x], this.dplc[x]));
      const fBot = this.dmost[x];
      if (fBot > fTop) {
        if (this._skyFlor) {
          this.drawSkyCol(x, fTop, fBot - 1, sec, false);
        } else {
          this.drawPlaneCol(
            x,
            fTop,
            fBot - 1,
            this._florScan,
            this._florPlane,
            shadeColor(sec.floorshade, 40),
          );
        }
      }
    }
  }

  /**
   * One wall of a bunch (portal strips / solid + scansector next).
   * @param {number} scan
   */
  drawallsWall(scan) {
    const board = this.board;
    const sectnum = this.thesector[scan];
    const sec = board.sectors[sectnum];
    const wallnum = this.thewall[scan];
    const wal = board.walls[wallnum];
    const x1 = this.xb1[scan];
    const x2 = this.xb2[scan];
    const nextsectnum = wal.nextsector;
    const nextsec =
      nextsectnum >= 0 ? board.sectors[nextsectnum] : null;

    // Skip if fully occluded — ENGINE.C still stores smost type 0
    let any = false;
    for (let x = x1; x <= x2; x++) {
      if (this.umost[x] < this.dmost[x]) {
        any = true;
        break;
      }
    }
    if (!any) {
      if (this.drawMasks) this.drawMasks.addSmostType0(scan);
      return;
    }

    const z0 = getzsofslope(board, sectnum, wal.x, wal.y);
    const z1 = getzsofslope(
      board,
      sectnum,
      board.walls[wal.point2].x,
      board.walls[wal.point2].y,
    );

    if (nextsectnum >= 0 && (wal.cstat & 32) === 0 && nextsec) {
      const nz0 = getzsofslope(board, nextsectnum, wal.x, wal.y);
      const nz1 = getzsofslope(
        board,
        nextsectnum,
        board.walls[wal.point2].x,
        board.walls[wal.point2].y,
      );
      const nzCam = getzsofslope(
        board,
        nextsectnum,
        this.posx,
        this.posy,
      );

      // ENGINE.C cz/fz:
      // [0],[1] = this sector ends; [2],[3] = next sector ends; [4] = next at camera
      const cz0 = z0.ceilz;
      const cz1 = z1.ceilz;
      const cz2 = nz0.ceilz;
      const cz3 = nz1.ceilz;
      const cz4 = nzCam.ceilz;
      const fz0 = z0.florz;
      const fz1 = z1.florz;
      const fz2 = nz0.florz;
      const fz3 = nz1.florz;
      const fz4 = nzCam.florz;

      const doUpper =
        (sec.ceilingstat & 1) === 0 || (nextsec.ceilingstat & 1) === 0;
      const doLower =
        (sec.floorstat & 1) === 0 || (nextsec.floorstat & 1) === 0;

      const smostMark = this.drawMasks ? this.drawMasks.markSmost() : null;

      const tilenum = wal.picnum & 0xffff;
      this.art.loadtile(tilenum);
      const xsiz = Math.max(1, this.art.tilesizx[tilenum] | 0);
      const ysiz = Math.max(1, this.art.tilesizy[tilenum] | 0);
      const walxrepeat = (wal.xrepeat || 8) << 3;
      const yrepeat = wal.yrepeat || 8;
      this.prepwallScan(scan, walxrepeat, wal.cstat);

      const shade = Math.min(
        this.renderer.palookup.numShades - 1,
        Math.max(0, wal.shade | 0),
      );
      const shiftVal = tileYShift(ysiz);

      // ——— Ceiling / upper ———
      if (doUpper) {
        if (cz2 <= cz0 && cz3 <= cz1) {
          if (this.globparaceilclip) {
            for (let x = x1; x <= x2; x++) {
              if (this.uplc[x] > this.umost[x] && this.umost[x] <= this.dmost[x]) {
                this.umost[x] = this.uplc[x];
              }
            }
          }
        } else {
          this.wallMost(this.dwall, scan, nextsectnum, false);
          if (cz2 > fz0 || cz3 > fz1) {
            for (let i = x1; i <= x2; i++) {
              if (this.dwall[i] > this.dplc[i]) this.dwall[i] = this.dplc[i];
            }
          }

          const zRef =
            (wal.cstat & 4) === 0 ? nextsec.ceilingz : sec.ceilingz;
          let gys = yrepeat << (shiftVal - 19);
          let gzd = ((this.posz - zRef) * gys) << 8;
          gzd += (wal.ypanning || 0) << 24;
          if (wal.cstat & 256) {
            gys = -gys;
            gzd = -gzd;
          }

          for (let x = x1; x <= x2; x++) {
            if (this.umost[x] > this.dmost[x]) continue;
            const u0 = Math.max(this.umost[x], this.uplc[x]);
            const u1y = Math.min(this.dmost[x], this.dwall[x]);
            if (u1y > u0) {
              let texU = this.lwall[x];
              texU += wal.xpanning || 0;
              this.drawWallCol(
                x,
                u0,
                u1y - 1,
                tilenum,
                positiveMod(texU, xsiz),
                ysiz,
                shade,
                this.swall[x],
                gys,
                gzd,
                shiftVal,
              );
            }
          }

          if (cz2 >= cz0 && cz3 >= cz1) {
            for (let x = x1; x <= x2; x++) {
              if (this.umost[x] > this.dmost[x]) continue;
              if (this.dwall[x] > this.umost[x]) this.umost[x] = this.dwall[x];
            }
          } else {
            for (let x = x1; x <= x2; x++) {
              if (this.umost[x] > this.dmost[x]) continue;
              const i = Math.max(this.uplc[x], this.dwall[x]);
              if (i > this.umost[x]) this.umost[x] = i;
            }
          }
        }
        // ENGINE.C: save umost when next ceiling is lower / camera above next ceil
        if (
          this.drawMasks &&
          (cz2 < cz0 || cz3 < cz1 || this.posz < cz4)
        ) {
          this.drawMasks.addSmostUmost(scan, x1, x2, this.umost);
        }
      }

      // ——— Floor / lower ———
      if (doLower) {
        if (fz2 >= fz0 && fz3 >= fz1) {
          if (this.globparaflorclip) {
            for (let x = x1; x <= x2; x++) {
              if (this.dplc[x] < this.dmost[x] && this.umost[x] <= this.dmost[x]) {
                this.dmost[x] = this.dplc[x];
              }
            }
          }
        } else {
          this.wallMost(this.uwall, scan, nextsectnum, true);
          if (fz2 < cz0 || fz3 < cz1) {
            for (let i = x1; i <= x2; i++) {
              if (this.uwall[i] < this.uplc[i]) this.uwall[i] = this.uplc[i];
            }
          }

          const botTile =
            (wal.cstat & 2) !== 0 ? wal.overpicnum & 0xffff : tilenum;
          this.art.loadtile(botTile);
          const by = Math.max(1, this.art.tilesizy[botTile] | 0);
          const bx = Math.max(1, this.art.tilesizx[botTile] | 0);
          const bShift = tileYShift(by);
          const lowerZRef =
            (wal.cstat & 4) === 0 ? nextsec.floorz : sec.ceilingz;
          let gys = yrepeat << (bShift - 19);
          let gzd = ((this.posz - lowerZRef) * gys) << 8;
          gzd += (wal.ypanning || 0) << 24;
          if (wal.cstat & 256) {
            gys = -gys;
            gzd = -gzd;
          }

          for (let x = x1; x <= x2; x++) {
            if (this.umost[x] > this.dmost[x]) continue;
            const l0 = Math.max(this.umost[x], this.uwall[x]);
            const l1 = Math.min(this.dmost[x], this.dplc[x]);
            if (l1 > l0) {
              let texU = this.lwall[x];
              texU += wal.xpanning || 0;
              this.drawWallCol(
                x,
                l0,
                l1 - 1,
                botTile,
                positiveMod(texU, bx),
                by,
                shade,
                this.swall[x],
                gys,
                gzd,
                bShift,
              );
            }
          }

          if (fz2 <= fz0 && fz3 <= fz1) {
            for (let x = x1; x <= x2; x++) {
              if (this.umost[x] > this.dmost[x]) continue;
              if (this.uwall[x] < this.dmost[x]) this.dmost[x] = this.uwall[x];
            }
          } else {
            for (let x = x1; x <= x2; x++) {
              if (this.umost[x] > this.dmost[x]) continue;
              const i = Math.min(this.dplc[x], this.uwall[x]);
              if (i < this.dmost[x]) this.dmost[x] = i;
            }
          }
        }
        // ENGINE.C: save dmost when next floor is higher / camera below next floor
        if (
          this.drawMasks &&
          (fz2 > fz0 || fz3 > fz1 || this.posz > fz4)
        ) {
          this.drawMasks.addSmostDmost(scan, x1, x2, this.dmost);
        }
      }

      // Queue next sector (ENGINE.C: only if not already gotsector)
      if (!this.gotSectors.has(nextsectnum)) {
        let canSee = this.umost[x2] < this.dmost[x2];
        if (!canSee) {
          for (let x = x1; x < x2; x++) {
            if (this.umost[x] < this.dmost[x]) {
              canSee = true;
              break;
            }
          }
        }
        if (canSee) {
          this.scansector(nextsectnum);
        } else if (this.drawMasks && smostMark) {
          // Can't see beyond — cancel portal smost, store solid type 0
          this.drawMasks.restoreSmost(smostMark);
          this.drawMasks.addSmostType0(scan);
        }
      }
    } else {
      // Solid / 1-way wall
      const tilenum =
        nextsectnum < 0 ? wal.picnum & 0xffff : wal.overpicnum & 0xffff;
      this.art.loadtile(tilenum);
      const xsiz = Math.max(1, this.art.tilesizx[tilenum] | 0);
      const ysiz = Math.max(1, this.art.tilesizy[tilenum] | 0);
      const walxrepeat = (wal.xrepeat || 8) << 3;
      const yrepeat = wal.yrepeat || 8;
      this.prepwallScan(scan, walxrepeat, wal.cstat);
      const shade = Math.min(
        this.renderer.palookup.numShades - 1,
        Math.max(0, wal.shade | 0),
      );
      const shiftVal = tileYShift(ysiz);
      let globalyscale = yrepeat << (shiftVal - 19);
      let globalzd = ((this.posz - sec.ceilingz) * globalyscale) << 8;
      globalzd += (wal.ypanning || 0) << 24;
      if (wal.cstat & 256) {
        globalyscale = -globalyscale;
        globalzd = -globalzd;
      }

      for (let x = x1; x <= x2; x++) {
        if (this.umost[x] >= this.dmost[x]) continue;
        const w0 = Math.max(this.umost[x], this.uplc[x]);
        const w1 = Math.min(this.dmost[x], this.dplc[x]);
        if (w1 > w0) {
          let texU = this.lwall[x];
          texU += wal.xpanning || 0;
          this.drawWallCol(
            x,
            w0,
            w1 - 1,
            tilenum,
            positiveMod(texU, xsiz),
            ysiz,
            shade,
            this.swall[x],
            globalyscale,
            globalzd,
            shiftVal,
          );
        }
        this.umost[x] = 1;
        this.dmost[x] = 0;
      }
      if (this.drawMasks) this.drawMasks.addSmostType0(scan);
    }
  }

  /**
   * ENGINE.C prepwall — 4-wide lwall/swall (do not step top/bot per pixel).
   * Per-pixel top/bot stepping warps U/V badly when close at FOV edges.
   * @param {number} scan
   * @param {number} walxrepeat
   * @param {number} [cstat]
   */
  prepwallScan(scan, walxrepeat, cstat = 0) {
    const { buffer } = this.renderer;
    const half = buffer.halfxdimen;
    const xdimen = buffer.xdimen;
    const xb1 = this.xb1[scan];
    const xb2 = this.xb2[scan];
    if (xb2 < xb1) return;

    const rx1 = this.rx1[scan];
    const ry1 = this.ry1[scan];
    const rx2 = this.rx2[scan];
    const ry2 = this.ry2[scan];

    let i = xb1 - half;
    const topinc = -(ry1 >> 2);
    const botinc = (ry2 - ry1) >> 8;
    let top = mulscale5(rx1, xdimen) + mulscale2(topinc, i);
    let bot = mulscale11(rx1 - rx2, xdimen) + mulscale2(botinc, i);
    const splc = mulscale19(ry1, this.xdimscale);
    const sinc = mulscale16(ry2 - ry1, this.xdimscale);

    let x = xb1;
    let l = 0;
    let ol = 0;

    // ENGINE.C: after swall, `l *= walxrepeat` — mid-column interp uses scaled l/ol.
    if (bot !== 0) {
      l = divscale12(top, bot);
      this.swall[x] = (mulscale21(l, sinc) + splc) | 0;
      l = Math.imul(l, walxrepeat);
      this.lwall[x] = (l >> 18) | 0;
    }

    while (x + 4 <= xb2) {
      top += topinc;
      bot += botinc;
      if (bot !== 0) {
        ol = l;
        l = divscale12(top, bot);
        this.swall[x + 4] = (mulscale21(l, sinc) + splc) | 0;
        l = Math.imul(l, walxrepeat);
        this.lwall[x + 4] = (l >> 18) | 0;
      }
      i = (ol + l) >> 1;
      this.lwall[x + 2] = (i >> 18) | 0;
      this.lwall[x + 1] = ((ol + i) >> 19) | 0;
      this.lwall[x + 3] = ((l + i) >> 19) | 0;
      this.swall[x + 2] = (this.swall[x] + this.swall[x + 4]) >> 1;
      this.swall[x + 1] = (this.swall[x] + this.swall[x + 2]) >> 1;
      this.swall[x + 3] = (this.swall[x + 4] + this.swall[x + 2]) >> 1;
      x += 4;
    }

    if (x + 2 <= xb2) {
      top += topinc >> 1;
      bot += botinc >> 1;
      if (bot !== 0) {
        ol = l;
        l = divscale12(top, bot);
        this.swall[x + 2] = (mulscale21(l, sinc) + splc) | 0;
        l = Math.imul(l, walxrepeat);
        this.lwall[x + 2] = (l >> 18) | 0;
      }
      this.lwall[x + 1] = ((l + ol) >> 19) | 0;
      this.swall[x + 1] = (this.swall[x] + this.swall[x + 2]) >> 1;
      x += 2;
    }

    if (x + 1 <= xb2) {
      bot += botinc >> 2;
      if (bot !== 0) {
        // Fresh unscaled l — mulscale18, not l*=walxrepeat then >>18
        l = divscale12(top + (topinc >> 2), bot);
        this.swall[x + 1] = (mulscale21(l, sinc) + splc) | 0;
        this.lwall[x + 1] = mulscale18(l, walxrepeat);
      }
    }

    if (this.lwall[xb1] < 0) this.lwall[xb1] = 0;
    if (walxrepeat > 0 && this.lwall[xb2] >= walxrepeat) {
      this.lwall[xb2] = walxrepeat - 1;
    }
    if (cstat & 8) {
      walxrepeat--;
      for (let xx = xb1; xx <= xb2; xx++) {
        this.lwall[xx] = walxrepeat - this.lwall[xx];
      }
    }
  }

  /** Used by DrawMasks wall sprites — ENGINE.C dmulscale6 path. */
  transform(wx, wy) {
    const x = wx - this.posx;
    const y = wy - this.posy;
    return {
      xp: dmulscale6(y, this.cos, -x, this.sin),
      yp: dmulscale6(x, this.cosVR, y, this.sinVR),
    };
  }

  zToScreen(zRel, iy) {
    const d = Math.max(NEAR_Y, iy | 0);
    const z = zRel << 7;
    return (this.globalhoriz + (z * this.xdimenscale) / (d * 4096)) | 0;
  }

  drawWallCol(x, y1, y2, tilenum, texX, ysiz, shade, swall, globalyscale, globalzd, vShift) {
    if (y2 < y1 || ysiz <= 0) return;
    const texcol = this.art.getColumn(tilenum, texX);
    if (!texcol) {
      // Missing ART column — skip (was solid palette 96)
      return;
    }
    const vinc = Math.imul(swall | 0, globalyscale | 0) | 0;
    const vplc =
      (globalzd + Math.imul(vinc, (y1 - this.globalhoriz + 1) | 0)) | 0;
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const wy = this.renderer.buffer.windowy1;
    this.renderer.vlines.draw({
      x: this.renderer.buffer.windowx1 + x,
      y1: y1 + wy,
      y2: y2 + wy,
      vplc,
      vinc,
      texcol,
      texHeight: ysiz,
      shadeOffset: shadeOff,
      vShift,
    });
  }

  drawPlaneCol(x, y1, y2, scan, plane, fallbackColor) {
    if (y2 < y1) return;
    // No setup → leave pixels as-is (do not paint solid debug palette colours)
    if (!scan && !plane) return;

    const shadeSrc = scan ? scan.shade : plane.shade;
    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, shadeSrc),
    );
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1, halfxdimen } =
      this.renderer.buffer;
    const screenX = windowx1 + x;
    const cam = {
      posx: this.posx,
      posy: this.posy,
      posz: this.posz,
      // World unproject uses ang trig (not viewingrange-scaled)
      cos: this.cos,
      sin: this.sin,
      halfxdimen,
      xdimenscale: this.xdimenscale,
      globalhoriz: this.globalhoriz,
      viewingrangerecip: this.renderer.buffer.viewingrangerecip ?? 65536,
    };
    for (let y = y1; y <= y2; y++) {
      let tex = -1;
      if (scan) {
        tex = sampleFlatScan(scan, this._horizLookup, x, y, this.globalhoriz);
      } else if (plane) {
        tex = sampleFlatPlane(plane, x, y, cam);
      }
      // Missed sample: skip (was opaque fallbackColor ≈ palette 18/40 — beige/rust)
      if (tex < 0) continue;
      pixels[ylookup[y + windowy1] + screenX] = tables[shadeOff + tex];
    }
  }

  drawSkyCol(x, y1, y2, sec, isCeil) {
    if (y2 < y1) return;
    const tilenum = (isCeil ? sec.ceilingpicnum : sec.floorpicnum) & 0xffff;
    this.art.loadtile(tilenum);
    const xsiz = this.art.tilesizx[tilenum] | 0;
    const ysiz = this.art.tilesizy[tilenum] | 0;
    if (xsiz <= 0 || ysiz <= 0) {
      // No sky tile — leave uncleared (was solid 18/40 debug fill)
      return;
    }
    const { buffer } = this.renderer;
    const half = buffer.halfxdimen || 1;
    const angOff = ((x - half) * 512) / Math.max(1, half);
    const skyAng = (this.ang + angOff) & BUILD_ANGLE_MASK;
    const texX = positiveMod(((skyAng * xsiz) / BUILD_ANGLES) | 0, xsiz);
    const col = this.art.getColumn(tilenum, texX);
    if (!col) {
      this.fillCol(x, y1, y2, isCeil ? 18 : 40);
      return;
    }
    const shade = Math.min(
      this.renderer.palookup.numShades - 1,
      Math.max(0, (isCeil ? sec.ceilingshade : sec.floorshade) | 0),
    );
    const shadeOff = this.renderer.palookup.shadeOffset(shade);
    const tables = this.renderer.palookup.tables;
    const { pixels, ylookup, windowx1, windowy1 } = buffer;
    const screenX = windowx1 + x;
    const ypan = (isCeil ? sec.ceilingypanning : sec.floorypanning) | 0;
    const mid = ysiz >> 1;
    for (let y = y1; y <= y2; y++) {
      let ty = mid + (y - this.globalhoriz) + ypan;
      ty = positiveMod(ty, ysiz);
      pixels[ylookup[y + windowy1] + screenX] = tables[shadeOff + (col[ty] & 255)];
    }
  }

  fillCol(x, y1, y2, color) {
    if (y2 < y1) return;
    const screenX = this.renderer.buffer.windowx1 + x;
    const wy = this.renderer.buffer.windowy1;
    this.renderer.vlines.drawSolid(screenX, y1 + wy, y2 + wy, color);
  }

  fillOpenColumns() {
    const board = this.board;
    if (!board) return;
    const sec = board.sectors[this.cursectnum];
    const xdimen = this.renderer.buffer.xdimen;
    for (let x = 0; x < xdimen; x++) {
      const u = this.umost[x];
      const d = this.dmost[x];
      if (u >= d) continue;
      if (sec && (sec.ceilingstat & 1) !== 0) {
        this.drawSkyCol(x, u, d - 1, sec, true);
      } else {
        this.fillCol(x, u, d - 1, 0);
      }
      this.umost[x] = d;
    }
  }
}

/** dmulscale2-ish for wallfront (coords fit in Number with BigInt). */
function dmul2(a, b, c, d) {
  return Number((BigInt(a) * BigInt(b) + BigInt(c) * BigInt(d)) >> 2n) | 0;
}

/** @param {number} shade @param {number} base */
function shadeColor(shade, base) {
  return Math.max(0, Math.min(255, base + shade * 2));
}

/** @param {number} v @param {number} m */
function positiveMod(v, m) {
  return ((v % m) + m) % m;
}

function tileYShift(ysiz) {
  let s = 0;
  while (s < 15 && (1 << s) < ysiz) s++;
  if ((1 << s) !== ysiz) s++;
  return 32 - s;
}
