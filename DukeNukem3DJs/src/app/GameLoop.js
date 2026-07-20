import { TICRATE } from '../core/gameConstants.js';

/**
 * Fixed-rate simulation with a render callback each animation frame.
 * Timing targets Duke's effective ~26 Hz display rate (see DUKE3D.H TICRATE / TICSPERFRAME).
 */
export class GameLoop {
  /**
   * @param {{ onTick: () => void, onFrame: () => void, ticRate?: number }} hooks
   */
  constructor({ onTick, onFrame, ticRate = TICRATE }) {
    this.onTick = onTick;
    this.onFrame = onFrame;
    this.ticRate = ticRate;
    this.msPerTic = 1000 / ticRate;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this._rafId = 0;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTime = performance.now();
    this._rafId = requestAnimationFrame((now) => this._frame(now));
  }

  stop() {
    this.running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /** @param {number} now */
  _frame(now) {
    if (!this.running) {
      return;
    }

    let delta = now - this.lastTime;
    this.lastTime = now;
    if (delta > 100) {
      delta = 100;
    }

    this.accumulator += delta;
    while (this.accumulator >= this.msPerTic) {
      this.onTick();
      this.accumulator -= this.msPerTic;
    }

    this.onFrame();
    this._rafId = requestAnimationFrame((t) => this._frame(t));
  }
}
