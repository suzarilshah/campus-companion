import type { AttendeeSchedule, LiveSession } from './live';
import { venueIdForName, venues, type VenueId } from '../scene/venues';

/** Pure helpers that turn the sourced catalog + schedule into per-venue map overlays. Nothing is inferred. */
export type VenueTally = { sessions: number; reserved: number; favorites: number };
export type Filters = { day?: string; topic?: string; format?: string; query?: string };

export const emptyTally = (): VenueTally => ({ sessions: 0, reserved: 0, favorites: 0 });

export function applyFilters(sessions: LiveSession[], filters: Filters) {
  const query = filters.query?.trim().toLocaleLowerCase();
  return sessions.filter((session) =>
    (!filters.day || session.date === filters.day) &&
    (!filters.topic || session.topics.includes(filters.topic)) &&
    (!filters.format || session.format === filters.format) &&
    (!query || [session.title, session.abbreviation, session.abstract, session.venue, session.room, session.format, ...(session.topics ?? []), ...(session.tracks ?? []), ...(session.speakers ?? [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
}

export function tally(sessions: LiveSession[], schedule?: AttendeeSchedule) {
  const byVenue = Object.fromEntries(venues.map((venue) => [venue.id, emptyTally()])) as Record<VenueId, VenueTally>;
  const otherVenues = new Map<string, number>();
  let noVenue = 0;
  for (const session of sessions) {
    const id = venueIdForName(session.venue);
    if (!id) {
      if (session.venue) otherVenues.set(session.venue, (otherVenues.get(session.venue) ?? 0) + 1);
      else noVenue++;
      continue;
    }
    byVenue[id].sessions++;
    if (schedule?.reserved.includes(session.id)) byVenue[id].reserved++;
    if (schedule?.favorites.includes(session.id)) byVenue[id].favorites++;
  }
  return { byVenue, otherVenues: [...otherVenues].sort((a, b) => b[1] - a[1]), noVenue };
}

/** Local date/time strings sort lexically; a missing date or time sorts last. Timezones are never inferred. */
export function byStart(a: LiveSession, b: LiveSession) {
  return `${a.date ?? '9999'}T${a.time ?? '99:99'}`.localeCompare(`${b.date ?? '9999'}T${b.time ?? '99:99'}`) || a.title.localeCompare(b.title);
}

export function distinct(values: (string | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

const availabilityText: Record<string, string> = {
  available: 'Seats available',
  limited: 'Limited seats',
  veryLimited: 'Very limited seats',
  unavailable: 'No seats available',
  walkUp: 'Walk-up — no reservation is taken',
};
/** Availability is a coarse band from the API, never a seat count. Unknown values are shown as returned. */
export function describeAvailability(value: string | undefined) {
  return value ? availabilityText[value] ?? `Availability: ${value}` : undefined;
}
