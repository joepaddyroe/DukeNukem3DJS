import { SCREENWIDTH, SCREENHEIGHT } from '../core/renderConstants.js';
import { ViewBuffer } from './ViewBuffer.js';
import { Palookup } from './Palookup.js';
import { VlineDrawer } from './VlineDrawer.js';
import { HlineDrawer } from './HlineDrawer.js';
import { DrawRooms } from './DrawRooms.js';
import { DrawMasks } from './DrawMasks.js';

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

  /** Player look / move from keyboard (falls back to slow auto-turn). */
  tick() {
    if (!this.drawRooms) return;

    const kb = this.keyboard;
    if (!kb) {
      this.drawRooms.turn(2);
      return;
    }

    // Vis debug: 1=normal 2=wallsOnly 3=coverage (edge-triggered)
    if (kb.wasPressed('Digit1') || kb.wasPressed('Numpad1')) {
      this.drawRooms.debugVisMode = 'normal';
    } else if (kb.wasPressed('Digit2') || kb.wasPressed('Numpad2')) {
      this.drawRooms.debugVisMode = 'wallsOnly';
    } else if (kb.wasPressed('Digit3') || kb.wasPressed('Numpad3')) {
      this.drawRooms.debugVisMode = 'coverage';
    }

    let forward = 0;
    let strafe = 0;
    let turn = 0;
    if (kb.isDown('KeyW') || kb.isDown('ArrowUp')) forward += 1;
    if (kb.isDown('KeyS') || kb.isDown('ArrowDown')) forward -= 1;
    if (kb.isDown('KeyD')) strafe += 1;
    if (kb.isDown('KeyA')) strafe -= 1;
    if (kb.isDown('ArrowLeft') || kb.isDown('KeyQ')) turn -= 24;
    if (kb.isDown('ArrowRight') || kb.isDown('KeyE')) turn += 24;

    if (forward || strafe || turn) {
      this.drawRooms.move(forward, strafe, turn);
    }
  }

  render() {
    this.clearview(0);
    if (this.drawRooms) {
      this.drawRooms.drawrooms();
    }
  }
}
