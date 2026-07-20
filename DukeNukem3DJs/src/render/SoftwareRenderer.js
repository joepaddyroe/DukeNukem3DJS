import { SCREENWIDTH, SCREENHEIGHT } from '../core/renderConstants.js';
import { ViewBuffer } from './ViewBuffer.js';
import { Palookup } from './Palookup.js';
import { VlineDrawer } from './VlineDrawer.js';
import { HlineDrawer } from './HlineDrawer.js';
import { DrawRooms } from './DrawRooms.js';
import { DrawMasks } from './DrawMasks.js';
import { drawWeaponHud } from './WeaponHud.js';

/**
 * Software renderer facade — Build ENGINE.C pixel path + drawrooms.
 */
export class SoftwareRenderer {
  /**
   * @param {number} [screenWidth=SCREENWIDTH]
   * @param {number} [screenHeight=SCREENHEIGHT]
   */
  constructor(screenWidth = SCREENWIDTH, screenHeight = SCREENHEIGHT) {
    this.buffer = new ViewBuffer(screenWidth, screenHeight);
    this.palookup = new Palookup(32);
    this.vlines = new VlineDrawer(this.buffer, this.palookup);
    this.hlines = new HlineDrawer(this.buffer);

    /** @type {DrawRooms|null} */
    this.drawRooms = null;

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    /** @type {import('../platform/input/Keyboard.js').Keyboard|null} */
    this.keyboard = null;
  }

  /** @returns {Uint8Array} */
  get pixels() {
    return this.buffer.pixels;
  }

  /**
   * @param {import('../grp/BuildPalette.js').BuildPalette} buildPalette
   */
  setBuildPalette(buildPalette) {
    this.palookup.setFromPaletteDat(buildPalette.palookup, buildPalette.numpalookups);
  }

  /**
   * @param {import('../grp/ArtTiles.js').ArtTiles} art
   * @param {import('../engine/Board.js').Board} board
   */
  setWorld(art, board) {
    this.drawRooms = new DrawRooms(this, art);
    this.drawRooms.drawMasks = new DrawMasks(this, art);
    this.drawRooms.setBoard(board);
  }

  /**
   * @param {import('../platform/input/Keyboard.js').Keyboard} keyboard
   */
  setKeyboard(keyboard) {
    this.keyboard = keyboard;
  }

  /**
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   */
  setview(x1, y1, x2, y2) {
    this.buffer.setview(x1, y1, x2, y2);
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  initBuffer(width, height) {
    this.buffer.setResolution(width, height);
    this.screenWidth = width;
    this.screenHeight = height;
  }

  /** @param {number} [color=0] */
  clearview(color = 0) {
    this.buffer.clearview(color);
  }

  /**
   * Legacy no-op — play tic lives in Game (PLAYER.C processinput subset).
   * Kept so callers that still invoke renderer.tick do not break.
   */
  tick() {}

  render() {
    this.clearview(0);
    if (this.drawRooms) {
      this.drawRooms.drawrooms();
    }
  }

  /**
   * GAME.C myospal weapon overlay after drawrooms.
   * @param {{ pic: number, x: number, y: number }[]} tiles
   */
  drawWeaponOverlay(tiles) {
    const art = this.drawRooms?.art;
    if (!art || !tiles?.length) return;
    drawWeaponHud(this.buffer, art, tiles);
  }
}
