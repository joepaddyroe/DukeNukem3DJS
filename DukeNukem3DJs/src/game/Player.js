/**
 * Duke player_struct subset — DUKE3D.H / PLAYER.C.
 * Full weapons / inventory / CON later.
 */
export class Player {
  constructor() {
    this.posx = 0;
    this.posy = 0;
    this.posz = 0;
    this.ang = 0;
    this.horiz = 100;
    this.cursectnum = 0;

    this.posxv = 0;
    this.posyv = 0;
    this.poszv = 0;

    this.on_ground = 1;
    this.jumping_counter = 0;
    this.jumping_toggle = 0;
    this.falling_counter = 0;
    this.hard_landing = 0;
    this.spritebridge = 0;

    /** Input turn hold timer (PLAYER.C turnheldtime). */
    this.turnheldtime = 0;
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
    this.posxv = 0;
    this.posyv = 0;
    this.poszv = 0;
    this.on_ground = 1;
    this.jumping_counter = 0;
    this.jumping_toggle = 0;
    this.falling_counter = 0;
    this.hard_landing = 0;
    this.spritebridge = 0;
    this.turnheldtime = 0;
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
