import { ball, box, cone, cyl, ring, type Part } from './parts';
import { roofHeight, type VenueId } from './venues';

/**
 * Original low-poly models that evoke each property's real, publicly visible silhouette (curved bronze towers,
 * a campanile, a cross-shaped green tower, an observation wheel). They are stylised illustrations built from
 * primitives: no logos, signage text, textures or third-party models. Local +z faces the boulevard; the footprint
 * stays within about 4.6 × 3.8 so collision and plazas are unchanged.
 */
export type Building = { solid: Part[]; glow: Part[]; top: number };

const G = 0.3; // ground level
const CREAM = '#f4ead6';

/** A concave curved slab tower, made of rotated segments on an arc whose centre lies in front of the building. */
function curvedTower(o: { radius: number; spread: number; back: number; height: number; depth: number; segments: number; body: string; band: string; trim: string; x?: number; base?: number }) {
  const solid: Part[] = [];
  const glow: Part[] = [];
  const cz = o.radius + o.back;
  const base = o.base ?? G;
  const width = (2 * o.radius * Math.sin(o.spread / o.segments)) * 1.04;
  for (let i = 0; i < o.segments; i++) {
    const t = -o.spread + (o.spread * 2 * (i + 0.5)) / o.segments;
    const x = (o.x ?? 0) + o.radius * Math.sin(t);
    const z = cz - o.radius * Math.cos(t);
    // Slightly stepped crown, like the real towers' sloping tops.
    const h = o.height - Math.abs(t) * 1.4;
    solid.push(box([x, base + h / 2, z], [width, h, o.depth], o.body, [0, -t, 0]));
    solid.push(box([x, base + h + 0.06, z], [width * 1.02, 0.12, o.depth * 1.04], o.trim, [0, -t, 0]));
    const nx = -Math.sin(t);
    const nz = Math.cos(t);
    for (let y = base + 0.7; y < base + h - 0.2; y += 0.42) glow.push(box([x + nx * (o.depth / 2 + 0.02), y, z + nz * (o.depth / 2 + 0.02)], [width * 0.98, 0.07, 0.03], o.band, [0, -t, 0]));
  }
  return { solid, glow };
}

/** Wynn: a tall, concave bronze-glass curve over a low podium, with a green "mountain" garden beside it. */
function wynn(): Building {
  const tower = curvedTower({ radius: 4.2, spread: 0.5, back: -1.6, height: roofHeight.wynn - G, depth: 0.95, segments: 9, body: '#a87b45', band: '#f0c77c', trim: '#d9b47a' });
  return {
    top: roofHeight.wynn,
    solid: [
      box([0, G + 0.05, 0], [4.6, 0.12, 3.8], '#e8dcc2'),
      ...tower.solid,
      box([0.2, G + 0.45, 1.1], [3.4, 0.8, 1.2], '#efe2c8'),
      box([0.2, G + 0.9, 1.75], [3.6, 0.1, 0.45], '#8b6a3e'),
      ...[[-1.7, 0.9, 0.95], [-1.95, 0.5, 1.4], [-1.4, 1.35, 0.65]].map(([x, z, s]) => ball([x!, G + s! * 0.55, z!], [s!, 0], '#3f8f4e')),
    ],
    glow: [...tower.glow, ...[-1, -0.3, 0.4, 1.1].map((x) => box([x + 0.2, G + 0.45, 1.71], [0.5, 0.4, 0.02], '#ffe4a8'))],
  };
}

/** Encore: Wynn's shorter sibling, a deeper copper-red curve with a red-canopied entrance. */
function encore(): Building {
  const tower = curvedTower({ radius: 3.8, spread: 0.55, back: -1.5, height: roofHeight.encore - G, depth: 0.9, segments: 8, body: '#8f4a34', band: '#f3a684', trim: '#c27c5c' });
  return {
    top: roofHeight.encore,
    solid: [
      box([0, G + 0.05, 0], [4.6, 0.12, 3.8], '#ecd9cc'),
      ...tower.solid,
      box([0, G + 0.4, 1.15], [3.2, 0.7, 1.1], '#f2e0d2'),
      box([0, G + 0.8, 1.72], [2.4, 0.1, 0.5], '#c0283c'),
      ...[-1, 1].map((x) => cyl([x, G + 0.4, 1.9], [0.06, 0.06, 0.8, 6], '#fff3ea')),
      ...[-1.8, 1.8].map((x) => ball([x, G + 0.45, 1.5], [0.38, 0], '#c0283c')),
    ],
    glow: [...tower.glow, box([0, G + 0.4, 1.71], [1.6, 0.35, 0.02], '#ffd6c2')],
  };
}

/**
 * A Grand-Canal-style waterway across the front, with stone banks, a gondola and a Rialto-style covered bridge
 * (an original simplification: arched deck, balustrades and a small arcaded pavilion with a red roof).
 * The canal runs along x at z ≈ 1.15–1.85, inside the building footprint, so the visitor never walks on water.
 */
function canalAndBridge(): Part[] {
  const parts: Part[] = [
    // Water sits above the building's base slab (top ≈ G + 0.11) so it is clearly visible.
    box([0, G + 0.14, 1.48], [4.5, 0.06, 0.84], '#1f8fd1'),
    box([0, G + 0.175, 1.48], [4.5, 0.01, 0.7], '#4cc3ef'),
    box([0, G + 0.2, 1.02], [4.6, 0.2, 0.12], '#efe4cc'),
    box([0, G + 0.2, 1.94], [4.6, 0.2, 0.12], '#efe4cc'),
  ];
  // Arched deck in segments, from bank to bank (spanning z), with balustrades on both sides.
  const bridgeX = 0.6;
  const segments = 11;
  const rise = 0.62;
  const half = 0.58;
  for (let i = 0; i < segments; i++) {
    const t0 = -1 + (2 * i) / segments;
    const t1 = -1 + (2 * (i + 1)) / segments;
    const tm = (t0 + t1) / 2;
    const z = 1.48 + tm * half;
    const y = G + 0.24 + rise * (1 - tm * tm);
    const slope = Math.atan(-2 * rise * tm / half);
    const length = Math.hypot((t1 - t0) * half, rise * ((1 - t1 * t1) - (1 - t0 * t0))) + 0.02;
    parts.push(box([bridgeX, y, z], [0.95, 0.12, length], '#fbf6ea', [slope, 0, 0]));
    parts.push(box([bridgeX - 0.47, y + 0.14, z], [0.07, 0.24, length], '#efe4cc', [slope, 0, 0]));
    parts.push(box([bridgeX + 0.47, y + 0.14, z], [0.07, 0.24, length], '#efe4cc', [slope, 0, 0]));
    // Solid spandrel under the outer arch, so the bridge reads clearly from the side.
    if (Math.abs(tm) > 0.35) parts.push(box([bridgeX, (G + 0.16 + y) / 2, z], [0.85, Math.max(0.05, y - G - 0.16), (t1 - t0) * half], '#e9dfca'));
  }
  // Rialto-style pavilion on the crown: two arcaded halves and a red pitched roof.
  const crown = G + 0.24 + rise;
  parts.push(box([bridgeX - 0.3, crown + 0.26, 1.48], [0.22, 0.42, 0.4], '#f8f1e2'));
  parts.push(box([bridgeX + 0.3, crown + 0.26, 1.48], [0.22, 0.42, 0.4], '#f8f1e2'));
  parts.push(box([bridgeX, crown + 0.5, 1.48], [0.9, 0.07, 0.5], '#efe4cc'));
  parts.push(cone([bridgeX, crown + 0.68, 1.48], [0.6, 0.32, 4], '#c0533b', [0, Math.PI / 4, 0]));
  // Gondola with a striped gondolier, floating on the water (surface ≈ G + 0.18), beside the bridge.
  const w = G + 0.18;
  parts.push(box([-0.9, w + 0.04, 1.48], [1.1, 0.09, 0.22], '#1f1f26'));
  parts.push(box([-1.48, w + 0.12, 1.48], [0.18, 0.06, 0.13], '#1f1f26', [0, 0, 0.7]));
  parts.push(box([-0.32, w + 0.12, 1.48], [0.18, 0.06, 0.13], '#1f1f26', [0, 0, -0.7]));
  parts.push(box([-0.38, w + 0.17, 1.48], [0.08, 0.07, 0.13], '#d9b34a'));
  parts.push(cyl([-1.18, w + 0.26, 1.48], [0.07, 0.08, 0.32, 6], '#ffffff'));
  parts.push(cyl([-1.18, w + 0.2, 1.48], [0.085, 0.085, 0.05, 6], '#c0283c'));
  parts.push(cyl([-1.18, w + 0.3, 1.48], [0.085, 0.085, 0.05, 6], '#c0283c'));
  parts.push(ball([-1.18, w + 0.5, 1.48], [0.075, 0], '#f1c27d'));
  parts.push(cyl([-1.18, w + 0.58, 1.48], [0.11, 0.11, 0.03, 8], '#e8d27a'));
  parts.push(cyl([-1.05, w + 0.3, 1.48], [0.015, 0.015, 0.8, 4], '#6b4a2e', [0, 0, -0.35]));
  return parts;
}

/** The Venetian: campanile, Doge's-palace style arcade and canal in front; cream hotel towers with red roofs behind. */
function venetian(): Building {
  const solid: Part[] = [
    box([0, G + 0.05, 0], [4.6, 0.12, 3.8], '#efe2c6'),
    // Hotel towers behind (a main slab with two angled wings) and a taller tower to one side.
    box([0.2, G + 2.6, -1.1], [2.4, 5.2, 0.8], '#ead7b4'),
    box([-0.9, G + 2.3, -0.6], [0.8, 4.6, 1.8], '#e4cfa8', [0, 0.5, 0]),
    box([1.3, G + 2.3, -0.6], [0.8, 4.6, 1.8], '#e4cfa8', [0, -0.5, 0]),
    box([0.2, G + 5.28, -1.1], [2.5, 0.16, 0.9], '#b5523b'),
    box([1.85, G + (roofHeight.venetian - G) / 2, -1.45], [0.8, roofHeight.venetian - G, 0.8], '#dcc59b'),
    box([1.85, roofHeight.venetian + 0.08, -1.45], [0.9, 0.16, 0.9], '#b5523b'),
    // Palace arcade: pink upper storey over a white colonnade, set back behind the canal.
    box([0.3, G + 1.25, 0.45], [3.2, 0.7, 0.9], '#e8b3a4'),
    box([0.3, G + 1.64, 0.45], [3.3, 0.08, 1], '#f8efe3'),
    box([0.3, G + 0.42, 0.3], [3.2, 0.8, 0.6], '#f6eee2'),
    ...[-1.1, -0.6, -0.1, 0.4, 0.9, 1.4, 1.8].map((x) => cyl([x, G + 0.42, 0.87], [0.07, 0.07, 0.8, 6], CREAM)),
    // Campanile: brick shaft, white belfry, green pyramid, gold tip.
    box([-1.75, G + 1.9, 0.55], [0.55, 3.8, 0.55], '#b35a3e'),
    box([-1.75, G + 4, 0.55], [0.62, 0.45, 0.62], CREAM),
    cone([-1.75, G + 4.55, 0.55], [0.5, 0.75, 4], '#3f8f6e', [0, Math.PI / 4, 0]),
    ball([-1.75, G + 5, 0.55], [0.07, 0], '#f2c14e'),
    ...canalAndBridge(),
  ];
  const glow: Part[] = [];
  for (const y of [1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8]) {
    glow.push(box([0.2, G + y, -0.68], [2.2, 0.12, 0.02], '#ffe8b8'));
    glow.push(box([1.85, G + y, -1.03], [0.6, 0.12, 0.02], '#ffe8b8'));
  }
  for (const x of [-0.9, -0.3, 0.3, 0.9, 1.5]) glow.push(box([x, G + 1.25, 0.91], [0.28, 0.3, 0.02], '#fff0c9'));
  // Light ripples on the canal, and lanterns on the bridge, that brighten at night.
  for (const x of [-1.9, -1.2, -0.2, 1.5, 2]) glow.push(box([x, G + 0.185, 1.4 + (x % 0.5) * 0.3], [0.32, 0.01, 0.04], '#c9f3ff'));
  for (const z of [0.92, 2.04]) for (const x of [0.13, 1.07]) glow.push(ball([x, G + 0.5, z], [0.07, 0], '#ffe1a0'));
  return { top: roofHeight.venetian, solid, glow };
}

/** Caesars Palace: white towers with blue glass, a curved crescent tower, a Roman portico and fountains. */
function palace(): Building {
  const crescent = curvedTower({ radius: 3.4, spread: 0.55, back: -1.7, height: roofHeight.palace - G - 0.4, depth: 0.75, segments: 7, body: '#f2efe8', band: '#7fb5e8', trim: '#c9b27a' });
  return {
    top: roofHeight.palace,
    solid: [
      box([0, G + 0.05, 0], [4.6, 0.12, 3.8], '#f1e9d6'),
      ...crescent.solid,
      box([-1.6, G + 2.7, -0.4], [0.9, 5.4, 1], '#f4f1ea'),
      box([-1.6, G + 5.45, -0.4], [1, 0.12, 1.1], '#c9b27a'),
      // Portico: steps, columns, entablature and pediment.
      box([0.4, G + 0.12, 1.25], [2.6, 0.2, 1], '#efe7d4'),
      ...[-0.6, -0.15, 0.3, 0.75, 1.2, 1.6].map((x) => cyl([x, G + 0.75, 1.5], [0.08, 0.09, 1.1, 8], '#fbf8f1')),
      box([0.5, G + 1.38, 1.4], [2.6, 0.18, 0.5], '#fbf8f1'),
      cone([0.5, G + 1.62, 1.4], [1.45, 0.4, 4], '#efe7d4', [0, Math.PI / 4, 0]),
      // Fountains and a gilded statue.
      ...[-1.5, 2].map((x) => cyl([x, G + 0.1, 1.55], [0.42, 0.42, 0.14, 14], '#e9e4d8')),
      ...[-1.5, 2].map((x) => cyl([x, G + 0.16, 1.55], [0.36, 0.36, 0.06, 14], '#5ab8e0')),
      ...[-1.5, 2].map((x) => cyl([x, G + 0.45, 1.55], [0.05, 0.08, 0.6, 6], '#bde9ff')),
      cyl([0.5, G + 0.35, 1.95], [0.1, 0.12, 0.5, 6], '#efe7d4'),
      ball([0.5, G + 0.72, 1.95], [0.14, 0], '#d4a943'),
    ],
    glow: [...crescent.glow, ...[0.8, 1.4, 2, 2.6, 3.2, 3.8, 4.4, 5].map((y) => box([-1.6, G + y, 0.11], [0.7, 0.14, 0.02], '#9fcbf0'))],
  };
}

/** Caesars Forum: a modern, low, wide conference centre with a glass front, timber canopy and skylit roof. */
function forum(): Building {
  return {
    top: roofHeight.forum,
    solid: [
      box([0, G + 0.05, 0], [4.6, 0.12, 3.8], '#e9e5dc'),
      box([0, G + 0.9, -0.2], [4.4, 1.7, 3.2], '#dcd8cf'),
      box([0, G + 1.82, -0.2], [4.6, 0.14, 3.4], '#bdb7aa'),
      box([0, G + 2.1, -0.4], [3.2, 0.42, 2.2], '#cfcac0'),
      ...[-1.1, 0, 1.1].map((x) => box([x, G + 2.36, -0.4], [0.7, 0.1, 1.8], '#a9d6e5')),
      box([0, G + 0.65, 1.42], [3.8, 1.1, 0.06], '#2f4b5c'),
      box([0, G + 1.35, 1.75], [4.2, 0.12, 0.8], '#9a6b43'),
      ...[-1.8, -0.6, 0.6, 1.8].map((x) => cyl([x, G + 0.65, 2.05], [0.05, 0.05, 1.3, 6], '#6b4a2e')),
      box([0, G + 0.1, 2], [3, 0.08, 0.6], '#d8d2c4'),
    ],
    glow: [...[-1.4, -0.7, 0, 0.7, 1.4].map((x) => box([x, G + 0.65, 1.46], [0.55, 0.85, 0.02], '#cfefff')), ...[-1.1, 0, 1.1].map((x) => box([x, G + 2.42, -0.4], [0.6, 0.02, 1.6], '#fff6d8'))],
  };
}

/** MGM Grand: an emerald glass tower in a cross (plus) plan with stepped wings, and a golden lion at the entrance. */
function mgm(): Building {
  const top = roofHeight.mgm;
  const solid: Part[] = [
    box([0, G + 0.05, 0], [4.6, 0.12, 3.8], '#e6efe5'),
    box([0, G + 0.45, 0.2], [4.4, 0.8, 3.4], '#e9f2ea'),
    // Cross plan: two crossing slabs with stepped ends.
    box([0, G + (top - G) / 2, -0.4], [4.2, top - G, 0.9], '#1f8a57'),
    box([0, G + (top - G - 0.5) / 2, -0.4], [0.9, top - G - 0.5, 3], '#23955f'),
    ...[-1.75, 1.75].map((x) => box([x, G + (top - G - 1) / 2, -0.4], [0.7, top - G - 1, 1], '#1b7c4e')),
    box([0, top + 0.1, -0.4], [1.1, 0.2, 1.1], '#126b42'),
    // Golden lion on a pedestal.
    box([0, G + 0.25, 1.55], [0.7, 0.5, 0.5], '#e7dcc0'),
    ball([0, G + 0.72, 1.55], [0.28, 0], '#d9a63a'),
    ball([0, G + 1.02, 1.72], [0.17, 0], '#e2b44a'),
    box([0, G + 0.92, 1.2], [3.2, 0.1, 0.5], '#d9a63a'),
  ];
  const glow: Part[] = [];
  for (let y = G + 1.1; y < top - 0.3; y += 0.4) {
    glow.push(box([0, y, 0.07], [4, 0.09, 0.02], '#9ff0c5'));
    if (y < top - 0.8) glow.push(box([0, y, 1.11], [0.75, 0.09, 0.02], '#b6f5d3'));
  }
  return { top, solid, glow };
}

/** The LINQ: a slim white-and-blue tower with a giant observation wheel behind it. */
export function linq(): Building {
  return withDetail(linqBase(), linqDetail());
}
function linqBase(): Building {
  const solid: Part[] = [
    box([0, G + 0.05, 0], [4.3, 0.12, 3], '#ece9f2'),
    box([0.6, G + 2.3, -0.3], [2.4, 4.6, 1.1], '#f3f5fa'),
    box([0.6, G + 4.68, -0.3], [2.5, 0.14, 1.2], '#4a6fd1'),
    ...[-0.2, 0.6, 1.4].map((x) => box([x, G + 2.3, 0.27], [0.12, 4.4, 0.03], '#4a6fd1')),
    box([0.4, G + 0.45, 0.9], [3.2, 0.8, 0.9], '#e2def0'),
    // Observation wheel: rim, hub, spokes, cabins and legs (plane parallel to the boulevard).
    ring([-1.3, G + 2.6, -0.9], [2, 0.07, 6, 40], '#f7f7f7'),
    ...[0, 1, 2, 3, 4, 5].map((i) => box([-1.3, G + 2.6, -0.9], [0.04, 4, 0.04], '#dcdcdc', [0, 0, (i * Math.PI) / 6])),
    cyl([-1.3, G + 2.6, -0.9], [0.18, 0.18, 0.3, 10], '#bbbbbb', [Math.PI / 2, 0, 0]),
    ...[-1, 1].map((side) => box([-1.3 + side * 0.65, G + 1.3, -0.9], [0.12, 2.7, 0.12], '#cfcfcf', [0, 0, side * 0.45])),
  ];
  const glow: Part[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    glow.push(ball([-1.3 + Math.cos(a) * 2, G + 2.6 + Math.sin(a) * 2, -0.9], [0.13, 0], i % 2 ? '#bfe3ff' : '#ffd6f0'));
  }
  for (let y = G + 0.9; y < G + 4.4; y += 0.45) glow.push(box([0.6, y, 0.26], [2.2, 0.1, 0.02], '#e8efff'));
  return { top: roofHeight.linq, solid, glow };
}

/** Harrah's: a red tower with gold bands and crown over a carnival-coloured podium. */
export function harrahs(): Building {
  return withDetail(harrahsBase(), harrahsDetail());
}
function harrahsBase(): Building {
  const solid: Part[] = [
    box([0, G + 0.05, 0], [4.3, 0.12, 3], '#f3e4d6'),
    box([0, G + 2.35, -0.3], [3, 4.7, 1.2], '#b8322b'),
    box([0, G + 4.78, -0.3], [3.1, 0.16, 1.3], '#e2b14a'),
    box([0, G + 5.02, -0.3], [1.2, 0.3, 0.8], '#e2b14a'),
    box([0, G + 0.5, 0.85], [3.6, 0.9, 1], '#f1d9b6'),
    box([0, G + 1.0, 1.4], [3.8, 0.12, 0.4], '#d0402f'),
  ];
  const glow: Part[] = [];
  for (let y = G + 1.3; y < G + 4.6; y += 0.5) glow.push(box([0, y, 0.31], [2.8, 0.09, 0.02], '#ffd88a'));
  return { top: roofHeight.harrahs, solid, glow };
}


/* ------------------------------------------------------------------------------------------------------------------
 * Extra detail per property (still original primitives). Kept inside each footprint and added on top of the base
 * model, so silhouettes stay recognisable while close-ups gain entrances, pools, landscaping and lighting.
 * ---------------------------------------------------------------------------------------------------------------- */
type Detail = { solid: Part[]; glow: Part[] };
const cypress = (x: number, z: number, h = 0.9): Part[] => [cyl([x, G + 0.08, z], [0.05, 0.06, 0.16, 5], '#6b4a2e'), cone([x, G + 0.16 + h / 2, z], [0.15, h, 6], '#2f6b45')];
const shrub = (x: number, z: number, r = 0.18, c = '#3f8f4e'): Part => ball([x, G + r * 0.8, z], [r, 0], c);
const umbrella = (x: number, z: number, c: string): Part[] => [cyl([x, G + 0.3, z], [0.015, 0.015, 0.5, 4], '#ffffff'), cone([x, G + 0.58, z], [0.22, 0.12, 8], c)];
const pool = (x: number, z: number, w: number, d: number): Part[] => [box([x, G + 0.13, z], [w + 0.12, 0.06, d + 0.12], '#f4efe4'), box([x, G + 0.15, z], [w, 0.04, d], '#3fb4e0')];
const lounger = (x: number, z: number): Part => box([x, G + 0.16, z], [0.12, 0.04, 0.24], '#ffffff');
const porteCochere = (x: number, z: number, w: number, roof: string, post: string): Part[] => [
  box([x, G + 0.62, z], [w, 0.08, 0.5], roof),
  ...[-1, 1].flatMap((side) => [cyl([x + side * (w / 2 - 0.08), G + 0.33, z + 0.18], [0.04, 0.04, 0.58, 6], post), cyl([x + side * (w / 2 - 0.08), G + 0.33, z - 0.18], [0.04, 0.04, 0.58, 6], post)]),
];

function wynnDetail(): Detail {
  return {
    solid: [
      // Gold-trimmed porte-cochère, waterfall off the garden mound, and a terrace pool behind the tower.
      ...porteCochere(1.7, 1.5, 0.9, '#d9b47a', '#f3e6c8'),
      cyl([-1.55, G + 0.45, 1.68], [0.12, 0.2, 0.7, 8], '#7fd3ef'),
      box([-1.55, G + 0.1, 1.82], [0.6, 0.04, 0.14], '#4cc3ef'),
      ...pool(1.2, -1.55, 1.1, 0.4), lounger(0.55, -1.55), lounger(1.85, -1.55),
      ...umbrella(-0.5, -1.6, '#f3e6c8'), ...umbrella(-1.2, -1.6, '#f3e6c8'),
      shrub(-2.05, 0.3, 0.2), shrub(-2.1, -0.3, 0.16, '#4f9d58'), shrub(2.05, 0.6, 0.18),
      ...cypress(2.1, 1.0), ...cypress(-0.7, 1.82, 0.6),
    ],
    glow: [box([1.7, G + 0.57, 1.5], [0.82, 0.02, 0.42], '#ffe9b0')],
  };
}

function encoreDetail(): Detail {
  return {
    solid: [
      // Red-and-gold domed entrance pavilion, flower beds, and a pool deck with red umbrellas.
      cyl([1.75, G + 0.35, 1.35], [0.4, 0.45, 0.6, 10], '#f2e0d2'),
      ball([1.75, G + 0.75, 1.35], [0.38, 1], '#c0283c'),
      ball([1.75, G + 1.13, 1.35], [0.07, 0], '#e8c27a'),
      ...[-1.7, -1.3, -0.9].map((x, i) => ball([x, G + 0.12, 1.82], [0.1, 0], ['#ff5c8a', '#ffd166', '#c0283c'][i]!)),
      ...pool(-0.2, -1.6, 1.4, 0.38),
      ...umbrella(-1.5, -1.62, '#c0283c'), ...umbrella(1.1, -1.62, '#c0283c'), ...umbrella(1.6, -1.62, '#c0283c'),
      lounger(0.75, -1.55), lounger(-1.05, -1.55),
      ...cypress(-2.1, 0.9), ...cypress(2.15, 0.2), shrub(-2.05, -0.4, 0.18),
    ],
    glow: [box([1.75, G + 0.35, 1.76], [0.3, 0.4, 0.02], '#ffd6c2'), ...[-1, 0, 1].map((x) => ball([x * 0.6, G + 0.95, 1.78], [0.06, 0], '#ffb3a0'))],
  };
}

function palaceDetail(): Detail {
  return {
    solid: [
      // A third tower, a row of cypress trees, statues on plinths and a central gilded dome over the entrance.
      box([1.85, G + 2.1, -1.35], [0.8, 4.2, 0.8], '#f4f1ea'),
      box([1.85, G + 4.25, -1.35], [0.9, 0.1, 0.9], '#c9b27a'),
      ball([0.5, G + 2.05, 1.1], [0.32, 1], '#d4a943'),
      cyl([0.5, G + 1.82, 1.1], [0.34, 0.36, 0.12, 12], '#efe7d4'),
      ...[-2.15, -1.05, 2.15].flatMap((x) => cypress(x, 1.85, 0.8)),
      ...[-0.9, 1.9].flatMap((x) => [box([x, G + 0.2, 1.88], [0.18, 0.4, 0.18], '#efe7d4'), cyl([x, G + 0.55, 1.88], [0.05, 0.06, 0.3, 6], '#f7f3ea'), ball([x, G + 0.75, 1.88], [0.07, 0], '#f7f3ea')]),
      box([0.4, G + 0.22, 1.85], [2.4, 0.04, 0.12], '#d4a943'),
    ],
    glow: [...[1.0, 1.6, 2.2, 2.8, 3.4].map((y) => box([1.85, G + y, -0.94], [0.6, 0.12, 0.02], '#9fcbf0')), box([0.5, G + 1.2, 1.66], [1.6, 0.06, 0.02], '#ffe6a6')],
  };
}

function forumDetail(): Detail {
  return {
    solid: [
      // Colourful event banners on poles, rooftop plant, planters and benches on the forecourt.
      ...[-2.15, -1.2, 1.2, 2.15].flatMap((x, i) => [cyl([x, G + 0.85, 2.08], [0.025, 0.025, 1.6, 4], '#6f7d86'), box([x + 0.12, G + 1.35, 2.08], [0.22, 0.55, 0.02], ['#ff9f1c', '#20c9c0', '#ef476f', '#7b61d1'][i]!)]),
      box([1.5, G + 2.42, -1.3], [0.7, 0.24, 0.5], '#9aa3ab'), box([-1.5, G + 2.42, -1.3], [0.7, 0.24, 0.5], '#9aa3ab'),
      ...[-2.12, 2.12].flatMap((x) => [box([x, G + 0.16, 1.62], [0.32, 0.2, 0.4], '#8a6a4e'), shrub(x, 1.62, 0.16)]),
  ],
    glow: [box([0, G + 1.1, 1.46], [3.6, 0.04, 0.02], '#fff2c2')],
  };
}

function mgmDetail(): Detail {
  return {
    solid: [
      // Lighter green podium bands, entrance canopy posts, palms and a big glowing marquee screen.
      box([0, G + 0.86, 0.2], [4.45, 0.06, 3.45], '#d9a63a'),
      ...[-1.2, 1.2].map((x) => cyl([x, G + 0.45, 1.4], [0.05, 0.05, 0.9, 6], '#f3e6c8')),
      box([1.9, G + 0.95, 1.5], [0.12, 1.6, 0.12], '#4a5560'),
      ...[-2.05, -1.65].flatMap((x) => [cyl([x, G + 0.45, 1.75], [0.04, 0.06, 0.9, 5], '#a67c52'), cone([x, G + 0.95, 1.75], [0.32, 0.18, 6], '#3fbf6e')]),
      ...pool(0, -1.65, 2.2, 0.3), ...umbrella(-1.3, -1.7, '#d9a63a'), ...umbrella(1.3, -1.7, '#d9a63a'),
    ],
    glow: [box([1.9, G + 1.45, 1.57], [0.5, 0.6, 0.02], '#7ff5c1'), box([0, G + 0.62, 1.86], [2.6, 0.06, 0.02], '#ffe6a6')],
  };
}

function linqDetail(): Detail {
  return {
    solid: [
      // The promenade: a row of small shops with striped awnings and string lights, leading to the wheel.
      ...[-1.9, -1.35, -0.8].flatMap((x, i) => [box([x, G + 0.3, 1.2], [0.5, 0.5, 0.45], ['#ffb4a2', '#cdb4db', '#8ecae6'][i]!), box([x, G + 0.58, 1.48], [0.52, 0.04, 0.18], i % 2 ? '#ffffff' : '#ef476f', [0.3, 0, 0])]),
      ...[-1.9, -0.8].map((x) => cyl([x, G + 0.55, 1.75], [0.015, 0.015, 0.5, 4], '#6b5a48')),
      shrub(1.9, 1.3, 0.2), shrub(2, 0.5, 0.16, '#4f9d58'),
    ],
    glow: [...[-2, -1.6, -1.2, -0.8].map((x) => ball([x, G + 0.78, 1.75], [0.035, 0], '#fff2b8')), ...[-1.9, -1.35, -0.8].map((x) => box([x, G + 0.3, 1.43], [0.36, 0.26, 0.02], '#fff0c9'))],
  };
}

function harrahsDetail(): Detail {
  return {
    solid: [
      // Carnival-coloured marquee arch over the entrance, gold stars on the crown, and a bandstand canopy.
      ...[-1.5, 1.5].map((x) => box([x, G + 0.7, 1.55], [0.18, 1.3, 0.18], '#e2b14a')),
      box([0, G + 1.4, 1.55], [3.2, 0.18, 0.2], '#d0402f'),
      ...[-1, 0, 1].map((x) => cone([x, G + 5.2, -0.3], [0.12, 0.25, 5], '#ffd166')),
      cone([1.4, G + 0.65, 0.9], [0.45, 0.25, 8], '#ff9f1c'), cyl([1.4, G + 0.3, 0.9], [0.03, 0.03, 0.5, 4], '#ffffff'),
    ],
    glow: [...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => ball([x, G + 1.4, 1.67], [0.05, 0], '#ffe08a')), box([0, G + 1.15, 1.66], [2.4, 0.2, 0.02], '#ffd6a8')],
  };
}

function withDetail(base: Building, detail: Detail): Building {
  return { top: base.top, solid: [...base.solid, ...detail.solid], glow: [...base.glow, ...detail.glow] };
}

export function buildingFor(id: VenueId): Building {
  switch (id) {
    case 'venetian': return venetian();
    case 'wynn': return withDetail(wynn(), wynnDetail());
    case 'encore': return withDetail(encore(), encoreDetail());
    case 'forum': return withDetail(forum(), forumDetail());
    case 'palace': return withDetail(palace(), palaceDetail());
    default: return withDetail(mgm(), mgmDetail());
  }
}
