/**
 * Deep dive: NW view from spawn into sec 230/307/neighbors —
 * solid walls, ceiling mismatches (hanging strips), MASKWALL sprites, fence tiles.
 * Usage: node scripts/probe-e1l1-spawn-nw.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GrpFile } from '../src/grp/GrpFile.js';
import { loadboard } from '../src/engine/BoardLoader.js';
import { pickSpawn, getzsofslope } from '../src/engine/SectorQuery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const grpPath = [
  path.join(root, 'assets', 'DUKE3D.GRP'),
  path.join(root, 'DUKE3D.GRP'),
].find((p) => fs.existsSync(p));

const PICNAMES = {
  5: 'MUSICANDSFX',
  40: 'AMMO',
  89: 'LA',
  346: 'tile346',
  595: 'GRATE1',
  596: 'BGRATE1',
  827: 'tile827',
  880: 'tile880',
  884: 'tile884',
  910: 'TREE2',
  911: 'CACTUS',
  913: 'MASKWALL2',
  914: 'MASKWALL3',
  915: 'MASKWALL4',
  1175: 'JAILBARBREAK',
  1225: 'BARBROKE',
  1405: 'APLAYER',
};

function picName(p) {
  p &= 0xffff;
  return PICNAMES[p] ?? `tile${p}`;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function wallMid(board, w) {
  const wal = board.walls[w];
  const p2 = board.walls[wal.point2];
  return { x: (wal.x + p2.x) / 2, y: (wal.y + p2.y) / 2 };
}

function sectorBounds(board, sectnum) {
  const sec = board.sectors[sectnum];
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let w = sec.wallptr; w < sec.wallptr + sec.wallnum; w++) {
    const wal = board.walls[w];
    minx = Math.min(minx, wal.x); maxx = Math.max(maxx, wal.x);
    miny = Math.min(miny, wal.y); maxy = Math.max(maxy, wal.y);
  }
  return { minx, maxx, miny, maxy };
}

function buildAng(x, y, tx, ty) {
  let a = -Math.atan2(ty - y, tx - x);
  return Math.round((a / (Math.PI * 2)) * 2048) & 2047;
}

function angDiff(a, b) {
  return ((a - b + 1024) & 2047) - 1024;
}

const LOOK = 1376;
const RADIUS = 6000;

const grp = GrpFile.fromBuffer(fs.readFileSync(grpPath).buffer);
const board = loadboard(grp.read('E1L1.MAP'));
const spawn = pickSpawn(board);
const spawnSec = board.sectors[306];

console.log('=== NW / neighbor deep probe ===');
console.log(`spawn=(-30652,6666) sect=306 ceilz=${spawnSec.ceilingz} floorz=${spawnSec.floorz} para=${(spawnSec.ceilingstat & 1) !== 0}`);

// BFS sectors reachable from 306 within a few portal hops, or XY near
const interesting = new Set([306, 230, 231, 232, 233, 236, 237, 251, 268, 307]);

// Expand: all sectors whose AABB is within RADIUS of spawn
for (let i = 0; i < board.numsectors; i++) {
  const b = sectorBounds(board, i);
  const cx = Math.min(Math.max(spawn.posx, b.minx), b.maxx);
  const cy = Math.min(Math.max(spawn.posy, b.miny), b.maxy);
  if (dist2(spawn.posx, spawn.posy, cx, cy) <= RADIUS * RADIUS) interesting.add(i);
}

console.log(`\n--- Sector summary (interesting=${interesting.size}) ---`);
const secs = [...interesting].sort((a, b) => a - b);
for (const i of secs) {
  const s = board.sectors[i];
  const b = sectorBounds(board, i);
  const midX = (b.minx + b.maxx) / 2;
  const midY = (b.miny + b.maxy) / 2;
  const bearing = buildAng(spawn.posx, spawn.posy, midX, midY);
  let solids = 0, portals = 0, masked = 0;
  const pics = new Map();
  for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
    const wal = board.walls[w];
    if (wal.nextsector < 0) solids++;
    else portals++;
    if (wal.cstat & 16) masked++;
    const p = wal.picnum & 0xffff;
    pics.set(p, (pics.get(p) || 0) + 1);
    if ((wal.overpicnum & 0xffff) !== 0) {
      const o = wal.overpicnum & 0xffff;
      pics.set(`over${o}`, (pics.get(`over${o}`) || 0) + 1);
    }
  }
  const picStr = [...pics.entries()].map(([p, n]) => `${typeof p === 'number' ? picName(p) + '(' + p + ')' : p}×${n}`).join(', ');
  console.log(
    `sec#${i} bearing=${bearing} Δ=${angDiff(bearing, LOOK)} ` +
      `floorz=${s.floorz} ceilz=${s.ceilingz} h=${Math.abs(s.floorz - s.ceilingz)} ` +
      `para=${(s.ceilingstat & 1) !== 0} cSlope=${(s.ceilingstat & 2) !== 0}(${s.ceilingheinum}) ` +
      `fSlope=${(s.floorstat & 2) !== 0}(${s.floorheinum}) ` +
      `walls=${s.wallnum} solid=${solids} portal=${portals} masked=${masked} ` +
      `size≈${b.maxx - b.minx}x${b.maxy - b.miny} ` +
      `fpic=${picName(s.floorpicnum)}(${s.floorpicnum & 0xffff}) cpic=${picName(s.ceilingpicnum)}(${s.ceilingpicnum & 0xffff}) ` +
      `pics=[${picStr}]`,
  );
}

// Solid walls in these sectors that would be sky-tall
console.log(`\n--- SOLID walls (nextsector=-1) in nearby sectors — sky-tall if drawn floor→ceilz ---`);
for (const i of secs) {
  const s = board.sectors[i];
  for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
    const wal = board.walls[w];
    if (wal.nextsector >= 0) continue;
    const mid = wallMid(board, w);
    const d = Math.hypot(mid.x - spawn.posx, mid.y - spawn.posy) | 0;
    if (d > RADIUS) continue;
    const p2 = board.walls[wal.point2];
    const bearing = buildAng(spawn.posx, spawn.posy, mid.x, mid.y);
    const h = Math.abs(s.floorz - s.ceilingz);
    console.log(
      `  sec#${i} wall#${w} SOLID dist=${d} bearing=${bearing} Δ=${angDiff(bearing, LOOK)} ` +
        `(${wal.x},${wal.y})->(${p2.x},${p2.y}) h≈${h} ` +
        `pic=${picName(wal.picnum)}(${wal.picnum & 0xffff}) over=${picName(wal.overpicnum)}(${wal.overpicnum & 0xffff}) ` +
        `cstat=${wal.cstat} masked=${(wal.cstat & 16) !== 0} rep=${wal.xrepeat}x${wal.yrepeat}`,
    );
  }
}

// Portal walls with ceiling OR floor mismatch (upper/lower step strips that can look like hanging chutes)
console.log(`\n--- Portal step strips near spawn (ceil or floor mismatch) — chute candidates ---`);
const steps = [];
for (const i of secs) {
  const s = board.sectors[i];
  for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
    const wal = board.walls[w];
    if (wal.nextsector < 0) continue;
    const ns = board.sectors[wal.nextsector];
    const mid = wallMid(board, w);
    const d = Math.hypot(mid.x - spawn.posx, mid.y - spawn.posy) | 0;
    if (d > RADIUS) continue;
    const zHere = getzsofslope(board, i, mid.x, mid.y);
    const zNext = getzsofslope(board, wal.nextsector, mid.x, mid.y);
    const ceilGap = zNext.ceilz - zHere.ceilz;
    const florGap = zNext.florz - zHere.florz;
    if (ceilGap === 0 && florGap === 0) continue;
    const p2 = board.walls[wal.point2];
    const bearing = buildAng(spawn.posx, spawn.posy, mid.x, mid.y);
    steps.push({
      i, w, next: wal.nextsector, d, bearing,
      lookDelta: angDiff(bearing, LOOK),
      ceilGap, florGap,
      x1: wal.x, y1: wal.y, x2: p2.x, y2: p2.y,
      pic: wal.picnum & 0xffff,
      over: wal.overpicnum & 0xffff,
      cstat: wal.cstat,
      masked: (wal.cstat & 16) !== 0,
      yrepeat: wal.yrepeat,
      xrepeat: wal.xrepeat,
      hereCeil: zHere.ceilz,
      nextCeil: zNext.ceilz,
      hereFlor: zHere.florz,
      nextFlor: zNext.florz,
    });
  }
}
steps.sort((a, b) => Math.abs(a.lookDelta) - Math.abs(b.lookDelta) || a.d - b.d);
for (const e of steps) {
  const kind = [];
  if (e.ceilGap !== 0) kind.push(`UPPERΔceil=${e.ceilGap}`);
  if (e.florGap !== 0) kind.push(`LOWERΔflor=${e.florGap}`);
  console.log(
    `  sec#${e.i}->#${e.next} wall#${e.w} dist=${e.d} bearing=${e.bearing} Δlook=${e.lookDelta} ` +
      `${kind.join(' ')} (${e.x1},${e.y1})->(${e.x2},${e.y2}) ` +
      `pic=${picName(e.pic)}(${e.pic}) over=${picName(e.over)}(${e.over}) ` +
      `masked=${e.masked} cstat=${e.cstat} rep=${e.xrepeat}x${e.yrepeat} ` +
      `here[c=${e.hereCeil},f=${e.hereFlor}] next[c=${e.nextCeil},f=${e.nextFlor}]`,
  );
}

// MASKWALL sprites (913+) — often look like fences / hanging panels
console.log(`\n--- MASKWALL* / fence-like sprites within ${RADIUS} ---`);
for (let i = 0; i < board.numsprites; i++) {
  const spr = board.sprites[i];
  const pic = spr.picnum & 0xffff;
  if (pic !== 913 && pic !== 914 && pic !== 915 && pic !== 595 && pic !== 596 && pic !== 1175 && pic !== 1225) {
    // also any wall-aligned sprite with metal-ish unnamed tiles near NW
    if (!((spr.cstat & 48) === 16 && dist2(spr.x, spr.y, spawn.posx, spawn.posy) <= RADIUS * RADIUS)) continue;
  }
  const d = Math.hypot(spr.x - spawn.posx, spr.y - spawn.posy) | 0;
  if (d > RADIUS) continue;
  const bearing = buildAng(spawn.posx, spawn.posy, spr.x, spr.y);
  const bits = [];
  if ((spr.cstat & 48) === 0) bits.push('face');
  if ((spr.cstat & 48) === 16) bits.push('wall');
  if ((spr.cstat & 48) === 32) bits.push('floor');
  if (spr.cstat & 1) bits.push('block');
  if (spr.cstat & 16) bits.push('onesided');
  console.log(
    `  spr#${i} ${picName(pic)}(${pic}) dist=${d} bearing=${bearing} Δ=${angDiff(bearing, LOOK)} ` +
      `sect=${spr.sectnum} xyz=(${spr.x},${spr.y},${spr.z}) ` +
      `z-spawnFloor=${spr.z - spawnSec.floorz} z-spawnCeil=${spr.z - spawnSec.ceilingz} ` +
      `rep=${spr.xrepeat}x${spr.yrepeat} cstat=${spr.cstat}[${bits.join('|')}] ang=${spr.ang & 2047}`,
  );
}

// Masked walls (cstat bit 4) near spawn
console.log(`\n--- Masked walls (cstat&16) within ${RADIUS} ---`);
for (let w = 0; w < board.numwalls; w++) {
  const wal = board.walls[w];
  if ((wal.cstat & 16) === 0) continue;
  const mid = wallMid(board, w);
  const d = Math.hypot(mid.x - spawn.posx, mid.y - spawn.posy) | 0;
  if (d > RADIUS) continue;
  const p2 = board.walls[wal.point2];
  const bearing = buildAng(spawn.posx, spawn.posy, mid.x, mid.y);
  // find owning sector
  let owner = -1;
  for (let i = 0; i < board.numsectors; i++) {
    const s = board.sectors[i];
    if (w >= s.wallptr && w < s.wallptr + s.wallnum) { owner = i; break; }
  }
  console.log(
    `  wall#${w} sec#${owner} dist=${d} bearing=${bearing} Δ=${angDiff(bearing, LOOK)} ` +
      `(${wal.x},${wal.y})->(${p2.x},${p2.y}) nextsec=${wal.nextsector} ` +
      `pic=${picName(wal.picnum)}(${wal.picnum & 0xffff}) over=${picName(wal.overpicnum)}(${wal.overpicnum & 0xffff}) ` +
      `cstat=${wal.cstat} rep=${wal.xrepeat}x${wal.yrepeat}`,
  );
}

// Detail dump: sector 230 (NW portal from 306 via wall 1797)
console.log(`\n--- Full wall loop: sec 230 (NW neighbor via wall#1797) ---`);
{
  const s = board.sectors[230];
  for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
    const wal = board.walls[w];
    const p2 = board.walls[wal.point2];
    const mid = wallMid(board, w);
    const bearing = buildAng(spawn.posx, spawn.posy, mid.x, mid.y);
    console.log(
      `  wall#${w} (${wal.x},${wal.y})->(${p2.x},${p2.y}) nextsec=${wal.nextsector} ` +
        `pic=${picName(wal.picnum)}(${wal.picnum & 0xffff}) over=${picName(wal.overpicnum)}(${wal.overpicnum & 0xffff}) ` +
        `cstat=${wal.cstat} rep=${wal.xrepeat}x${wal.yrepeat} bearing=${bearing} Δ=${angDiff(bearing, LOOK)}`,
    );
  }
}

console.log(`\n--- Full wall loop: sec 307 (contains MASKWALL2 sprites) ---`);
{
  const s = board.sectors[307];
  if (s) {
    console.log(`  floorz=${s.floorz} ceilz=${s.ceilingz} para=${(s.ceilingstat & 1) !== 0} walls=${s.wallnum}`);
    for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
      const wal = board.walls[w];
      const p2 = board.walls[wal.point2];
      console.log(
        `  wall#${w} (${wal.x},${wal.y})->(${p2.x},${p2.y}) nextsec=${wal.nextsector} ` +
          `pic=${picName(wal.picnum)}(${wal.picnum & 0xffff}) over=${picName(wal.overpicnum)}(${wal.overpicnum & 0xffff}) ` +
          `cstat=${wal.cstat} rep=${wal.xrepeat}x${wal.yrepeat}`,
      );
    }
  } else {
    console.log('  sec 307 missing');
  }
}

// Search ALL NAMES.H for anything fence-like we might have missed; also scan wall picnums used outdoors
console.log(`\n--- Unique wall picnums used on SOLID walls within ${RADIUS} ---`);
const solidPics = new Map();
for (let i = 0; i < board.numsectors; i++) {
  const s = board.sectors[i];
  const b = sectorBounds(board, i);
  const cx = Math.min(Math.max(spawn.posx, b.minx), b.maxx);
  const cy = Math.min(Math.max(spawn.posy, b.miny), b.maxy);
  if (dist2(spawn.posx, spawn.posy, cx, cy) > RADIUS * RADIUS) continue;
  for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
    const wal = board.walls[w];
    if (wal.nextsector >= 0) continue;
    const p = wal.picnum & 0xffff;
    if (!solidPics.has(p)) solidPics.set(p, []);
    solidPics.get(p).push({ w, sec: i });
  }
}
for (const [p, list] of [...solidPics.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${picName(p)}(${p}): walls ${list.map((x) => `#${x.w}@sec${x.sec}`).join(', ')}`);
}

// Ceiling-sloped sectors anywhere near spawn with larger radius
console.log(`\n--- ANY ceiling-slope sectors within 8000 of spawn or of sec236 ---`);
const box = sectorBounds(board, 236);
const boxMid = { x: (box.minx + box.maxx) / 2, y: (box.miny + box.maxy) / 2 };
for (let i = 0; i < board.numsectors; i++) {
  const s = board.sectors[i];
  if ((s.ceilingstat & 2) === 0) continue;
  const b = sectorBounds(board, i);
  const cx = Math.min(Math.max(spawn.posx, b.minx), b.maxx);
  const cy = Math.min(Math.max(spawn.posy, b.miny), b.maxy);
  const dSpawn = Math.hypot(cx - spawn.posx, cy - spawn.posy) | 0;
  const dx = Math.min(Math.max(boxMid.x, b.minx), b.maxx);
  const dy = Math.min(Math.max(boxMid.y, b.miny), b.maxy);
  const dBox = Math.hypot(dx - boxMid.x, dy - boxMid.y) | 0;
  if (dSpawn > 8000 && dBox > 8000) continue;
  console.log(
    `  sec#${i} dSpawn=${dSpawn} dBox=${dBox} size≈${b.maxx - b.minx}x${b.maxy - b.miny} walls=${s.wallnum} ` +
      `ceilhein=${s.ceilingheinum} floorhein=${s.floorheinum} fSlope=${(s.floorstat & 2) !== 0} ` +
      `floorz=${s.floorz} ceilz=${s.ceilingz} para=${(s.ceilingstat & 1) !== 0} ` +
      `fpic=${picName(s.floorpicnum)}(${s.floorpicnum & 0xffff}) cpic=${picName(s.ceilingpicnum)}(${s.ceilingpicnum & 0xffff})`,
  );
}

console.log('\n=== Done ===');
