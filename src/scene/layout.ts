/**
 * World layout on the tiny planet. Gameplay uses "Strip coordinates":
 *   z — distance along the Strip loop (periodic: the boulevard is a great circle around the whole planet),
 *   x — distance across it (east +, west −).
 * Rendering maps (x, z) onto the sphere (see globe.ts); x = 0 is the boulevard's centre line.
 * Everything here is an original illustration; spacing is chosen so venues are spread evenly around the globe.
 */
export const RADIUS = 20;
/** One full lap of the Strip loop. */
export const LOOP = 2 * Math.PI * RADIUS;
/** Walkable band across the Strip; beyond it the planet's two "poles" are decorative desert and lake country. */
export const HALF_WIDTH = 16.5;
export const BOUNDS = { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minZ: -LOOP / 2, maxZ: LOOP / 2 } as const;

/** Wrap a Strip distance into [-LOOP/2, LOOP/2). */
export function wrapZ(z: number) {
  return ((((z + LOOP / 2) % LOOP) + LOOP) % LOOP) - LOOP / 2;
}
/** Shortest signed difference b − a along the loop. */
export function deltaZ(a: number, b: number) {
  return wrapZ(b - a);
}
export function distance(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(bx - ax, deltaZ(az, bz));
}

/** Parallel back streets on each side of the boulevard, and cross streets that run pole to pole. */
export const BACK_STREET_X = 10.2;
export const CROSS_STREETS = [-54, -39, -23.5, -8, 5.5, 30.5, 47] as const;

export const FOUNTAIN = { x: -9.8, z: -8, r: 1.3 };
export const POND = { x: -12.6, z: 47, r: 2.1 };
export const STAGE = { x: -8.6, z: -47, hx: 2.3, hz: 1.2 };
export const TERMINAL = { x: 8.8, z: 55, hx: 2.2, hz: 1.6 };
/** The paved walk from the boulevard between the two small hotels to Caesars Forum's plaza. */
export const FORUM_WALK = { z: 14, fromX: 2.6, toX: 11 };
