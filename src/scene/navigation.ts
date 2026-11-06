import { BOUNDS, CROSS_STREETS, FORUM_WALK, FOUNTAIN, LOOP, POND, STAGE, TERMINAL, deltaZ, wrapZ } from './layout';
import { landmarkBuildings, places } from './places';
import { venues } from './venues';

export { BOUNDS };
/** On the west sidewalk opposite The Venetian, clear of every discoverable spot. */
export const START: [number, number] = [-2.15, -5];
/** Food kiosks sit just beside their discoverable spot. */
export const kioskOf = (spot: readonly number[]) => ({ x: spot[0]!, z: spot[2]! + 0.95 });

type Box = { x: number; z: number; hx: number; hz: number };
const landmarks: Box[] = [
  ...venues.map((venue) => ({ x: venue.position[0], z: venue.position[2], hx: 2.15, hz: 2.5 })),
  ...landmarkBuildings.map((hotel) => ({ x: hotel.position[0], z: hotel.position[2], hx: 2.15, hz: 1.6 })),
  STAGE, TERMINAL,
];

/**
 * Generic city blocks (illustrative filler, like a model-railway town) that fill the gaps between the real venues so
 * the whole planet reads as a city. Deterministic, and never placed on a street, plaza or discoverable spot.
 */
export type Lot = Box & { color: number; floors: number };
export const lots: Lot[] = (() => {
  const result: Lot[] = [];
  let seed = 7;
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bands = [{ x: 6.4, hx: 1.5, hz: 1.25 }, { x: 13.7, hx: 1.4, hz: 1.25 }];
  for (const side of [1, -1]) {
    for (const band of bands) {
      for (let z = BOUNDS.minZ + 1.6; z < BOUNDS.maxZ - 1.2; z += 3.2) {
        const x = side * band.x;
        const clearOfStreets = CROSS_STREETS.every((street) => Math.abs(deltaZ(street, z)) > band.hz + 1.3)
          && Math.abs(deltaZ(FORUM_WALK.z, z)) > band.hz + 1.1;
        const clearOfLandmarks = landmarks.every((item) => Math.abs(item.x - x) > item.hx + band.hx + 0.6 || Math.abs(deltaZ(item.z, z)) > item.hz + band.hz + 0.6);
        const clearOfPlaces = places.every((place) => Math.hypot(place.spot[0] - x, deltaZ(place.spot[2], z)) > band.hx + 1.8);
        const clearOfWater = [FOUNTAIN, POND].every((water) => Math.hypot(water.x - x, deltaZ(water.z, z)) > water.r + band.hx + 0.8);
        const keep = next() > 0.12;
        if (clearOfStreets && clearOfLandmarks && clearOfPlaces && clearOfWater && keep) {
          result.push({ x, z, hx: band.hx, hz: band.hz, color: Math.floor(next() * 7), floors: 1 + Math.floor(next() * 3) });
        }
      }
    }
  }
  return result;
})();

const boxes: Box[] = [...landmarks, ...lots];
const circles = [FOUNTAIN, POND, ...places.filter((place) => place.kind === 'food').map((place) => ({ ...kioskOf(place.spot), r: 0.42 }))];

export function canWalkTo(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < BOUNDS.minX || x > BOUNDS.maxX) return false;
  if (boxes.some((box) => Math.abs(x - box.x) < box.hx && Math.abs(deltaZ(box.z, z)) < box.hz)) return false;
  return circles.every((circle) => Math.hypot(x - circle.x, deltaZ(circle.z, z)) >= circle.r);
}

export type Waypoint = { x: number; z: number };

const CELL = 0.5;
const COLS = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL) + 1;
const ROWS = Math.round(LOOP / CELL);
const cellX = (col: number) => BOUNDS.minX + col * CELL;
const cellZ = (row: number) => wrapZ(BOUNDS.minZ + row * (LOOP / ROWS));
// A cell is passable only when a small clearance around it is walkable, so paths do not hug corners.
const clear = (x: number, z: number) => [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]].every(([dx, dz]) => canWalkTo(x + dx!, z + dz!));
let passable: Uint8Array | undefined;
function grid() {
  if (!passable) {
    passable = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) passable[r * COLS + c] = clear(cellX(c), cellZ(r)) ? 1 : 0;
  }
  return passable;
}

function lineClear(a: Waypoint, b: Waypoint) {
  const dz = deltaZ(a.z, b.z);
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, dz) / 0.2));
  for (let i = 1; i <= steps; i++) if (!clear(a.x + ((b.x - a.x) * i) / steps, a.z + (dz * i) / steps)) return false;
  return true;
}

class Heap {
  private items: { i: number; f: number }[] = [];
  get size() { return this.items.length; }
  push(item: { i: number; f: number }) {
    const a = this.items; a.push(item);
    for (let n = a.length - 1; n > 0;) { const p = (n - 1) >> 1; if (a[p]!.f <= a[n]!.f) break; [a[p], a[n]] = [a[n]!, a[p]!]; n = p; }
  }
  pop() {
    const a = this.items; const top = a[0]!; const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let n = 0; ;) {
        const l = n * 2 + 1; const r = l + 1; let m = n;
        if (l < a.length && a[l]!.f < a[m]!.f) m = l;
        if (r < a.length && a[r]!.f < a[m]!.f) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n]!, a[m]!]; n = m;
      }
    }
    return top;
  }
}

/**
 * Shortest walkable route around the loop (it may go either way round the planet), then straightened.
 * Returns null when the destination is unreachable. Illustrative only; says nothing about real walking routes.
 */
export function findPath(from: [number, number], to: [number, number]): Waypoint[] | null {
  const start = { x: from[0], z: wrapZ(from[1]) };
  const goal = { x: to[0], z: wrapZ(to[1]) };
  if (!canWalkTo(goal.x, goal.z)) return null;
  if (Math.hypot(goal.x - start.x, deltaZ(start.z, goal.z)) < 12 && lineClear(start, goal)) return [goal];
  const open = grid();
  const toCell = (p: Waypoint) => [Math.min(COLS - 1, Math.max(0, Math.round((p.x - BOUNDS.minX) / CELL))), ((Math.round((p.z - BOUNDS.minZ) / (LOOP / ROWS)) % ROWS) + ROWS) % ROWS] as const;
  const [sc, sr] = toCell(start);
  const [gc, gr] = toCell(goal);
  const index = (c: number, r: number) => r * COLS + c;
  const cost = new Float32Array(COLS * ROWS).fill(Infinity);
  const previous = new Int32Array(COLS * ROWS).fill(-1);
  const heap = new Heap();
  const rowGap = (a: number, b: number) => { const d = Math.abs(a - b) % ROWS; return Math.min(d, ROWS - d); };
  heap.push({ i: index(sc, sr), f: 0 });
  cost[index(sc, sr)] = 0;
  const target = index(gc, gr);
  while (heap.size) {
    const { i } = heap.pop();
    if (i === target) break;
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nc = c + dc;
      if (nc < 0 || nc >= COLS) continue;
      const nr = (r + dr + ROWS) % ROWS;
      const ni = index(nc, nr);
      if (!open[ni] && ni !== target) continue;
      if (dc && dr && (!open[index(nc, r)] || !open[index(c, nr)])) continue;
      const next = cost[i]! + Math.hypot(dc, dr);
      if (next < cost[ni]!) { cost[ni] = next; previous[ni] = i; heap.push({ i: ni, f: next + Math.hypot(nc - gc, rowGap(nr, gr)) }); }
    }
  }
  if (previous[target] === -1 && target !== index(sc, sr)) return null;
  const cells: Waypoint[] = [];
  for (let i = target; i !== -1; i = previous[i]!) cells.unshift({ x: cellX(i % COLS), z: cellZ(Math.floor(i / COLS)) });
  // String-pulling: skip every waypoint that can be bypassed with a clear straight segment.
  const route: Waypoint[] = [];
  let anchor = start;
  for (let i = 0; i < cells.length; i++) {
    const next = cells[i + 1];
    if (next && lineClear(anchor, next)) continue;
    const point = cells[i]!;
    route.push(point);
    anchor = point;
  }
  route.push(goal);
  return route;
}
