/**
 * Keyboard + mouse button state for look / move / fire (platform layer).
 */
export class Keyboard {
  constructor() {
    /** @type {Set<string>} */
    this.down = new Set();
    /** @type {Set<string>} */
    this.pressed = new Set();
    /** @type {Set<number>} */
    this.mouseDown = new Set();

    this._onDown = (e) => {
      if (!this.down.has(e.code)) {
        this.pressed.add(e.code);
      }
      this.down.add(e.code);
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
        e.code === 'KeyZ' ||
        e.code === 'KeyC' ||
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
    this._onMouseDown = (e) => {
      this.mouseDown.add(e.button);
      e.preventDefault();
    };
    this._onMouseUp = (e) => {
      this.mouseDown.delete(e.button);
    };
    this._onContext = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('contextmenu', this._onContext);
  }

  /** @param {string} code */
  isDown(code) {
    return this.down.has(code);
  }

  /**
   * Mouse button down (0 = left).
   * @param {number} button
   */
  isMouseDown(button) {
    return this.mouseDown.has(button);
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
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('contextmenu', this._onContext);
  }
}
