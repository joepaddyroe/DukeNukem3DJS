import { SCREENWIDTH, SCREENHEIGHT } from '../core/renderConstants.js';
import { ViewBuffer } from './ViewBuffer.js';
import { Palookup } from './Palookup.js';
import { VlineDrawer } from './VlineDrawer.js';
import { HlineDrawer } from './HlineDrawer.js';
import { DemoRoomRenderer } from './DemoRoomRenderer.js';

/**
 * Software renderer facade — pixel path aligned with Build ENGINE.C.
 *
 * Owns ViewBuffer (frameplace / ylookup / setview), VlineDrawer (vlineasm1),
 * HlineDrawer. Real 3D target is drawrooms/drawmasks; DemoRoomRenderer is
 * temporary ART exercise only.
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
    this.demoRoom = new DemoRoomRenderer(this);

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  /** @returns {Uint8Array} */
  get pixels() {
    return this.buffer.pixels;
  }

  /**
   * Apply palette.dat shade tables (after BuildPalette.load).
   * @param {import('../grp/BuildPalette.js').BuildPalette} buildPalette
   */
  setBuildPalette(buildPalette) {
    this.palookup.setFromPaletteDat(buildPalette.palookup, buildPalette.numpalookups);
  }

  /**
   * @param {import('../grp/ArtTiles.js').ArtTiles} art
   */
  setArt(art) {
    this.demoRoom.setArt(art);
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

  tick() {
    this.demoRoom.tick(4);
  }

  render() {
    this.demoRoom.render();
  }
}
