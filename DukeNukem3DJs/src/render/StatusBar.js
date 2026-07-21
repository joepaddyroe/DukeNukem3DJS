/**
 * GAME.C status bar subset — BOTTOMSTATUSBAR + digital numbers + inventory icons.
 * Uses mini-bar layout (screen_size == 4) with full bar backdrop for clarity.
 */
import {
  blitTile,
  blitTileCentered,
  blitTileCenteredTrans,
  digitalNumber,
} from './WeaponHud.js';

export const BOTTOMSTATUSBAR = 2462;
export const HEALTHBOX = 30;
export const AMMOBOX = 31;
export const INVENTORYBOX = 33;
export const DIGITALNUM = 2472;
export const FIRSTAID_ICON = 2460;
export const HEAT_ICON = 2461;
export const BOOT_ICON = 2463;
export const JETPACK_ICON = 2467;
export const AIRTANK_ICON = 2468;
export const STEROIDS_ICON = 2469;
export const HOLODUKE_ICON = 2470;
export const ACCESS_ICON = 2471;
export const ARROW = 20;
/** NAMES.H — GAME.C displayrest crosshair */
export const CROSSHAIR = 2523;

/** inven_icon → HUD tile */
const INVEN_ICONS = [
  0,
  FIRSTAID_ICON,
  STEROIDS_ICON,
  HOLODUKE_ICON,
  JETPACK_ICON,
  HEAT_ICON,
  AIRTANK_ICON,
  BOOT_ICON,
];

/**
 * Draw full player status UI (GAME.C displayrest / mini bar).
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {import('../game/Player.js').Player} p
 */
export function drawStatusBar(buffer, art, p) {
  // Full bar backdrop (320×34 at bottom)
  blitTile(buffer, art, 0, 200 - 34, BOTTOMSTATUSBAR);

  const health = p.last_extra ?? p.extra ?? 100;
  const armor = p.shield_amount | 0;
  let ammoW = p.curr_weapon | 0;
  if (ammoW === 9) ammoW = 5; // HANDREMOTE → HANDBOMB
  const ammo = (p.ammo_amount && p.ammo_amount[ammoW]) | 0;

  digitalNumber(buffer, art, 32, 200 - 17, health, DIGITALNUM);
  digitalNumber(buffer, art, 64, 200 - 17, armor, DIGITALNUM);
  if ((p.curr_weapon | 0) !== 0) {
    digitalNumber(buffer, art, 208, 200 - 17, ammo, DIGITALNUM);
  }

  // Access cards
  const acc = p.got_access | 0;
  if (acc & 4) blitTile(buffer, art, 275, 182, ACCESS_ICON);
  if (acc & 2) blitTile(buffer, art, 288, 182, ACCESS_ICON);
  if (acc & 1) blitTile(buffer, art, 281, 189, ACCESS_ICON);

  // Selected inventory slot on bar
  const icon = p.inven_icon | 0;
  if (icon > 0 && icon < INVEN_ICONS.length) {
    const tile = INVEN_ICONS[icon];
    blitTileCentered(buffer, art, 248, 200 - 21, tile);
    const pct = inventoryPercent(p, icon);
    digitalNumber(buffer, art, 260, 200 - 6, pct, DIGITALNUM);
  }

  // Temporary inventory strip (GAME.C displayinventory)
  if ((p.invdisptime | 0) > 0) {
    drawInventoryStrip(buffer, art, p);
  }

  // GAME.C displayrest — after gauges, translucent CROSSHAIR at view center
  drawCrosshair(buffer, art, p);
}

/**
 * GAME.C: rotatesprite(160-(look_ang>>1), 100, …, CROSSHAIR, …, 2+1)
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {import('../game/Player.js').Player} p
 */
export function drawCrosshair(buffer, art, p) {
  const look = (p.look_ang | 0) >> 1;
  blitTileCenteredTrans(buffer, art, 160 - look, 100, CROSSHAIR);
}

/**
 * @param {import('../game/Player.js').Player} p
 * @param {number} icon
 */
function inventoryPercent(p, icon) {
  switch (icon) {
    case 1:
      return p.firstaid_amount | 0;
    case 2:
      return ((p.steroids_amount | 0) + 3) >> 2;
    case 3:
      return (((p.holoduke_amount | 0) + 15) / 24) | 0;
    case 4:
      return ((p.jetpack_amount | 0) + 15) >> 4;
    case 5:
      return ((p.heat_amount | 0) / 12) | 0;
    case 6:
      return ((p.scuba_amount | 0) + 63) >> 6;
    case 7:
      return (p.boot_amount | 0) >> 1;
    default:
      return 0;
  }
}

/**
 * @param {import('./ViewBuffer.js').ViewBuffer} buffer
 * @param {import('../grp/ArtTiles.js').ArtTiles} art
 * @param {import('../game/Player.js').Player} p
 */
function drawInventoryStrip(buffer, art, p) {
  /** @type {number[]} */
  const bits = [];
  if ((p.firstaid_amount | 0) > 0) bits.push(1);
  if ((p.steroids_amount | 0) > 0) bits.push(2);
  if ((p.holoduke_amount | 0) > 0) bits.push(3);
  if ((p.jetpack_amount | 0) > 0) bits.push(4);
  if ((p.heat_amount | 0) > 0) bits.push(5);
  if ((p.scuba_amount | 0) > 0) bits.push(6);
  if ((p.boot_amount | 0) > 0) bits.push(7);
  if (!bits.length) return;

  let xoff = 160 - bits.length * 11;
  const y = 154;
  for (const j of bits) {
    const tile = INVEN_ICONS[j];
    blitTile(buffer, art, xoff, y, tile);
    if ((p.inven_icon | 0) === j) {
      blitTileCentered(buffer, art, xoff + 9, y + 19, ARROW);
    }
    xoff += 22;
  }
}
