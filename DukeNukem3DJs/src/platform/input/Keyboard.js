/**
 * Keyboard state for look / move (platform layer).
 */
export class Keyboard {
  constructor() {
    /** @type {Set<string>} */
    this.down = new Set();
    /** @type {Set<string>} */
    this.pressed = new Set();

    this._onDown = (e) => {
      if (!this.down.has(e.code)) {
        this.pressed.add(e.code);
      }
      this.down.add(e.code);
      // Keep arrows/WASD from scrolling the page
      if (
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'KeyQ' ||
        e.code === 'KeyE' ||
        e.code === 'Space' ||
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'Digit1' ||
        e.code === 'Digit2' ||
        e.code === 'Digit3'
      ) {
        e.preventDefault();
      }
    };
    this._onUp = (e) => {
      this.down.delete(e.code);
    };

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
  }

  /** @param {string} code */
  isDown(code) {
    return this.down.has(code);
  }

  /**
   * True once per keydown until consumed (edge-triggered).
   * @param {string} code
   */
  wasPressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  dispose() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
  }
}
