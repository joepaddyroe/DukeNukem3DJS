/**
 * Top-level game / mode holder (Phase 0 stub).
 * Later: MODE_MENU / MODE_GAME / MODE_DEMO from DUKE3D.H.
 */
export class Game {
  /**
   * @param {{
   *   renderer: import('../render/SoftwareRenderer.js').SoftwareRenderer,
   *   output: import('../platform/video/CanvasVideoOutput.js').CanvasVideoOutput,
   * }} deps
   */
  constructor({ renderer, output }) {
    this.renderer = renderer;
    this.output = output;
  }

  /** One simulation tic. */
  tick() {
    this.renderer.tick();
  }

  /** Present one frame. */
  frame() {
    this.renderer.render();
    this.output.present(this.renderer.pixels);
  }
}
