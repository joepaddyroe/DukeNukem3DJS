/**
 * Flat / wall-aligned floor/ceiling sampling via world-space plane intersection.
 *
 * Matches ENGINE.C florscan/ceilscan UV basis:
 * - (stat&64)==0 → world axes (u∝x, v∝−y)
 * - (stat&64)!=0 → align to sector's first wall
 * - bits 4 / 16 / 32 → swap / x-flip / y-flip
 * - bit 8 → double scale (finer tiling)
 *
 * Parallax (stat&1) returns null (caller draws sky).
 * Slopes use closed-form ray∩plane (grouscan-ish), not flat-Z unproject.
 */

/**
 * @param {number} n
 * @returns {number} bits for power-of-two size (ceil log2 otherwise)
 */
function picBits(n) {
  let s = 0;
  while (s < 15 && (1 << s) < n) s++;
  return s;
}

/**
 * @typedef {Object} FlatPlane
 * @property {Uint8Array} pixels
 * @property {number} xsiz
 * @property {number} ysiz
 * @property {number} xbits
 * @property {number} ybits
 * @property {number} xshift
 * @property {number} yshift
 * @property {number} zRel
 * @property {number} xpan
 * @property {number} ypan
 * @property {number} shade
 * @property {number} orient
 * @property {boolean} isCeil
 * @property {boolean} wallAlign
 * @property {number} originX
 * @property {number} originY
 * @property {number} axisUx
 * @property {number} axisUy
 * @property {number} axisVx
 * @property {number} axisVy
 * @property {boolean} isSlope
 * @property {number} heinum
 * @property {number} slopeDx
 * @property {number} slopeDy
 * @property {number} slopeI
 * @property {number} slopeOx
 * @property {number} slopeOy
 * @property {number} baseZ
 */

/**
 * @param {object} opts
 * @param {import('../engine/Board.js').Sector} opts.sec
 * @param {boolean} opts.isCeil
 * @param {number} opts.posz
 * @param {import('../grp/ArtTiles.js').ArtTiles} opts.art
 * @param {import('../engine/Board.js').Board} [opts.board]
 * @returns {FlatPlane|null}
 */
export function setupFlatPlane(opts) {
  const { sec, isCeil, posz, art, board } = opts;

  const stat = isCeil ? sec.ceilingstat : sec.floorstat;
  if (stat & 1) return null; // parallax → sky

  const isSlope = (stat & 2) !== 0;
  const baseZ = isCeil ? sec.ceilingz : sec.floorz;
  const zd = isCeil ? baseZ - posz : posz - baseZ;
  // Above a floor / below a ceiling at sector reference → still allow mild slopes
  if (!isSlope && zd >= 0) return null;

  const zRel = baseZ - posz;

  const tilenum = (isCeil ? sec.ceilingpicnum : sec.floorpicnum) & 0xffff;
  art.loadtile(tilenum);
  const xsiz = art.tilesizx[tilenum] | 0;
  const ysiz = art.tilesizy[tilenum] | 0;
  if (xsiz <= 0 || ysiz <= 0) return null;
  const pixels = art.waloff[tilenum];
  if (!pixels) return null;

  const xbits = picBits(xsiz);
  const ybits = picBits(ysiz);
  let xshift = 8 - Math.min(15, xbits);
  let yshift = 8 - Math.min(15, ybits);
  if (stat & 8) {
    xshift++;
    yshift++;
  }

  /** World-aligned default (ENGINE.C bit64 clear): u∝x, v∝−y */
  let originX = 0;
  let originY = 0;
  let axisUx = 1;
  let axisUy = 0;
  let axisVx = 0;
  let axisVy = -1;

  let slopeDx = 0;
  let slopeDy = 0;
  let slopeI = 1;
  let heinum = 0;
  let slopeOx = 0;
  let slopeOy = 0;

  if (board && sec.wallnum > 0) {
    const wal = board.walls[sec.wallptr];
    const wal2 = board.walls[wal.point2];
    const ox = wal2.x - wal.x;
    const oy = wal2.y - wal.y;

    if (stat & 64) {
      const len = Math.hypot(ox, oy) || 1;
      axisUx = ox / len;
      axisUy = oy / len;
      axisVx = -axisUy;
      axisVy = axisUx;
      originX = wal.x;
      originY = wal.y;
    }

    if (isSlope) {
      slopeDx = ox;
      slopeDy = oy;
      const len = Math.sqrt(ox * ox + oy * oy) | 0;
      slopeI = (len << 5) || 1;
      heinum = (isCeil ? sec.ceilingheinum : sec.floorheinum) | 0;
      slopeOx = wal.x;
      slopeOy = wal.y;
    }
  }

  return {
    pixels,
    xsiz,
    ysiz,
    xbits: xbits || 1,
    ybits: ybits || 1,
    xshift,
    yshift,
    zRel,
    xpan: (isCeil ? sec.ceilingxpanning : sec.floorxpanning) | 0,
    ypan: (isCeil ? sec.ceilingypanning : sec.floorypanning) | 0,
    shade: (isCeil ? sec.ceilingshade : sec.floorshade) | 0,
    orient: stat | 0,
    isCeil,
    originX,
    originY,
    axisUx,
    axisUy,
    axisVx,
    axisVy,
    isSlope,
    heinum,
    slopeDx,
    slopeDy,
    slopeI,
    slopeOx,
    slopeOy,
    baseZ,
  };
}

/**
 * Floor/ceiling Z at (x,y) including slope (ENGINE.C getzsofslope subset).
 * @param {FlatPlane} plane
 * @param {number} wx
 * @param {number} wy
 */
export function planeZAt(plane, wx, wy) {
  if (!plane.isSlope) return plane.baseZ;
  const j =
    (plane.slopeDx * (wy - plane.slopeOy) - plane.slopeDy * (wx - plane.slopeOx)) >> 3;
  return plane.baseZ + Math.floor((plane.heinum * j) / plane.slopeI);
}

/**
 * Sample floor/ceiling at view pixel (x,y).
 * @param {FlatPlane} plane
 * @param {number} x
 * @param {number} y
 * @param {object} cam
 * @returns {number} palette index
 */
export function sampleFlatPlane(plane, x, y, cam) {
  let dy = y - cam.globalhoriz;
  if (dy === 0) dy = plane.isCeil ? -1 : 1;

  if (plane.isSlope) {
    let hit = intersectSlope(plane, x, dy, cam);
    if (!hit) {
      // Fallback: iterative flat-Z refine (helps near-horizon / grazing rays)
      hit = refineSlopeHit(plane, x, dy, cam);
    }
    if (!hit) return -1;
    const z = planeZAt(plane, hit.wx, hit.wy);
    if (!plane.isCeil && z <= (cam.posz | 0)) return -1;
    if (plane.isCeil && z >= (cam.posz | 0)) return -1;
    return sampleWorldUV(plane, hit.wx, hit.wy);
  }

  let depth = ((plane.zRel << 7) * cam.xdimenscale) / (dy * 4096);
  if (!(depth > 0)) depth = 1 << 20;
  const hit = unproject(cam, x, depth);
  return sampleWorldUV(plane, hit.wx, hit.wy);
}

/**
 * Closed-form ray ∩ slope plane.
 * zToScreen: sy = horiz + (zRel<<7)*xdimenscale/(depth*4096)
 * ⇒ zRel = dy * depth * 4096 / (128 * xdimenscale)
 * Slope: z = baseZ + heinum * j / slopeI, j linear in world x,y, world linear in depth.
 * @param {FlatPlane} plane
 * @param {number} x
 * @param {number} dy screenY - globalhoriz
 * @param {object} cam
 * @returns {{ wx: number, wy: number }|null}
 */
function intersectSlope(plane, x, dy, cam) {
  const half = cam.halfxdimen || 1;
  const c = cam.cos;
  const s = cam.sin;
  const denom = c * c + s * s || 1;
  const xOff = (x - half) / half;

  // unproject: wx = posx + depth * fx, wy = posy + depth * fy
  const fx = (c * 64 - s * 64 * xOff) / denom;
  const fy = (s * 64 + c * 64 * xOff) / denom;

  const k = (dy * 4096) / (128 * cam.xdimenscale); // zRel = k * depth

  // j = (slopeDx*(wy-oy) - slopeDy*(wx-ox)) >> 3
  const j0 =
    (plane.slopeDx * (cam.posy - plane.slopeOy) -
      plane.slopeDy * (cam.posx - plane.slopeOx)) >>
    3;
  const j1 = (plane.slopeDx * fy - plane.slopeDy * fx) / 8;

  const h = plane.heinum / plane.slopeI;
  const z0 = plane.baseZ - (cam.posz | 0) + h * j0;
  // k*depth = z0 + h*j1*depth  ⇒  depth*(k - h*j1) = z0
  const lhs = k - h * j1;
  if (Math.abs(lhs) < 1e-12) return null;
  const depth = z0 / lhs;
  if (!(depth > 64)) return null;

  return {
    wx: cam.posx + depth * fx,
    wy: cam.posy + depth * fy,
  };
}

/**
 * Iterative depth refine when closed-form fails (near parallel / horizon).
 * @param {FlatPlane} plane
 * @param {number} x
 * @param {number} dy
 * @param {object} cam
 * @returns {{ wx: number, wy: number }|null}
 */
function refineSlopeHit(plane, x, dy, cam) {
  let zRel = plane.zRel;
  let depth = ((zRel << 7) * cam.xdimenscale) / (dy * 4096);
  if (!(depth > 64)) depth = 1 << 20;
  for (let iter = 0; iter < 4; iter++) {
    const hit = unproject(cam, x, depth);
    const z = planeZAt(plane, hit.wx, hit.wy);
    zRel = z - (cam.posz | 0);
    const next = ((zRel << 7) * cam.xdimenscale) / (dy * 4096);
    if (!(next > 64)) return null;
    depth = next;
  }
  if (!(depth > 64)) return null;
  return unproject(cam, x, depth);
}

/**
 * @param {object} cam
 * @param {number} x
 * @param {number} depth
 */
function unproject(cam, x, depth) {
  const half = cam.halfxdimen || 1;
  const xp = ((x - half) * depth) / half;
  const yp = depth;
  const c = cam.cos;
  const s = cam.sin;
  const denom = c * c + s * s || 1;
  const xp6 = xp * 64;
  const yp6 = yp * 64;
  const dx = (c * yp6 - s * xp6) / denom;
  const dyw = (s * yp6 + c * xp6) / denom;
  return { wx: cam.posx + dx, wy: cam.posy + dyw };
}

/**
 * @param {FlatPlane} plane
 * @param {number} wx
 * @param {number} wy
 */
function sampleWorldUV(plane, wx, wy) {
  const uScale = 1 << (20 + plane.xshift);
  const vScale = 1 << (20 + plane.yshift);

  const rx = wx - plane.originX;
  const ry = wy - plane.originY;
  let u = (rx * plane.axisUx + ry * plane.axisUy) * uScale + (plane.xpan << 24);
  let v = (rx * plane.axisVx + ry * plane.axisVy) * vScale + (plane.ypan << 24);

  const orient = plane.orient;
  if (orient & 4) {
    const t = u;
    u = v;
    v = t;
  }
  if (orient & 0x10) u = -u;
  if (orient & 0x20) v = -v;

  const xsiz = plane.xsiz;
  const ysiz = plane.ysiz;
  const u32 = u >>> 0;
  const v32 = v >>> 0;

  let tx;
  let ty;
  if ((xsiz & (xsiz - 1)) === 0) {
    tx = (u32 >>> (32 - plane.xbits)) & (xsiz - 1);
  } else {
    tx = ((u32 >>> 16) % xsiz + xsiz) % xsiz;
  }
  if ((ysiz & (ysiz - 1)) === 0) {
    ty = (v32 >>> (32 - plane.ybits)) & (ysiz - 1);
  } else {
    ty = ((v32 >>> 16) % ysiz + ysiz) % ysiz;
  }

  return plane.pixels[tx * ysiz + ty] & 255;
}
