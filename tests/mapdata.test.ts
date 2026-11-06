import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFilters, byStart, describeAvailability, tally } from '../src/domain/mapData.ts';
import { normalizeEvent, normalizeSession } from '../src/domain/live.ts';

const session = (id: string, extra: Record<string, unknown> = {}) => normalizeSession({ sessionId: id, title: `Session ${id}`, ...extra })!;

test('venue tallies use only exact sourced names and reconcile reserved/favorite ids from GetSchedule', () => {
  const sessions = [
    session('a', { venue: 'The Venetian' }), session('b', { venue: 'the venetian' }), session('c', { venue: 'Wynn' }),
    session('d', { venue: 'Some Other Hall' }), session('e'),
  ];
  const result = tally(sessions, { reserved: ['a'], favorites: ['a', 'c', 'missing-from-catalog'], personalTime: [] });
  assert.deepEqual(result.byVenue.venetian, { sessions: 2, reserved: 1, favorites: 1 });
  assert.deepEqual(result.byVenue.wynn, { sessions: 1, reserved: 0, favorites: 1 });
  assert.deepEqual(result.otherVenues, [['Some Other Hall', 1]]);
  assert.equal(result.noVenue, 1, 'a session without a venue is counted, never placed');
});

test('filters combine and unavailable time fields sort last without being invented', () => {
  const sessions = [
    session('late', { sessionTime: { date: '2026-12-02', time: '16:00' }, topics: ['AI'], type: 'Workshop' }),
    session('early', { sessionTime: { date: '2026-12-01', time: '09:00' }, topics: ['AI'], type: 'Talk' }),
    session('untimed', { topics: ['Security'], type: 'Talk' }),
  ];
  assert.deepEqual(sessions.sort(byStart).map((item) => item.id), ['early', 'late', 'untimed']);
  assert.deepEqual(applyFilters(sessions, { topic: 'AI', format: 'Talk' }).map((item) => item.id), ['early']);
  assert.deepEqual(applyFilters(sessions, { day: '2026-12-02' }).map((item) => item.id), ['late']);
  assert.deepEqual(applyFilters(sessions, { query: 'session UNTIMED' }).map((item) => item.id), ['untimed']);
});

test('extra documented session and event fields normalize defensively', () => {
  const full = session('x', { abbreviation: 'AIM123', tracks: ['Builders'], speakers: [{ name: 'A. Speaker' }, {}, 5], isReservable: false, isAllDaySession: true, seatAvailability: 'walkUp' });
  assert.deepEqual([full.abbreviation, full.tracks, full.speakers, full.reservable, full.allDay], ['AIM123', ['Builders'], ['A. Speaker'], false, true]);
  const bare = session('y');
  assert.deepEqual([bare.tracks, bare.speakers, bare.reservable], [[], [], undefined]);
  assert.equal(describeAvailability('walkUp'), 'Walk-up — no reservation is taken');
  assert.equal(describeAvailability('brandNewValue'), 'Availability: brandNewValue', 'unknown API values are shown as returned');
  assert.deepEqual(normalizeEvent({ startDate: '2026-11-30T00:00:00-08:00', timezone: 'America/Los_Angeles', address: { city: 'Las Vegas' } }), { startDate: '2026-11-30T00:00:00-08:00', endDate: undefined, timezone: 'America/Los_Angeles', timezoneAbbreviation: undefined, city: 'Las Vegas' });
});
