/**
 * Timing and engine limits from DUKE3D.H / BUILD.H.
 */

/**
 * Effective game simulation rate used by GameLoop.
 * Vanilla uses TICRATE 120 with TICSPERFRAME ≈ 4 (~26 Hz displayed frames).
 */
export const TICRATE = 26;

/** Build / control timer rate in the C source (DUKE3D.H). */
export const BUILD_TICRATE = 120;

/** Clocks advanced per frame in vanilla (DUKE3D.H — TICSPERFRAME). */
export const TICSPERFRAME = (BUILD_TICRATE / 26) | 0;

export const MAXSECTORS = 1024;
export const MAXWALLS = 8192;
export const MAXSPRITES = 4096;
/** Build BUILD.H MAXTILES (Duke game header may list 6144; engine uses 9216). */
export const MAXTILES = 9216;
export const MAXPLAYERS = 16;
