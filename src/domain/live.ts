/** Normalized live view records. Every displayed field is sourced, or explicitly absent. */
export type LiveSession = {
  id: string;
  title: string;
  abstract?: string;
  venue?: string;
  room?: string;
  format?: string;
  level?: string;
  topics: string[];
  date?: string;
  time?: string;
  timezone?: string;
  minutes?: string;
  availability?: string;
  abbreviation?: string;
  tracks: string[];
  speakers: string[];
  reservable?: boolean;
  allDay?: boolean;
};
export type AttendeeSchedule = {
  favorites: string[];
  reserved: string[];
  personalTime: { id: string; title: string; start: string; end: string }[];
};
/** GetEvent fields shown for context; every field may be absent. */
export type LiveEventInfo = { startDate?: string; endDate?: string; timezone?: string; timezoneAbbreviation?: string; city?: string };
export type LiveCatalog = { sessions: LiveSession[]; expectedCount: number; refreshedAt: string; eventName: string; event?: LiveEventInfo };

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unexpected API object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown) { return typeof value === 'string' && value.trim() ? value : undefined; }
export function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error('Unexpected API list.');
  return value;
}
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
export function normalizeEvent(value: unknown): LiveEventInfo {
  const item = object(value);
  const address = item.address && typeof item.address === 'object' ? (item.address as Record<string, unknown>) : {};
  return { startDate: text(item.startDate), endDate: text(item.endDate), timezone: text(item.timezone), timezoneAbbreviation: text(item.timezoneAbbreviation), city: text(address.city) };
}
export function normalizeSession(value: unknown): LiveSession | null {
  const item = object(value);
  const id = text(item.sessionId);
  // Without a real identity, never create an actionable session.
  if (!id || id.length > 128) return null;
  const time = item.sessionTime ? object(item.sessionTime) : {};
  return {
    id, title: text(item.title) ?? 'Title not provided', abstract: text(item.abstract),
    venue: text(item.venue), room: text(item.room), format: text(item.type), level: text(item.level),
    topics: stringList(item.topics),
    date: text(time.date), time: text(time.time), timezone: text(time.timezone), minutes: text(time.length),
    availability: text(item.seatAvailability),
    abbreviation: text(item.abbreviation),
    tracks: stringList(item.tracks),
    speakers: Array.isArray(item.speakers) ? item.speakers.map((speaker) => text(speaker && typeof speaker === 'object' ? (speaker as Record<string, unknown>).name : undefined)).filter((name): name is string => Boolean(name)).slice(0, 12) : [],
    reservable: typeof item.isReservable === 'boolean' ? item.isReservable : undefined,
    allDay: typeof item.isAllDaySession === 'boolean' ? item.isAllDaySession : undefined,
  };
}
export function normalizeSchedule(value: unknown): AttendeeSchedule {
  const schedule = object(object(value).schedule);
  if (!Array.isArray(schedule.personalTime)) throw new Error('Unexpected personal time list.');
  return { favorites: strings(schedule.favorites), reserved: strings(schedule.reserved), personalTime: schedule.personalTime.map((raw) => {
    const entry = object(raw);
    if (![entry.personalTimeId, entry.title, entry.startDateTime, entry.endDateTime].every((field) => typeof field === 'string')) throw new Error('Unexpected personal time entry.');
    return { id: entry.personalTimeId as string, title: entry.title as string, start: entry.startDateTime as string, end: entry.endDateTime as string };
  }) };
}
