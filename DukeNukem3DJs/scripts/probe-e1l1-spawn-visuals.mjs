/**
 * Probe E1L1 APLAYER spawn (sect 306) for visual bugs:
 * 1) metal chute / hanging duct geometry toward ang ~1376 (NW)
 * 2) very-high outdoor walls if ceilingz=-247808 used as wall top (parallax)
 * 3) sector 236 raised floor box vs nearby sloped-roof candidates
 *
 * Usage: node scripts/probe-e1l1-spawn-visuals.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GrpFile } from '../src/grp/GrpFile.js';
import { loadboard } from '../src/engine/BoardLoader.js';
import { pickSpawn, inside, getzsofslope } from '../src/engine/SectorQuery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const GRP_CANDIDATES = [
  path.join(root, 'assets', 'DUKE3D.GRP'),
  path.join(root, 'DUKE3D.GRP'),
];

/** NAMES.H subset relevant to ducts/vents/pipes/grates/fence-ish */
const PICNAMES = {
  13: 'FOF',
  80: 'MOONSKY1',
  81: 'MOONSKY2',
  82: 'MOONSKY3',
  83: 'MOONSKY4',
  84: 'BIGORBIT1',
  85: 'BIGORBIT2',
  86: 'BIGORBIT3',
  87: 'BIGORBIT4',
  88: 'BIGORBIT5',
  89: 'LA',
  98: 'REDSKY1',
  99: 'REDSKY2',
  538: 'SLIMEPIPE',
  595: 'GRATE1',
  596: 'BGRATE1',
  616: 'PIPE2',
  617: 'PIPE1B',
  618: 'PIPE3',
  619: 'PIPE1',
  633: 'PIPE2B',
  700: 'PIPE3B',
  951: 'BOX',
  994: 'PIPE5',
  995: 'PIPE6',
  996: 'PIPE4',
  997: 'PIPE4B',
  1005: 'PIPE5B',
  1022: 'HANGOOZ',
  1079: 'OOZFILTER',
  1175: 'JAILBARBREAK',
  1225: 'BARBROKE',
  1260: 'PIPE6B',
  1405: 'APLAYER',
};

/** Picnums that visually read as ducts/vents/pipes/grates */
const DUCTISH = new Set([
  538, 595, 596, 616, 617, 618, 619, 633, 700, 994, 995, 996, 997, 1005, 1022, 1079, 1260,
]);

const RADIUS = 4000;
const LOOK_ANG = 1376; // user-reported view ~NW
const PARALLAX_CEIL_Z = -247808;
const BOX_SEC = 236;
const SPAWN_SEC = 306;

function picName(pic) {
  const p = pic & 0xffff;
  return PICNAMES[p] ?? `tile${p}`;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
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

function nearestPointDist2(bx, by, bounds) {
  const cx = Math.min(Math.max(bx, bounds.minx), bounds.maxx);
  const cy = Math.min(Math.max(by, bounds.miny), bounds.maxy);
  return dist2(bx, by, cx, cy);
}

function wallLen(board, w) {
  const wal = board.walls[w];
  const p2 = board.walls[wal.point2];
  return Math.hypot(p2.x - wal.x, p2.y - wal.y);
}

function wallMid(board, w) {
  const wal = board.walls[w];
  const p2 = board.walls[wal.point2];
  return { x: (wal.x + p2.x) / 2, y: (wal.y + p2.y) / 2 };
}

/** Build angle of vector from (x,y) to (tx,ty): 0=East, increases clockwise, 2048=full turn */
function buildAng(x, y, tx, ty) {
  let a = Math.atan2(ty - y, tx - x); // JS: -PI..PI, 0=East, CCW
  // Build: 0=East, increases clockwise → negate
  a = -a;
  let units = Math.round((a / (Math.PI * 2)) * 2048) & 2047;
  return units;
}

function angDiff(a, b) {
  let d = ((a - b + 1024) & 2047) - 1024;
  return d;
}

function describeWall(board, w, spawn) {
  const wal = board.walls[w];
  const p2 = board.walls[wal.point2];
  const mid = wallMid(board, w);
  const d = Math.hypot(mid.x - spawn.posx, mid.y - spawn.posy) | 0;
  const bearing = buildAng(spawn.posx, spawn.posy, mid.x, mid.y);
  return {
    w,
    x1: wal.x,
    y1: wal.y,
    x2: p2.x,
    y2: p2.y,
    mid,
    len: wallLen(board, w) | 0,
    nextsector: wal.nextsector,
    nextwall: wal.nextwall,
    cstat: wal.cstat,
    picnum: wal.picnum & 0xffff,
    overpicnum: wal.overpicnum & 0xffff,
    masked: (wal.cstat & 16) !== 0,
    bottomSwap: (wal.cstat & 2) !== 0,
    xrepeat: wal.xrepeat,
    yrepeat: wal.yrepeat,
    dist: d,
    bearing,
    lookDelta: angDiff(bearing, LOOK_ANG),
  };
}

function loadNamesH() {
  const candidates = [
    path.resolve(root, '..', 'duke_nukem_3d-master', 'source', 'NAMES.H'),
    path.resolve(root, '..', 'duke_nukem_3d-master', 'extras', 'NAMES.H'),
  ];
  const hits = [];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const re = /#define\s+(\w*(FENCE|BARBED|BARB|GRATE|DUCT|VENT|PIPE|MESH|WIRE|JAIL|CHAINLINK)\w*)\s+(\d+)/gi;
    let m;
    while ((m = re.exec(text))) {
      hits.push({ name: m[1], picnum: Number(m[3]), file: p });
    }
  }
  return hits;
}

const grpPath = GRP_CANDIDATES.find((p) => fs.existsSync(p));
if (!grpPath) {
  console.error('No DUKE3D.GRP found');
  process.exit(1);
}

const grp = GrpFile.fromBuffer(fs.readFileSync(grpPath).buffer);
const board = loadboard(grp.read('E1L1.MAP'));
const spawn = pickSpawn(board);
const spawnSec = board.sectors[spawn.cursectnum];
const r2 = RADIUS * RADIUS;

console.log('=== E1L1 spawn visual probe ===');
console.log(`GRP: ${grpPath}`);
console.log(
  `APLAYER spawn: sect=${spawn.cursectnum} pos=(${spawn.posx},${spawn.posy},${spawn.posz}) ang=${spawn.ang}`,
);
console.log(
  `Spawn sector ${spawn.cursectnum}: floorz=${spawnSec.floorz} ceilingz=${spawnSec.ceilingz} ` +
    `ceilingstat=0x${spawnSec.ceilingstat.toString(16)} floorstat=0x${spawnSec.floorstat.toString(16)} ` +
    `cpic=${spawnSec.ceilingpicnum} fpic=${spawnSec.floorpicnum} ` +
    `ceilhein=${spawnSec.ceilingheinum} floorhein=${spawnSec.floorheinum} walls=${spawnSec.wallnum}`,
);
console.log(`Look ang=${LOOK_ANG} (user NW); spawn default ang=${spawn.ang}`);
console.log(`Parallax test ceilingz=${PARALLAX_CEIL_Z}`);

// ---------------------------------------------------------------------------
// 1) Chute / duct / hanging geometry within RADIUS
// ---------------------------------------------------------------------------
console.log(`\n========== 1) Chute/duct candidates within ${RADIUS} ==========`);

const nearSprites = [];
for (let i = 0; i < board.numsprites; i++) {
  const spr = board.sprites[i];
  const d2 = dist2(spr.x, spr.y, spawn.posx, spawn.posy);
  if (d2 > r2) continue;
  const bearing = buildAng(spawn.posx, spawn.posy, spr.x, spr.y);
  nearSprites.push({
    i,
    picnum: spr.picnum & 0xffff,
    name: picName(spr.picnum),
    x: spr.x,
    y: spr.y,
    z: spr.z,
    sectnum: spr.sectnum,
    cstat: spr.cstat,
    xrepeat: spr.xrepeat,
    yrepeat: spr.yrepeat,
    ang: spr.ang & 2047,
    lotag: spr.lotag,
    hitag: spr.hitag,
    dist: Math.sqrt(d2) | 0,
    bearing,
    lookDelta: angDiff(bearing, LOOK_ANG),
    dzCeil: spr.z - spawnSec.ceilingz,
    dzFloor: spr.z - spawnSec.floorz,
    ductish: DUCTISH.has(spr.picnum & 0xffff),
  });
}
nearSprites.sort((a, b) => Math.abs(a.lookDelta) - Math.abs(b.lookDelta) || a.dist - b.dist);

const ductSprites = nearSprites.filter(
  (s) =>
    s.ductish ||
    /PIPE|GRATE|DUCT|VENT|FILTER|HANG|OOZ/i.test(s.name) ||
    // tall thin face/wall sprites often read as hanging ducts
    (s.yrepeat >= 48 && s.xrepeat <= 40 && Math.abs(s.dzCeil) < 65536),
);
console.log(`\n--- Sprites near look ang ${LOOK_ANG} (all within R, sorted by |lookDelta|) ---`);
for (const s of nearSprites.slice(0, 35)) {
  const bits = [];
  if ((s.cstat & 48) === 0) bits.push('face');
  if ((s.cstat & 48) === 16) bits.push('wall');
  if ((s.cstat & 48) === 32) bits.push('floor');
  if (s.cstat & 1) bits.push('block');
  console.log(
    `  spr#${s.i} ${s.name}(${s.picnum}) dist=${s.dist} bearing=${s.bearing} Δlook=${s.lookDelta} ` +
      `sect=${s.sectnum} xyz=(${s.x},${s.y},${s.z}) z-ceil=${s.dzCeil} z-floor=${s.dzFloor} ` +
      `rep=${s.xrepeat}x${s.yrepeat} cstat=${s.cstat}[${bits.join('|')}] tags=${s.lotag}/${s.hitag}`,
  );
}
console.log(`\n--- Ductish / tall-hanging sprite shortlist (${ductSprites.length}) ---`);
for (const s of ductSprites) {
  console.log(
    `  spr#${s.i} ${s.name}(${s.picnum}) dist=${s.dist} bearing=${s.bearing} Δlook=${s.lookDelta} ` +
      `sect=${s.sectnum} z=${s.z} rep=${s.xrepeat}x${s.yrepeat}`,
  );
}

// Thin tall sectors: small XY footprint, large |ceiling-floor| gap, or hanging (floor high or ceil low)
console.log(`\n--- Thin/tall / hanging sectors within ${RADIUS} ---`);
const thinTall = [];
for (let i = 0; i < board.numsectors; i++) {
  const sec = board.sectors[i];
  const b = sectorBounds(board, i);
  const nd2 = nearestPointDist2(spawn.posx, spawn.posy, b);
  if (nd2 > r2) continue;
  const spanX = b.maxx - b.minx;
  const spanY = b.maxy - b.miny;
  const height = Math.abs(sec.floorz - sec.ceilingz);
  const midX = (b.minx + b.maxx) / 2;
  const midY = (b.miny + b.maxy) / 2;
  const bearing = buildAng(spawn.posx, spawn.posy, midX, midY);
  const floorDiff = sec.floorz - spawnSec.floorz;
  const ceilDiff = sec.ceilingz - spawnSec.ceilingz;
  const compact = Math.min(spanX, spanY) <= 2048 || Math.max(spanX, spanY) <= 4096;
  const hanging =
    Math.abs(floorDiff) > 8192 ||
    Math.abs(ceilDiff) > 8192 ||
    height > 131072 ||
    (sec.ceilingstat & 1) !== (spawnSec.ceilingstat & 1);
  if (!compact && !hanging) continue;
  // Skip huge outdoor sectors
  if (Math.max(spanX, spanY) > 20000 && !compact) continue;
  thinTall.push({
    i,
    spanX,
    spanY,
    height,
    floorz: sec.floorz,
    ceilingz: sec.ceilingz,
    floorDiff,
    ceilDiff,
    wallnum: sec.wallnum,
    nearest: Math.sqrt(nd2) | 0,
    bearing,
    lookDelta: angDiff(bearing, LOOK_ANG),
    ceilSlope: (sec.ceilingstat & 2) !== 0,
    floorSlope: (sec.floorstat & 2) !== 0,
    parallax: (sec.ceilingstat & 1) !== 0,
    fpic: sec.floorpicnum & 0xffff,
    cpic: sec.ceilingpicnum & 0xffff,
    ceilhein: sec.ceilingheinum,
    floorhein: sec.floorheinum,
  });
}
thinTall.sort((a, b) => Math.abs(a.lookDelta) - Math.abs(b.lookDelta) || a.nearest - b.nearest);
for (const s of thinTall.slice(0, 40)) {
  console.log(
    `  sec#${s.i} nearest=${s.nearest} bearing=${s.bearing} Δlook=${s.lookDelta} ` +
      `size≈${s.spanX}x${s.spanY} h=${s.height} floorDiff=${s.floorDiff} ceilDiff=${s.ceilDiff} ` +
      `walls=${s.wallnum} para=${s.parallax} cSlope=${s.ceilSlope}(${s.ceilhein}) fSlope=${s.floorSlope}(${s.floorhein}) ` +
      `fpic=${picName(s.fpic)}(${s.fpic}) cpic=${picName(s.cpic)}(${s.cpic})`,
  );
}

// Walls with ductish picnums within radius
console.log(`\n--- Walls with ductish/grate/pipe picnums within ${RADIUS} ---`);
const ductWalls = [];
for (let w = 0; w < board.numwalls; w++) {
  const wal = board.walls[w];
  const pic = wal.picnum & 0xffff;
  const over = wal.overpicnum & 0xffff;
  if (!DUCTISH.has(pic) && !DUCTISH.has(over) && !/PIPE|GRATE|FILTER|HANG/i.test(picName(pic))) {
    continue;
  }
  const mid = wallMid(board, w);
  const d2 = dist2(mid.x, mid.y, spawn.posx, spawn.posy);
  if (d2 > r2) continue;
  const d = describeWall(board, w, spawn);
  ductWalls.push(d);
}
ductWalls.sort((a, b) => Math.abs(a.lookDelta) - Math.abs(b.lookDelta) || a.dist - b.dist);
for (const e of ductWalls) {
  console.log(
    `  wall#${e.w} dist=${e.dist} bearing=${e.bearing} Δlook=${e.lookDelta} ` +
      `(${e.x1},${e.y1})->(${e.x2},${e.y2}) len=${e.len} nextsec=${e.nextsector} ` +
      `pic=${picName(e.picnum)}(${e.picnum}) over=${picName(e.overpicnum)}(${e.overpicnum}) ` +
      `masked=${e.masked} rep=${e.xrepeat}x${e.yrepeat}`,
  );
}

// Also dump walls of sectors whose mid is near look ang and compact
console.log(`\n--- Wall loops of compact sectors near Δlook≈0 (top 8) ---`);
for (const s of thinTall.filter((t) => Math.abs(t.lookDelta) <= 256).slice(0, 8)) {
  const sec = board.sectors[s.i];
  console.log(`  sec#${s.i} walls ${sec.wallptr}..${sec.wallptr + sec.wallnum - 1}:`);
  for (let w = sec.wallptr; w < sec.wallptr + sec.wallnum; w++) {
    const e = describeWall(board, w, spawn);
    console.log(
      `    wall#${e.w} (${e.x1},${e.y1})->(${e.x2},${e.y2}) nextsec=${e.nextsector} ` +
        `pic=${picName(e.picnum)}(${e.picnum}) over=${picName(e.overpicnum)}(${e.overpicnum}) ` +
        `masked=${e.masked} cstat=${e.cstat} rep=${e.xrepeat}x${e.yrepeat}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2) Sector 306 walls — high walls under parallax ceilingz
// ---------------------------------------------------------------------------
console.log(`\n========== 2) Sector ${SPAWN_SEC} walls (high-wall / fence / solid vs portal) ==========`);
{
  const sec = board.sectors[SPAWN_SEC];
  const trueH = Math.abs(sec.floorz - sec.ceilingz);
  const paraH = Math.abs(sec.floorz - PARALLAX_CEIL_Z);
  console.log(
    `  true ceilz=${sec.ceilingz} → wall height≈${trueH}; ` +
      `if wall top=PARALLAX_CEIL_Z(${PARALLAX_CEIL_Z}) → height≈${paraH} (${(paraH / trueH).toFixed(2)}x taller)`,
  );
  console.log(`  ceilingstat parallax bit=${(sec.ceilingstat & 1) !== 0} ceilingpic=${picName(sec.ceilingpicnum)}(${sec.ceilingpicnum})`);

  const walls = [];
  for (let w = sec.wallptr; w < sec.wallptr + sec.wallnum; w++) {
    walls.push(describeWall(board, w, spawn));
  }
  walls.sort((a, b) => a.w - b.w);

  let solid = 0;
  let portal = 0;
  for (const e of walls) {
    const kind = e.nextsector < 0 ? 'SOLID' : 'PORTAL';
    if (e.nextsector < 0) solid++;
    else portal++;
    let nextInfo = '';
    if (e.nextsector >= 0) {
      const ns = board.sectors[e.nextsector];
      nextInfo =
        ` next[floorz=${ns.floorz} ceilz=${ns.ceilingz} para=${(ns.ceilingstat & 1) !== 0} ` +
        `cSlope=${(ns.ceilingstat & 2) !== 0} fSlope=${(ns.floorstat & 2) !== 0}]`;
    }
    console.log(
      `  wall#${e.w} ${kind} nextsec=${e.nextsector} nextwall=${e.nextwall} ` +
        `(${e.x1},${e.y1})->(${e.x2},${e.y2}) len=${e.len} distMid=${e.dist} ` +
        `bearing=${e.bearing} Δlook=${e.lookDelta} ` +
        `pic=${picName(e.picnum)}(${e.picnum}) over=${picName(e.overpicnum)}(${e.overpicnum}) ` +
        `masked=${e.masked} bottomSwap=${e.bottomSwap} cstat=${e.cstat} ` +
        `rep=${e.xrepeat}x${e.yrepeat}${nextInfo}`,
    );
  }
  console.log(`  totals: solid=${solid} portal=${portal} wallptr=${sec.wallptr} wallnum=${sec.wallnum}`);

  // Fence-related names from NAMES.H
  const fenceNames = loadNamesH();
  console.log(`\n--- NAMES.H fence/duct-related defines (${fenceNames.length}) ---`);
  const seen = new Set();
  for (const h of fenceNames) {
    const key = `${h.name}:${h.picnum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${h.name} = ${h.picnum}`);
  }

  // Which of those appear on sec 306 walls or nearby outdoor walls?
  const fencePicnums = new Set(fenceNames.map((h) => h.picnum));
  // Also common unnamed outdoor fence tiles often in 700s-800s — scan sec 306 + neighbors
  console.log(`\n--- Fence-ish picnums on sec ${SPAWN_SEC} + adjacent sectors ---`);
  const adjSecs = new Set([SPAWN_SEC]);
  for (const e of walls) {
    if (e.nextsector >= 0) adjSecs.add(e.nextsector);
  }
  for (const si of adjSecs) {
    const s = board.sectors[si];
    for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
      const wal = board.walls[w];
      const pics = [wal.picnum & 0xffff, wal.overpicnum & 0xffff];
      for (const p of pics) {
        const named = picName(p);
        const isFence =
          fencePicnums.has(p) ||
          /FENCE|BARB|JAIL|GRATE|MESH|WIRE/i.test(named) ||
          // classic E1L1 courtyard fence-ish tiles (report if used)
          p === 595 ||
          p === 596 ||
          p === 1175 ||
          p === 1225;
        if (!isFence && wal.nextsector >= 0 && (wal.cstat & 16) === 0) continue;
        if (isFence || (wal.cstat & 16) !== 0) {
          console.log(
            `  sec#${si} wall#${w} pic=${named}(${p}) over=${picName(wal.overpicnum)}(${wal.overpicnum & 0xffff}) ` +
              `nextsec=${wal.nextsector} masked=${(wal.cstat & 16) !== 0} cstat=${wal.cstat}`,
          );
        }
      }
    }
  }

  // Unique picnums on solid walls of 306 (what you'd see as "building walls")
  console.log(`\n--- Unique solid-wall picnums on sec ${SPAWN_SEC} ---`);
  const solidPics = new Map();
  for (const e of walls) {
    if (e.nextsector >= 0) continue;
    const key = `${e.picnum}`;
    if (!solidPics.has(key)) solidPics.set(key, []);
    solidPics.get(key).push(e.w);
  }
  for (const [pic, ws] of solidPics) {
    console.log(`  pic=${picName(Number(pic))}(${pic}) on walls [${ws.join(',')}]`);
  }
}

// ---------------------------------------------------------------------------
// 3) Sector 236 raised box vs nearby sloped-roof candidates
// ---------------------------------------------------------------------------
console.log(`\n========== 3) Sector ${BOX_SEC} raised box vs sloped-roof neighbors ==========`);
{
  const sec = board.sectors[BOX_SEC];
  const b = sectorBounds(board, BOX_SEC);
  const midX = (b.minx + b.maxx) / 2;
  const midY = (b.miny + b.maxy) / 2;
  const zAtMid = getzsofslope(board, BOX_SEC, midX, midY);
  console.log(
    `  sec#${BOX_SEC}: floorz=${sec.floorz} ceilingz=${sec.ceilingz} ` +
      `floorstat=0x${sec.floorstat.toString(16)} ceilingstat=0x${sec.ceilingstat.toString(16)} ` +
      `floorhein=${sec.floorheinum} ceilhein=${sec.ceilingheinum} ` +
      `walls=${sec.wallnum} size≈${b.maxx - b.minx}x${b.maxy - b.miny} ` +
      `xy=[${b.minx}..${b.maxx},${b.miny}..${b.maxy}] ` +
      `midZ flor=${zAtMid.florz} ceil=${zAtMid.ceilz}`,
  );
  console.log(`  wall loop:`);
  for (let w = sec.wallptr; w < sec.wallptr + sec.wallnum; w++) {
    const e = describeWall(board, w, spawn);
    console.log(
      `    wall#${e.w} (${e.x1},${e.y1})->(${e.x2},${e.y2}) nextsec=${e.nextsector} ` +
        `pic=${picName(e.picnum)}(${e.picnum}) over=${picName(e.overpicnum)}(${e.overpicnum}) ` +
        `masked=${e.masked} rep=${e.xrepeat}x${e.yrepeat}`,
    );
  }

  // Candidates: nearby sectors with ceiling slope bit, especially compact box-like
  const slopeCands = [];
  for (let i = 0; i < board.numsectors; i++) {
    const s = board.sectors[i];
    const bb = sectorBounds(board, i);
    const nd2 = nearestPointDist2(midX, midY, bb);
    // near the box OR near spawn
    const nearBox = nd2 <= 6000 * 6000;
    const nearSpawn = nearestPointDist2(spawn.posx, spawn.posy, bb) <= r2;
    if (!nearBox && !nearSpawn) continue;
    const ceilSlope = (s.ceilingstat & 2) !== 0;
    const floorSlope = (s.floorstat & 2) !== 0;
    if (!ceilSlope && !floorSlope && i !== BOX_SEC) continue;
    const spanX = bb.maxx - bb.minx;
    const spanY = bb.maxy - bb.miny;
    slopeCands.push({
      i,
      floorz: s.floorz,
      ceilingz: s.ceilingz,
      floorDiff: s.floorz - spawnSec.floorz,
      ceilDiff: s.ceilingz - spawnSec.ceilingz,
      ceilSlope,
      floorSlope,
      ceilhein: s.ceilingheinum,
      floorhein: s.floorheinum,
      ceilingstat: s.ceilingstat,
      floorstat: s.floorstat,
      wallnum: s.wallnum,
      spanX,
      spanY,
      nearestToBox: Math.sqrt(nd2) | 0,
      nearestToSpawn: Math.sqrt(nearestPointDist2(spawn.posx, spawn.posy, bb)) | 0,
      fpic: s.floorpicnum & 0xffff,
      cpic: s.ceilingpicnum & 0xffff,
      parallax: (s.ceilingstat & 1) !== 0,
      compact: Math.max(spanX, spanY) <= 8192 && s.wallnum <= 12,
    });
  }
  slopeCands.sort((a, b) => {
    // Prefer ceiling-sloped compact near box
    const score = (c) =>
      (c.ceilSlope ? 0 : 100) + (c.compact ? 0 : 50) + c.nearestToBox + (c.i === BOX_SEC ? -1000 : 0);
    return score(a) - score(b);
  });

  console.log(`\n--- Sloped sectors near sec ${BOX_SEC} / spawn (ceiling slope preferred) ---`);
  for (const c of slopeCands.slice(0, 30)) {
    console.log(
      `  sec#${c.i}${c.i === BOX_SEC ? ' [THE BOX]' : ''} nearestBox=${c.nearestToBox} nearestSpawn=${c.nearestToSpawn} ` +
        `size≈${c.spanX}x${c.spanY} walls=${c.wallnum} compact=${c.compact} ` +
        `floorDiff=${c.floorDiff} ceilDiff=${c.ceilDiff} ` +
        `cSlope=${c.ceilSlope}(hein=${c.ceilhein}) fSlope=${c.floorSlope}(hein=${c.floorhein}) ` +
        `para=${c.parallax} floorz=${c.floorz} ceilz=${c.ceilingz} ` +
        `fpic=${picName(c.fpic)}(${c.fpic}) cpic=${picName(c.cpic)}(${c.cpic})`,
    );
  }

  // Highlight "sloped roof box" = compact + ceiling slope + maybe raised or different ceil
  const roofBoxes = slopeCands.filter(
    (c) => c.ceilSlope && c.compact && c.i !== BOX_SEC && c.nearestToSpawn <= RADIUS,
  );
  console.log(`\n--- "Sloped roof box" shortlist (compact + ceiling slope, !=${BOX_SEC}) ---`);
  for (const c of roofBoxes) {
    const s = board.sectors[c.i];
    console.log(
      `  CANDIDATE sec#${c.i} size≈${c.spanX}x${c.spanY} ceilhein=${c.ceilhein} ` +
        `floorz=${c.floorz} ceilz=${c.ceilingz} nearestSpawn=${c.nearestToSpawn}`,
    );
    for (let w = s.wallptr; w < s.wallptr + s.wallnum; w++) {
      const e = describeWall(board, w, spawn);
      console.log(
        `    wall#${e.w} (${e.x1},${e.y1})->(${e.x2},${e.y2}) nextsec=${e.nextsector} ` +
          `pic=${picName(e.picnum)}(${e.picnum}) over=${picName(e.overpicnum)}(${e.overpicnum})`,
      );
    }
  }
}

console.log('\n=== Done ===');
