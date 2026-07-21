/**
 * Duke player_struct subset — DUKE3D.H / PLAYER.C.
 * Full inventory / CON later.
 */
import { initPistol } from './Weapons.js';

export class Player {
  constructor() {
    this.posx = 0;
    this.posy = 0;
    this.posz = 0;
    this.ang = 0;
    this.horiz = 100;
    this.cursectnum = 0;

    /** Hit points (PLAYER.C sprite.extra / ps.extra) */
    this.extra = 100;
    this.shield_amount = 0;
    this.firstaid_amount = 0;
    this.steroids_amount = 0;
    this.jetpack_amount = 0;
    this.scuba_amount = 0;
    this.heat_amount = 0;
    this.holoduke_amount = 0;
    this.boot_amount = 0;

    this.posxv = 0;
    this.posyv = 0;
    this.poszv = 0;

    this.on_ground = 1;
    this.jumping_counter = 0;
    this.jumping_toggle = 0;
    this.falling_counter = 0;
    this.hard_landing = 0;
    this.spritebridge = 0;
    this.on_warping_sector = 0;
    this.transporter_hold = 0;

    /** PLAYER.C return_to_center — snap horiz back after look / hard landing */
    this.return_to_center = 0;

    /** Input turn hold timer (PLAYER.C turnheldtime). */
    this.turnheldtime = 0;

    this.curr_weapon = 0;
    this.kickback_pic = 0;
    this.weapon_pos = 0;
    /** PLAYER.C weapon_sway — rest is 1024; tracks bobcounter while walking */
    this.weapon_sway = 1024;
    /** PLAYER.C bobcounter — walk phase for weapon/view bob */
    this.bobcounter = 0;
    this.bobposx = 0;
    this.bobposy = 0;
    /** Last-frame move distance (sprite.xvel stand-in for bob) */
    this.bobvel = 0;
    this.weapon_ang = 0;
    this.look_ang = 0;
    this.toggle_key_flag = 0;
    /** @type {string|null} */
    this.lastUse = null;
    /** @type {number[]} */
    this.ammo_amount = [];
    /** @type {number[]} */
    this.gotweapon = [];
    /** @type {{ index: number, life: number }[]} */
    this.fxSprites = [];
    /** @type {object|null} */
    this.lastHit = null;

    initPistol(this);
  }

  /**
   * Seed from APLAYER / DrawRooms spawn.
   * @param {{ posx: number, posy: number, posz: number, ang: number, cursectnum: number, horiz?: number }} cam
   */
  resetFromCamera(cam) {
    this.posx = cam.posx | 0;
    this.posy = cam.posy | 0;
    this.posz = cam.posz | 0;
    this.ang = cam.ang | 0;
    this.horiz = cam.horiz ?? 100;
    this.cursectnum = cam.cursectnum | 0;
    this.extra = 100;
    this.shield_amount = 0;
    this.firstaid_amount = 0;
    this.steroids_amount = 0;
    this.jetpack_amount = 0;
    this.scuba_amount = 0;
    this.heat_amount = 0;
    this.holoduke_amount = 0;
    this.boot_amount = 0;
    this.posxv = 0;
    this.posyv = 0;
    this.poszv = 0;
    this.on_ground = 1;
    this.jumping_counter = 0;
    this.jumping_toggle = 0;
    this.falling_counter = 0;
    this.hard_landing = 0;
    this.spritebridge = 0;
    this.on_warping_sector = 0;
    this.transporter_hold = 0;
    this.return_to_center = 0;
    this.turnheldtime = 0;
    this.kickback_pic = 0;
    this.weapon_pos = 0;
    this.weapon_sway = 1024;
    this.bobcounter = 0;
    this.bobposx = this.posx;
    this.bobposy = this.posy;
    this.bobvel = 0;
    this.weapon_ang = 0;
    this.look_ang = 0;
    this.toggle_key_flag = 0;
    this.lastUse = null;
    this.fxSprites = [];
    this.lastHit = null;
    initPistol(this);
  }

  /**
   * Copy eye to drawrooms camera.
   * @param {{ posx: number, posy: number, posz: number, ang: number, horiz: number, cursectnum: number }} cam
   */
  applyToCamera(cam) {
    cam.posx = this.posx;
    cam.posy = this.posy;
    cam.posz = this.posz;
    cam.ang = this.ang;
    cam.horiz = this.horiz;
    cam.cursectnum = this.cursectnum;
  }
}
