/**
 * Temp probe: what sits near E1L1 APLAYER spawn (sprites vs raised sectors).
 * Usage: node scripts/probe-e1l1-spawn-box.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GrpFile } from '../src/grp/GrpFile.js';
import { loadboard } from '../src/engine/BoardLoader.js';
import { pickSpawn, inside, APLAYER } from '../src/engine/SectorQuery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const GRP_CANDIDATES = [
  path.join(root, 'assets', 'DUKE3D.GRP'),
  path.join(root, 'DUKE3D.GRP'),
];

/** Subset of NAMES.H for readable output */
const PICNAMES = {
  13: 'FOF',
  30: 'HEALTHBOX',
  31: 'AMMOBOX',
  33: 'INVENTORYBOX',
  951: 'BOX',
  1227: 'NUKEBARREL',
  1238: 'EXPLODINGBARREL',
  1405: 'APLAYER',
  2495: 'TEXTBOX',
};

const RADIUS = 2048;
const SECTOR_XY_PAD = 4096;

function picName(pic) {
  return PICNAMES[pic] ?? `tile${pic}`;
}

function sectorBounds(board, sectnum) {
  const sec = board.sectors[sectnum];
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let w = sec.wallptr; w < sec.wallptr + sec.wallnum; w++) {
    const wal = board.walls[w];
    minx = Math.min(minx, wal.x);
    maxx = Math.max(maxx, wal.x);
    miny = Math.min(miny, wal.y);
    maxy = Math.max(maxy, wal.y);
  }
  return { minx, maxx, miny, maxy, wallnum: sec.wallnum };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function nearestPointDist2(bx, by, bounds) {
  const cx = Math.min(Math.max(bx, bounds.minx), bounds.maxx);
  const cy = Math.min(Math.max(by, bounds.miny), bounds.maxy);
  return dist2(bx, by, cx, cy);
}

function describeWallLoop(board, sectnum) {
  const sec = board.sectors[sectnum];
  const edges = [];
  for (let w = sec.wallptr; w < sec.wallptr + sec.wallnum; w++) {
    const wal = board.walls[w];
    const p2 = board.walls[wal.point2];
    edges.push({
      w,
      x1: wal.x,
      y1: wal.y,
      x2: p2.x,
      y2: p2.y,
      nextsector: wal.nextsector,
      nextwall: wal.nextwall,
      cstat: wal.cstat,
      picnum: wal.picnum,
      overpicnum: wal.overpicnum,
      masked: (wal.cstat & 16) !== 0,
      xrepeat: wal.xrepeat,
      yrepeat: wal.yrepeat,
    });
  }
  return edges;
}

const grpPath = GRP_CANDIDATES.find((p) => fs.existsSync(p));
if (!grpPath) {
  console.error('No DUKE3D.GRP found under assets/ or project root');
  process.exit(1);
}

const grp = GrpFile.fromBuffer(fs.readFileSync(grpPath).buffer);
const board = loadboard(grp.read('E1L1.MAP'));
const spawn = pickSpawn(board);
const spawnFloor = board.sectors[spawn.cursectnum]?.floorz ?? spawn.posz;

console.log('=== E1L1 spawn probe ===');
console.log(`GRP: ${grpPath}`);
console.log(
  `APLAYER spawn: sect=${spawn.cursectnum} pos=(${spawn.posx},${spawn.posy},${spawn.posz}) ang=${spawn.ang} source=${spawn.source}`,
);
console.log(
  `Spawn sector floorz=${spawnFloor} ceilingz=${board.sectors[spawn.cursectnum]?.ceilingz} wallnum=${board.sectors[spawn.cursectnum]?.wallnum}`,
);
console.log(`Board: sectors=${board.numsectors} walls=${board.numwalls} sprites=${board.numsprites}`);

const r2 = RADIUS * RADIUS;
const nearSprites = [];
for (let i = 0; i < board.numsprites; i++) {
  const spr = board.sprites[i];
  const d2 = dist2(spr.x, spr.y, spawn.posx, spawn.posy);
  if (d2 > r2) continue;
  nearSprites.push({
    i,
    picnum: spr.picnum,
    name: picName(spr.picnum),
    x: spr.x,
    y: spr.y,
    z: spr.z,
    sectnum: spr.sectnum,
    cstat: spr.cstat,
    xrepeat: spr.xrepeat,
    yrepeat: spr.yrepeat,
    ang: spr.ang,
    lotag: spr.lotag,
    hitag: spr.hitag,
    dist: Math.sqrt(d2) | 0,
    dzFloor: spr.z - spawnFloor,
  });
}
nearSprites.sort((a, b) => a.dist - b.dist);

console.log(`\n=== Sprites within ${RADIUS} of spawn (${nearSprites.length}) ===`);
for (const s of nearSprites) {
  const cstatBits = [];
  if (s.cstat & 1) cstatBits.push('block');
  if (s.cstat & 16) cstatBits.push('onesided');
  if ((s.cstat & 48) === 0) cstatBits.push('face');
  if ((s.cstat & 48) === 16) cstatBits.push('wall');
  if ((s.cstat & 48) === 32) cstatBits.push('floor');
  if (s.cstat & 128) cstatBits.push('realcenter');
  console.log(
    `  spr#${s.i} ${s.name}(${s.picnum}) dist=${s.dist} sect=${s.sectnum} ` +
      `xyz=(${s.x},${s.y},${s.z}) z-floor=${s.dzFloor} ` +
      `cstat=${s.cstat}[${cstatBits.join('|')||'0'}] ` +
      `xyrep=${s.xrepeat}x${s.yrepeat} ang=${s.ang} tags=${s.lotag}/${s.hitag}`,
  );
}

const nearSectors = [];
for (let i = 0; i < board.numsectors; i++) {
  const sec = board.sectors[i];
  const b = sectorBounds(board, i);
  // AABB near spawn, or contains spawn, or floor differs and close
  const nearXy =
    spawn.posx >= b.minx - SECTOR_XY_PAD &&
    spawn.posx <= b.maxx + SECTOR_XY_PAD &&
    spawn.posy >= b.miny - SECTOR_XY_PAD &&
    spawn.posy <= b.maxy + SECTOR_XY_PAD;
  if (!nearXy && !inside(spawn.posx, spawn.posy, board, i)) continue;

  const floorDiff = sec.floorz - spawnFloor;
  const ceilDiff = sec.ceilingz - (board.sectors[spawn.cursectnum]?.ceilingz ?? 0);
  const nd2 = nearestPointDist2(spawn.posx, spawn.posy, b);
  nearSectors.push({
    i,
    floorz: sec.floorz,
    ceilingz: sec.ceilingz,
    floorDiff,
    ceilDiff,
    floorpicnum: sec.floorpicnum,
    ceilingpicnum: sec.ceilingpicnum,
    lotag: sec.lotag,
    hitag: sec.hitag,
    wallnum: sec.wallnum,
    bounds: b,
    nearestDist: Math.sqrt(nd2) | 0,
    containsSpawn: inside(spawn.posx, spawn.posy, board, i),
  });
}

nearSectors.sort((a, b) => {
  if (a.containsSpawn !== b.containsSpawn) return a.containsSpawn ? -1 : 1;
  if (Math.abs(a.floorDiff) !== Math.abs(b.floorDiff)) {
    return Math.abs(b.floorDiff) - Math.abs(a.floorDiff);
  }
  return a.nearestDist - b.nearestDist;
});

console.log(`\n=== Nearby sectors (pad=${SECTOR_XY_PAD}) with floorz != spawn floor ===`);
const raised = nearSectors.filter((s) => s.floorDiff !== 0);
for (const s of raised.slice(0, 40)) {
  console.log(
    `  sec#${s.i} floorDiff=${s.floorDiff} floorz=${s.floorz} ceilz=${s.ceilingz} ` +
      `ceilDiff=${s.ceilDiff} walls=${s.wallnum} nearest=${s.nearestDist} ` +
      `contains=${s.containsSpawn} fpic=${s.floorpicnum} cpic=${s.ceilingpicnum} ` +
      `tags=${s.lotag}/${s.hitag} ` +
      `xy=[${s.bounds.minx}..${s.bounds.maxx},${s.bounds.miny}..${s.bounds.maxy}]`,
  );
}

console.log(`\n=== Compact raised sectors near spawn (nearest<=${RADIUS}, |floorDiff|>0) ===`);
const compact = raised
  .filter((s) => s.nearestDist <= RADIUS)
  .sort((a, b) => a.nearestDist - b.nearestDist);
for (const s of compact) {
  const edges = describeWallLoop(board, s.i);
  const portalCount = edges.filter((e) => e.nextsector >= 0).length;
  const solidCount = edges.length - portalCount;
  const maskedCount = edges.filter((e) => e.masked).length;
  const spanX = s.bounds.maxx - s.bounds.minx;
  const spanY = s.bounds.maxy - s.bounds.miny;
  console.log(
    `  sec#${s.i} floorDiff=${s.floorDiff} size≈${spanX}x${spanY} walls=${s.wallnum} ` +
      `portals=${portalCount} solids=${solidCount} maskedWalls=${maskedCount} nearest=${s.nearestDist}`,
  );
  for (const e of edges) {
    console.log(
      `    wall#${e.w} (${e.x1},${e.y1})->(${e.x2},${e.y2}) nextsec=${e.nextsector} ` +
        `cstat=${e.cstat} pic=${e.picnum} over=${e.overpicnum} masked=${e.masked} ` +
        `rep=${e.xrepeat}x${e.yrepeat}`,
    );
  }
}

// Highlight classic BOX sprites and tiny raised sectors
const boxes = nearSprites.filter((s) => s.picnum === 951 || /BOX|CRATE|BARREL/i.test(s.name));
console.log(`\n=== Likely "box" candidates ===`);
console.log(`BOX/barrel sprites nearby: ${boxes.length}`);
for (const s of boxes) {
  console.log(
    `  SPRITE ${s.name}#${s.i} dist=${s.dist} — drawn by drawmasks (spritesort), NOT drawrooms`,
  );
}
const boxLikeSecs = compact.filter(
  (s) => s.wallnum <= 8 && Math.abs(s.floorDiff) >= 1024 && Math.abs(s.floorDiff) <= 65536,
);
console.log(`Small raised floor sectors nearby: ${boxLikeSecs.length}`);
for (const s of boxLikeSecs) {
  console.log(
    `  SECTOR #${s.i} floorDiff=${s.floorDiff} size≈${s.bounds.maxx - s.bounds.minx}x${s.bounds.maxy - s.bounds.miny} ` +
      `nearest=${s.nearestDist} — drawn by drawrooms (portal floors/step walls)`,
  );
}

console.log('\n=== Verdict hint ===');
if (boxes.length && (!boxLikeSecs.length || boxes[0].dist < (boxLikeSecs[0]?.nearestDist ?? Infinity))) {
  console.log(
    `Closest decorative box is likely SPRITE picnum=${boxes[0].picnum} (${boxes[0].name}) at dist=${boxes[0].dist}. Fix path: drawmasks / sprites.`,
  );
} else if (boxLikeSecs.length) {
  console.log(
    `Closest box-like geometry is SECTOR #${boxLikeSecs[0].i} (raised floor). Fix path: drawrooms wall/portal/floor sorting.`,
  );
} else {
  console.log('No obvious BOX sprite or compact raised sector in radius — inspect full lists above.');
}
