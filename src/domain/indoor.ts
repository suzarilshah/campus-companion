import type { LiveSession } from './live';
import { byStart } from './mapData';

/**
 * Indoor model for one building, built only from what the Events API returns: each session's `room` string.
 * A floor is known only when the room string states it explicitly ("Level 3", "Floor 2", "L3"). Nothing about
 * room positions, corridors or booths is inferred — the 3D layout of rooms on a floor is illustrative.
 */
export type IndoorRoom = { name: string; sessions: LiveSession[]; formats: string[] };
export type IndoorFloor = { level: number | null; label: string; rooms: IndoorRoom[] };
export type IndoorModel = { floors: IndoorFloor[]; sessions: number; withoutRoom: LiveSession[] };

export function levelOf(room: string | undefined): number | null {
  if (!room) return null;
  const match = /\b(?:level|lvl|floor|fl)\.?\s*(\d{1,2})\b/i.exec(room) ?? /(?:^|[\s,|/(–-])L(\d{1,2})(?=$|[\s,|/)–-])/.exec(room);
  return match ? Number(match[1]) : null;
}

export function buildIndoor(sessions: LiveSession[]): IndoorModel {
  const floors = new Map<number | null, Map<string, LiveSession[]>>();
  const withoutRoom: LiveSession[] = [];
  for (const session of sessions) {
    const room = session.room?.trim();
    if (!room) { withoutRoom.push(session); continue; }
    const level = levelOf(room);
    const rooms = floors.get(level) ?? new Map<string, LiveSession[]>();
    rooms.set(room, [...(rooms.get(room) ?? []), session]);
    floors.set(level, rooms);
  }
  const ordered = [...floors].sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b));
  return {
    sessions: sessions.length,
    withoutRoom: withoutRoom.sort(byStart),
    floors: ordered.map(([level, rooms]) => ({
      level,
      label: level === null ? 'Level not listed' : `Level ${level}`,
      rooms: [...rooms].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([name, list]) => ({
        name,
        sessions: list.sort(byStart),
        formats: [...new Set(list.map((session) => session.format).filter((format): format is string => Boolean(format)))],
      })),
    })),
  };
}

export type Checkpoint = { id: string; title: string; detail: string; action?: 'travel' };

/**
 * Step-by-step checkpoints to a session, in the spirit of an indoor wayfinder, but honest about what is known:
 * getting to the building uses the illustrative globe; inside, only the stated level and room are used, and the
 * attendee is pointed to on-site signage for the actual corridor route (no floor plans are published).
 */
export function checkpointsTo(session: LiveSession, venueName: string, atBuilding: boolean): Checkpoint[] {
  const level = levelOf(session.room);
  const steps: Checkpoint[] = [];
  if (!atBuilding) steps.push({ id: 'travel', title: `Head to ${venueName}`, detail: 'Walk or take the shuttle on the globe. Real travel: allow extra time between properties and use official shuttles where venues are not walkable.', action: 'travel' });
  steps.push({ id: 'enter', title: `Enter ${venueName}`, detail: 'Follow the re:Invent signage from the entrance; venue staff can point you to the conference area.' });
  steps.push(level !== null
    ? { id: 'level', title: `Go to Level ${level}`, detail: `The room listing says Level ${level}. Use the escalators or lifts signed for the conference rooms.` }
    : { id: 'level', title: 'Find the right floor', detail: 'The room listing does not state a level. Check on-site signage or ask staff.' });
  steps.push(session.room
    ? { id: 'room', title: `Find ${session.room}`, detail: 'Room name from the AWS Events API. Corridor routes are not published, so follow the room signs.' }
    : { id: 'room', title: 'Room not listed yet', detail: 'The catalog has no room for this session. Check again closer to the event.' });
  steps.push({ id: 'arrive', title: `Arrive for “${session.title}”`, detail: [session.date, session.time, session.timezone].filter(Boolean).join(' · ') || 'Time not provided' });
  return steps;
}
