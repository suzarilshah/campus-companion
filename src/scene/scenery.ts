import { Color } from 'three';
import { ball, box, cone, cyl, type Part } from './parts';
import { BACK_STREET_X, BOUNDS, CROSS_STREETS, FORUM_WALK, FOUNTAIN, HALF_WIDTH, LOOP, POND, RADIUS, STAGE, TERMINAL, deltaZ } from './layout';
import { canWalkTo, kioskOf, lots } from './navigation';
import { landmarkBuildings, places, shuttleStops } from './places';
import { plazaOf, venues } from './venues';

/**
 * Original street-scene furniture for the illustrated tiny-planet Strip, authored in Strip coordinates and bent onto
 * the sphere at render time. Nothing here is a real map feature or coordinate.
 */
export const GROUND_TOP = 0.3;
const HALF_LOOP = LOOP / 2;
/** Side poles of the planet in Strip coordinates (x = ±πR/2): decorative mesas to the east, a lake to the west. */
const POLE_X = (Math.PI / 2) * RADIUS;

const mix = (hex: string, amount: number) => `#${new Color(hex).lerp(new Color('#ffffff'), amount).getHexString()}`;

/** Red-and-white racing kerb along a line (`axis` is the direction it runs). */
export function kerbRun(at: number, from: number, to: number, axis: 'x' | 'z', piece = 0.5): Part[] {
  const parts: Part[] = [];
  for (let i = 0, t = from; t < to - 0.05; t += piece, i++) {
    const length = Math.min(piece, to - t);
    const mid = t + length / 2;
    const color = i % 2 ? '#fbfbf6' : '#e63946';
    parts.push(axis === 'z' ? box([at, 0.29, mid], [0.18, 0.08, length], color) : box([mid, 0.29, at], [length, 0.08, 0.18], color));
  }
  return parts;
}

function palm(x: number, z: number, lean: number, height: number): Part[] {
  const top = 0.3 + height;
  const parts: Part[] = [
    cyl([x + lean * 0.5, 0.3 + height / 2, z], [0.07, 0.12, height, 6], '#a67c52', [0, 0, -lean * 0.3]),
    ball([x + lean, top, z], [0.14], '#7a5a37'),
  ];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    parts.push(cone([x + lean + Math.cos(angle) * 0.42, top - 0.02, z + Math.sin(angle) * 0.42], [0.16, 0.95, 4], i % 2 ? '#2f9e5b' : '#3fbf6e', [Math.sin(angle) * 1.25, 0, -Math.cos(angle) * 1.25]));
  }
  return parts;
}

function tree(x: number, z: number, scale: number, tint: string): Part[] {
  return [
    cyl([x, 0.3 + 0.45 * scale, z], [0.09 * scale, 0.13 * scale, 0.9 * scale, 6], '#8a6547'),
    ball([x, 0.3 + 1.2 * scale, z], [0.68 * scale, 0], tint),
    ball([x + 0.25 * scale, 0.3 + 1.7 * scale, z], [0.45 * scale, 0], mix(tint, 0.18)),
  ];
}

function flowerPlanter(x: number, z: number, palette: string[]): Part[] {
  return [box([x, 0.42, z], [0.7, 0.24, 0.42], '#c98b5a'), ...palette.map((color, i) => ball([x - 0.24 + i * 0.24, 0.62, z], [0.1], color))];
}

/** A small food cart with a striped umbrella — a generic illustrative marker, not a real vendor. */
function kiosk(x: number, z: number): Part[] {
  return [
    box([x, 0.55, z], [0.62, 0.5, 0.5], '#ffb35c'),
    box([x, 0.83, z], [0.7, 0.05, 0.58], '#fff4df'),
    cyl([x, 1.2, z], [0.03, 0.03, 0.8, 4], '#6b5a48'),
    cone([x, 1.62, z], [0.62, 0.3, 8], '#ff5d5d'),
    ball([x - 0.14, 0.95, z], [0.08], '#ffd166'), ball([x + 0.14, 0.95, z], [0.08], '#8ce99a'),
  ];
}

function shuttleSign(x: number, z: number): Part[] {
  return [cyl([x, 0.8, z], [0.035, 0.035, 1.1, 5], '#4a5560'), box([x, 1.2, z - 0.35], [0.06, 0.03, 0.8], '#4a5560'), box([x, 0.55, z - 0.35], [0.06, 0.05, 0.8], '#4a5560')];
}

/** A road running the full loop (constant x), with kerbs and optional centre dashes. */
function loopRoad(x: number, width: number, dashes: boolean): Part[] {
  const parts: Part[] = [box([x, 0.235, 0], [width, 0.07, LOOP], '#434a58'), ...kerbRun(x - width / 2 - 0.06, -HALF_LOOP, HALF_LOOP, 'z', 0.8), ...kerbRun(x + width / 2 + 0.06, -HALF_LOOP, HALF_LOOP, 'z', 0.8)];
  if (dashes) for (let z = -HALF_LOOP + 0.6; z < HALF_LOOP; z += 1.5) parts.push(box([x, 0.275, z], [0.1, 0.02, 0.75], '#f7d94c'));
  return parts;
}

export function groundParts(): Part[] {
  const parts: Part[] = [
    // The boulevard: a great circle round the whole planet, with sidewalks, lane marks and an illustrative shuttle lane.
    ...loopRoad(0, 3.2, true),
    box([-2.1, 0.25, 0], [1, 0.1, LOOP], '#f0d5bb'),
    box([2.1, 0.25, 0], [1, 0.1, LOOP], '#f0d5bb'),
    // Back streets on both sides, also full loops.
    ...loopRoad(BACK_STREET_X, 1.8, false),
    ...loopRoad(-BACK_STREET_X, 1.8, false),
    // Walk to Caesars Forum between the two small hotels.
    box([(FORUM_WALK.fromX + FORUM_WALK.toX) / 2, 0.255, FORUM_WALK.z], [FORUM_WALK.toX - FORUM_WALK.fromX, 0.1, 1.3], '#f6dcc0'),
    // Festival Grounds lawn and airport apron.
    box([STAGE.x, 0.25, STAGE.z + 1.2], [6.6, 0.06, 5.6], '#a7d86b'),
    box([TERMINAL.x, 0.25, TERMINAL.z - 1.2], [5.6, 0.06, 6.4], '#9aa3ad'),
    // Go-kart kerb along both edges of the walkable band.
    ...kerbRun(-HALF_WIDTH - 0.3, -HALF_LOOP, HALF_LOOP, 'z', 1),
    ...kerbRun(HALF_WIDTH + 0.3, -HALF_LOOP, HALF_LOOP, 'z', 1),
  ];
  for (let z = -HALF_LOOP + 0.5; z < HALF_LOOP; z += 0.9) parts.push(box([-1.4, 0.28, z], [0.08, 0.02, 0.45], '#39a0ff'), box([1.4, 0.28, z + 0.45], [0.08, 0.02, 0.45], '#39a0ff'));
  // Cross streets: meridians from pole to pole, crossing the boulevard at zebra crossings.
  for (const z of CROSS_STREETS) {
    for (const [from, to] of [[-POLE_X + 1.2, -1.7], [1.7, POLE_X - 1.2]] as const) {
      parts.push(box([(from + to) / 2, 0.232, z], [to - from, 0.07, 2], '#4a5160'), ...kerbRun(z - 1.06, from, to, 'x', 0.8), ...kerbRun(z + 1.06, from, to, 'x', 0.8));
    }
    for (let i = -3; i <= 3; i++) parts.push(box([i * 0.4, 0.279, z], [0.24, 0.02, 1], '#fbfbf6'));
  }
  for (const venue of [...venues, ...landmarkBuildings]) {
    const [x, , z] = plazaOf(venue);
    const inward = venue.side === 'west' ? 0.95 : -0.95;
    const accent = 'accent' in venue ? venue.accent : venue.color;
    parts.push(box([x, 0.26, z], [2.1, 0.12, 'accent' in venue ? 4.2 : 2.8], mix(venue.color, 0.62)));
    parts.push(box([x - inward, 0.265, z], [0.12, 0.13, 'accent' in venue ? 4.2 : 2.8], accent));
    if ('accent' in venue) parts.push(...flowerPlanter(x + inward * 0.4, z - 1.65, ['#ff6b9d', '#ffd166', '#ff9f43']), ...flowerPlanter(x + inward * 0.4, z + 1.65, ['#c77dff', '#ff6b9d', '#ffd166']));
  }
  parts.push(
    cyl([FOUNTAIN.x, 0.4, FOUNTAIN.z], [1.3, 1.3, 0.3, 28], '#f3ead6'),
    cyl([FOUNTAIN.x, 0.56, FOUNTAIN.z], [1.14, 1.14, 0.12, 28], '#4fc3e8'),
    cyl([FOUNTAIN.x, 0.95, FOUNTAIN.z], [0.28, 0.4, 0.9, 10], '#e8dfc8'),
    ball([FOUNTAIN.x, 1.55, FOUNTAIN.z], [0.28], '#8fe3ff'),
    cyl([POND.x, 0.36, POND.z], [POND.r, POND.r, 0.2, 32], '#eadbb8'),
    cyl([POND.x, 0.46, POND.z], [POND.r - 0.2, POND.r - 0.2, 0.1, 32], '#58c4dd'),
    ...[[-0.8, 0.5], [0.9, -0.4], [0.2, 0.9]].map(([dx, dz]) => cyl([POND.x + dx!, 0.53, POND.z + dz!], [0.24, 0.24, 0.04, 8], '#ff8fab')),
  );
  return parts;
}

const lotColors = ['#f4a261', '#e76f51', '#2a9d8f', '#e9c46a', '#8ecae6', '#ffb4a2', '#cdb4db'];
/** Generic filler blocks (see `lots` in navigation.ts): toy houses and shops with a roof trim and lit windows. */
export function cityParts(): Part[] {
  return lots.flatMap((lot) => {
    const color = lotColors[lot.color]!;
    const h = 0.7 + lot.floors * 0.6;
    const facing = lot.x > 0 ? -1 : 1;
    return [
      box([lot.x, 0.3 + h / 2, lot.z], [lot.hx * 2 - 0.2, h, lot.hz * 2 - 0.2], color),
      box([lot.x, 0.36 + h, lot.z], [lot.hx * 2, 0.14, lot.hz * 2], '#fdf0d5'),
      box([lot.x + facing * (lot.hx - 0.08), 0.62, lot.z], [0.04, 0.5, 0.5], '#6b4f3a'),
    ];
  });
}
export function cityGlow(): Part[] {
  return lots.flatMap((lot) => {
    const facing = lot.x > 0 ? -1 : 1;
    const parts: Part[] = [];
    for (let floor = 1; floor <= lot.floors; floor++) for (const dz of [-0.55, 0.55]) parts.push(box([lot.x + facing * (lot.hx - 0.09), 0.5 + floor * 0.6, lot.z + dz], [0.03, 0.22, 0.34], '#fff0c2'));
    return parts;
  });
}

/** Festival Grounds stage (re:Play venue per agenda) and a toy airport terminal with a plane. */
export function landmarkParts(): Part[] {
  const { x, z } = STAGE;
  const t = TERMINAL;
  return [
    box([x, 0.5, z], [STAGE.hx * 2, 0.4, STAGE.hz * 2], '#3d2b5c'),
    ...[-1.9, 1.9].map((dx) => box([x + dx, 1.6, z - 0.7], [0.25, 2.2, 0.25], '#2a1f40')),
    box([x, 2.75, z - 0.7], [4.1, 0.3, 0.3], '#2a1f40'),
    ...[-1.2, -0.4, 0.4, 1.2].map((dx, i) => cone([x + dx, 2.45, z - 0.55], [0.14, 0.3, 6], ['#ff5c8a', '#ffd166', '#06d6a0', '#4cc9f0'][i]!, [Math.PI, 0, 0])),
    ...[-2.6, 2.6].map((dx) => box([x + dx, 1.1, z + 0.2], [0.5, 1.2, 0.5], '#1c1c28')),
    box([t.x, 0.9, t.z], [t.hx * 2, 1.2, t.hz * 2], '#e8eef4'),
    box([t.x, 1.58, t.z], [t.hx * 2 + 0.3, 0.16, t.hz * 2 + 0.3], '#4cc9f0'),
    cyl([t.x + 1.4, 2.2, t.z - 0.6], [0.18, 0.22, 1.2, 8], '#e8eef4'),
    box([t.x + 1.4, 2.95, t.z - 0.6], [0.7, 0.35, 0.7], '#7fd6ff'),
    // Plane on the apron.
    cyl([t.x, 0.62, t.z - 3.4], [0.22, 0.22, 2.6, 10], '#ffffff', [0, 0, Math.PI / 2]),
    box([t.x, 0.62, t.z - 3.4], [0.5, 0.05, 2.4], '#dfe7ef'),
    box([t.x - 1.15, 0.95, t.z - 3.4], [0.35, 0.55, 0.05], '#4cc9f0'),
    cone([t.x + 1.35, 0.62, t.z - 3.4], [0.22, 0.4, 10], '#ffffff', [0, 0, -Math.PI / 2]),
  ];
}

/** Deterministic pseudo-random numbers, so the planet looks the same on every load. */
function random(seed: number) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646; };
}

export function propParts(lighter: boolean): Part[] {
  const parts: Part[] = [];
  const busy = (x: number, z: number, gap: number) => places.some((place) => Math.hypot(place.spot[0] - x, deltaZ(place.spot[2], z)) < gap)
    || CROSS_STREETS.some((street) => Math.abs(deltaZ(street, z)) < 1.4) || Math.abs(deltaZ(FORUM_WALK.z, z)) < 1;
  for (let z = -HALF_LOOP + 1; z < HALF_LOOP; z += 4.4) {
    if (!busy(-2.62, z, 1.2)) parts.push(...palm(-2.62, z, 0.18, 1.5));
    if (!busy(2.62, z + 2.2, 1.2)) parts.push(...palm(2.62, z + 2.2, -0.18, 1.6));
  }
  for (let z = -HALF_LOOP + 3; z < HALF_LOOP; z += 9) {
    parts.push(cyl([-1.72, 0.85, z], [0.035, 0.05, 1.1, 5], '#4a5560'), box([-1.5, 1.4, z], [0.42, 0.04, 0.04], '#4a5560'));
    parts.push(cyl([1.72, 0.85, z + 4.5], [0.035, 0.05, 1.1, 5], '#4a5560'), box([1.5, 1.4, z + 4.5], [0.42, 0.04, 0.04], '#4a5560'));
  }
  // Park trees wherever the city grid left open ground inside the walkable band.
  const next = random(20261201);
  const tints = ['#6cbf62', '#58ae5c', '#78c56d', '#5eb15e'];
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < (lighter ? 26 : 38); tries++) {
    const x = (next() > 0.5 ? 1 : -1) * (3.4 + next() * (HALF_WIDTH - 3.6));
    const z = -HALF_LOOP + next() * LOOP;
    if (Math.abs(Math.abs(x) - BACK_STREET_X) < 1.5 || busy(x, z, 1.6) || !canWalkTo(x, z) || !canWalkTo(x + 0.6, z) || !canWalkTo(x - 0.6, z)) continue;
    placed++;
    parts.push(...tree(x, z, 0.75 + next() * 0.45, tints[Math.floor(next() * tints.length)]!));
  }
  for (const place of places.filter((item) => item.kind === 'food')) { const k = kioskOf(place.spot); parts.push(...kiosk(k.x, k.z)); }
  for (const stop of shuttleStops) parts.push(...shuttleSign(stop.spot[0] + (stop.spot[0] > 0 ? 0.45 : -0.45), stop.spot[2]));
  return parts;
}

export function lampGlow(): Part[] {
  const parts: Part[] = [];
  for (let z = -HALF_LOOP + 3; z < HALF_LOOP; z += 9) {
    parts.push(ball([-1.32, 1.36, z], [0.13], '#ffe9a8'));
    parts.push(ball([1.32, 1.36, z + 4.5], [0.13], '#ffe9a8'));
  }
  for (const stop of shuttleStops) parts.push(box([stop.spot[0] + (stop.spot[0] > 0 ? 0.45 : -0.45), 1.5, stop.spot[2] - 0.35], [0.08, 0.34, 0.8], '#39a0ff'));
  parts.push(box([STAGE.x, 1.6, STAGE.z - 0.55], [3.4, 1.6, 0.05], '#b15cff'));
  return parts;
}

/**
 * Beyond the walkable band: desert mesas and cacti towards the east pole, a lake with reeds towards the west pole.
 * Decorative and unwalkable; nothing here is a real place.
 */
export function poleParts(lighter: boolean): Part[] {
  const parts: Part[] = [];
  const next = random(20261130);
  for (let i = 0; i < (lighter ? 20 : 40); i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (HALF_WIDTH + 1.6 + next() * (POLE_X - HALF_WIDTH - 5));
    const z = -HALF_LOOP + next() * LOOP;
    if (CROSS_STREETS.some((street) => Math.abs(deltaZ(street, z)) < 1.8 * Math.cos(x / RADIUS) + 0.4)) continue;
    const roll = next();
    if (side > 0 && roll < 0.45) {
      const h = 1.2 + next() * 2.4;
      parts.push(cone([x, 0.3 + h / 2, z], [0.9 + next() * 1.2, h, 6], next() > 0.5 ? '#c4703c' : '#d9925b'), cone([x, 0.32 + h * 0.85, z], [0.42, h * 0.3, 6], '#f2d0a4'));
    } else if (side > 0) {
      parts.push(cyl([x, 0.75, z], [0.14, 0.16, 0.9, 6], '#3f9b55'), cyl([x + 0.22, 0.85, z], [0.08, 0.08, 0.4, 5], '#3f9b55', [0, 0, 0.9]), cyl([x - 0.2, 0.95, z], [0.08, 0.08, 0.35, 5], '#3f9b55', [0, 0, -0.9]));
    } else if (roll < 0.5) {
      parts.push(...tree(x, z, 0.8 + next() * 0.5, '#4f9d58'));
    } else {
      parts.push(ball([x, 0.4, z], [0.3 + next() * 0.35, 0], '#b8a58c'));
    }
  }
  return parts;
}

export function carParts(color: string): Part[] {
  return [
    box([0, 0.5, 0], [0.5, 0.26, 1.05], color),
    box([0, 0.72, -0.05], [0.42, 0.22, 0.55], mix(color, 0.35)),
    box([0, 0.745, 0.05], [0.44, 0.13, 0.28], '#2f3e4e'),
    ...[-0.27, 0.27].flatMap((x) => [-0.32, 0.32].map((z) => cyl([x, 0.36, z], [0.1, 0.1, 0.1, 8], '#20242b', [0, 0, Math.PI / 2]))),
  ];
}
/** A toy shuttle bus. Its loop along the kerb lane is illustrative; no real route or timetable is implied. */
export function busParts(): Part[] {
  return [
    box([0, 0.66, 0], [0.62, 0.6, 2], '#118ab2'),
    box([0, 0.99, 0], [0.64, 0.06, 2.02], '#ffffff'),
    box([0, 0.72, 0], [0.64, 0.22, 1.7], '#bde7ff'),
    box([0, 0.5, 0.99], [0.5, 0.16, 0.04], '#ffd166'),
    ...[-0.32, 0.32].flatMap((x) => [-0.65, 0.65].map((z) => cyl([x, 0.38, z], [0.13, 0.13, 0.1, 8], '#20242b', [0, 0, Math.PI / 2]))),
  ];
}
/** Cars lap the whole planet on the boulevard. */
export const CARS = [
  { color: '#ef476f', lane: -0.82, dir: 1, z: -40, speed: 2.2 },
  { color: '#ffd166', lane: -0.82, dir: 1, z: 0, speed: 1.8 },
  { color: '#06d6a0', lane: -0.82, dir: 1, z: 35, speed: 2 },
  { color: '#4cc9f0', lane: 0.82, dir: -1, z: -20, speed: 1.9 },
  { color: '#f4f4ef', lane: 0.82, dir: -1, z: 15, speed: 2.3 },
  { color: '#ff9f1c', lane: 0.82, dir: -1, z: 52, speed: 1.7 },
] as const;
export { BOUNDS, LOOP };
