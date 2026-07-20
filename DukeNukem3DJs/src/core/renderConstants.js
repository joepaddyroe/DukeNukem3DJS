/**
 * Screen and fixed-point constants (classic VGA + Build-style 16.16).
 */

export const SCREENWIDTH = 320;
export const SCREENHEIGHT = 200;

export const FRACBITS = 16;
export const FRACUNIT = 1 << FRACBITS;

/** Build uses a 2048-unit full circle for angles. */
export const BUILD_ANGLE_MASK = 2047;
export const BUILD_ANGLES = 2048;
