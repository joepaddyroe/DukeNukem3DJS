/**
 * Top-level game / mode holder.
 * Later: MODE_MENU / MODE_GAME / MODE_DEMO from DUKE3D.H.
 */
import { Player } from '../game/Player.js';
import { getInput } from '../game/GetInput.js';
import { processInput } from '../game/ProcessInput.js';
import { processWeapon, pistolHudTiles, PISTOL_WEAPON } from '../game/Weapons.js';
import { processUse } from '../game/Operate.js';
import { doAnimations, clearAnimations } from '../game/Animate.js';

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
    /** @type {Player} */
    this.player = new Player();
    this._playerReady = false;
  }

  /**
   * Seed player from drawrooms spawn after setWorld.
   */
  bindPlayerFromWorld() {
    const rooms = this.renderer.drawRooms;
    if (!rooms) return;
    clearAnimations();
    this.player.resetFromCamera(rooms);
    this._playerReady = true;
  }

  /** One simulation tic. */
  tick() {
    const rooms = this.renderer.drawRooms;
    const kb = this.renderer.keyboard;

    if (kb && rooms) {
      if (kb.wasPressed('Digit1') || kb.wasPressed('Numpad1')) {
        rooms.debugVisMode = 'normal';
      } else if (kb.wasPressed('Digit2') || kb.wasPressed('Numpad2')) {
        rooms.debugVisMode = 'wallsOnly';
      } else if (kb.wasPressed('Digit3') || kb.wasPressed('Numpad3')) {
        rooms.debugVisMode = 'coverage';
      }
    }

    if (!this._playerReady || !rooms || !rooms.board) {
      if (rooms) rooms.turn(2);
      return;
    }

    if (!kb) {
      rooms.turn(2);
      this.player.applyToCamera(rooms);
      rooms._refreshDebug?.();
      return;
    }

    const sync = getInput(kb, this.player, { autoRun: true });
    processInput(this.player, rooms.board, rooms.art, sync);
    processWeapon(this.player, rooms.board, rooms.art, sync);
    processUse(this.player, rooms.board, rooms.art, sync);
    doAnimations(rooms.board, this.player);
    this.player.applyToCamera(rooms);
    rooms.setPlayDebug({
      on_ground: this.player.on_ground,
      jumping_counter: this.player.jumping_counter,
      poszv: this.player.poszv,
      ammo: this.player.ammo_amount[PISTOL_WEAPON],
      kb: this.player.kickback_pic,
      use: this.player.lastUse ?? '-',
      hit: this.player.lastHit
        ? `w=${this.player.lastHit.hitwall} s=${this.player.lastHit.hitsprite}`
        : '-',
    });
    rooms._refreshDebug?.();
  }

  /** Present one frame. */
  frame() {
    this.renderer.render();
    const rooms = this.renderer.drawRooms;
    if (rooms?.art) {
      this.renderer.drawWeaponOverlay(pistolHudTiles(this.player));
    }
    this.output.present(this.renderer.pixels);
  }
}
