import { places, placeById, type PlaceKind } from '../scene/places';
import { venues } from '../scene/venues';

/**
 * EXP rules, shared by the local server (which is the only thing that grants EXP) and the UI (which displays it).
 * Exploration EXP is for the illustrated world, not a claim that anyone attended anything. Planning EXP is granted
 * only by the server after GetSchedule confirms a favorite or reservation, and at most once per session.
 */
export type AwardKey = string;
export const EXP = { venue: 50, landmark: 40, food: 20, shuttle: 15, ride: 20, inspect: 5, favorite: 10, reserve: 30 } as const;
export const INSPECT_CAP = 40;

export const quests = [
  { id: 'strip-explorer', title: 'Strip explorer', detail: 'Discover all six conference venues', exp: 150, done: (keys: Set<string>) => venues.every((venue) => keys.has(`discover:venue-${venue.id}`)) },
  { id: 'fuel-up', title: 'Fuel up', detail: 'Find three food & drink spots', exp: 40, done: (keys: Set<string>) => countKind(keys, 'food') >= 3 },
  { id: 'ride-along', title: 'Ride along', detail: 'Take the illustrative shuttle once', exp: 20, done: (keys: Set<string>) => keys.has('ride:shuttle') },
  { id: 'badge-ready', title: 'Badge ready', detail: 'Find a badge pickup spot: The Venetian or the airport', exp: 30, done: (keys: Set<string>) => keys.has('discover:venue-venetian') || keys.has('discover:landmark-airport') },
  { id: 'replay-scout', title: 're:Play scout', detail: 'Find the Festival Grounds', exp: 30, done: (keys: Set<string>) => keys.has('discover:landmark-replay') },
  { id: 'curious', title: 'Curious mind', detail: 'Open ten real session cards', exp: 40, done: (keys: Set<string>) => [...keys].filter((key) => key.startsWith('inspect:')).length >= 10 },
  { id: 'planner', title: 'Planner', detail: 'Have a favorite confirmed by GetSchedule', exp: 30, done: (keys: Set<string>) => [...keys].some((key) => key.startsWith('favorite:')) },
  { id: 'booked', title: 'Seat secured', detail: 'Have a reservation confirmed by GetSchedule', exp: 60, done: (keys: Set<string>) => [...keys].some((key) => key.startsWith('reserve:')) },
] as const;

function countKind(keys: Set<string>, kind: PlaceKind) {
  return places.filter((place) => place.kind === kind && keys.has(`discover:${place.id}`)).length;
}

const levels = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500];
const titles = ['Newcomer', 'Wanderer', 'Pathfinder', 'Strip scout', 'Navigator', 'Trailblazer', 'Campus legend', 'Keynote-level', 'Hall of fame'];
export function levelFor(exp: number) {
  let index = 0;
  while (index + 1 < levels.length && exp >= levels[index + 1]!) index++;
  const floor = levels[index]!;
  const next = levels[index + 1];
  return { level: index + 1, title: titles[index]!, floor, next, progress: next ? (exp - floor) / (next - floor) : 1 };
}

/** EXP for a key the browser may request. Planning keys are rejected here: only the server's verified path grants them. */
export function clientAwardValue(key: AwardKey, awarded: ReadonlySet<string>): number | undefined {
  if (key === 'ride:shuttle') return EXP.ride;
  const discover = /^discover:(.+)$/.exec(key);
  if (discover) {
    const place = placeById.get(discover[1]!);
    return place ? EXP[place.kind] : undefined;
  }
  const inspect = /^inspect:(.{1,128})$/.exec(key);
  if (inspect) return [...awarded].filter((item) => item.startsWith('inspect:')).length < INSPECT_CAP ? EXP.inspect : 0;
  return undefined;
}

export type ProgressView = {
  exp: number;
  level: ReturnType<typeof levelFor>;
  discovered: string[];
  quests: { id: string; title: string; detail: string; exp: number; done: boolean }[];
  recent: { key: string; exp: number; label: string }[];
  storage: string;
  /** Whose progress this is: the signed-in Builder ID, or this browser's guest profile. */
  profile?: 'builder' | 'guest';
};

export function labelFor(key: AwardKey) {
  const [kind, rest = ''] = key.split(/:(.*)/s);
  if (kind === 'discover') return `Discovered ${placeById.get(rest)?.name ?? rest}`;
  if (kind === 'quest') return `Quest complete: ${quests.find((quest) => quest.id === rest)?.title ?? rest}`;
  if (kind === 'ride') return 'Rode the shuttle';
  if (kind === 'inspect') return 'Opened a session card';
  if (kind === 'favorite') return 'Favorite confirmed';
  if (kind === 'reserve') return 'Reservation confirmed';
  return key;
}
