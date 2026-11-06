import assert from 'node:assert/strict';
import test from 'node:test';
import { Attendee, AppError, subjectHash } from '../server/attendee.ts';
import { MemoryBackend, ProgressStore } from '../server/progress.ts';

const origin = 'http://127.0.0.1:8484';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const catalog = ['s1', 's2', 's3', 's4'].map((id) => ({ sessionId: id, title: `Synthetic ${id}` }));

/** A fake Events API with a mutable schedule. `onReserve` decides what a ReserveSessions call does. */
function fakeApi(options: { reserved?: string[]; onReserve?: (ids: string[], schedule: { reserved: string[] }) => Response | Promise<Response>; onCancel?: (id: string, schedule: { reserved: string[] }) => Response } = {}) {
  const schedule = { reserved: [...(options.reserved ?? [])], favorites: [] as string[], personalTime: [] };
  const calls: string[] = [];
  const transport = async (url: string, init?: RequestInit) => {
    if (url.includes('/oauth2/token')) return json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600 });
    const path = new URL(url).pathname.replace('/v1/events/reinvent2026', '');
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path === '') return json({ event: { name: 'Synthetic event' } });
    if (path === '/sessions') return json({ items: catalog, totalCount: catalog.length });
    if (path === '/schedule') return json({ schedule: { ...schedule, reserved: [...schedule.reserved] } });
    if (path === '/reservations' && init?.method === 'POST') return options.onReserve!(JSON.parse(String(init.body)).sessionIds, schedule);
    if (path.startsWith('/reservations/') && init?.method === 'DELETE') return options.onCancel!(decodeURIComponent(path.split('/').pop()!), schedule);
    throw new Error(`Unexpected call ${path}`);
  };
  return { schedule, calls, transport };
}
async function ready(api: ReturnType<typeof fakeApi>) {
  const attendee = new Attendee(api.transport, async () => {});
  const start = new URL(attendee.start(origin, '/map'));
  assert.equal(await attendee.callback('synthetic-code', start.searchParams.get('state')!, origin), '/map', 'sign-in returns to the page that started it');
  await attendee.getCatalog();
  return attendee;
}

test('a 200 with per-session failures is reported per session and confirmed from GetSchedule', async () => {
  const api = fakeApi({ onReserve: (_ids, schedule) => {
    schedule.reserved.push('s1');
    return json({ result: { successful: ['s1'], failed: [{ sessionId: 's2', code: 'sessionFull' }, { sessionId: 's3', code: 'scheduleConflict', conflictsWith: ['s9'] }, { sessionId: 's4', code: 'aBrandNewCode' }] } });
  } });
  const attendee = await ready(api);
  const result = await attendee.reserve(['s1', 's2', 's3', 's4']);
  assert.deepEqual(result.results, [
    { id: 's1', reserved: true },
    { id: 's2', reserved: false, code: 'sessionFull', conflictsWith: undefined },
    { id: 's3', reserved: false, code: 'scheduleConflict', conflictsWith: ['s9'] },
    { id: 's4', reserved: false, code: 'aBrandNewCode', conflictsWith: undefined },
  ]);
  assert.match(result.message, /1 of 4 reservations confirmed from GetSchedule/);
});

test('already-reserved sessions are not re-sent and an uncertain response is reconciled, never retried', async () => {
  let posts = 0;
  const api = fakeApi({ reserved: ['s1'], onReserve: (ids, schedule) => {
    posts++;
    assert.deepEqual(ids, ['s2', 's3'], 'the already reserved s1 is filtered before sending');
    schedule.reserved.push('s2'); // The write partly landed…
    return new Response('<html>gateway timeout</html>', { status: 504, headers: { 'content-type': 'text/html' } }); // …but the answer was lost.
  } });
  const attendee = await ready(api);
  const result = await attendee.reserve(['s1', 's2', 's3']);
  assert.equal(posts, 1);
  assert.deepEqual(result.results.map((item) => [item.id, item.reserved, item.code]), [['s1', true, undefined], ['s2', true, undefined], ['s3', false, 'unconfirmed']]);
});

test('409 closed and 403 not-registered surface a reason and perform no reconciliation read or retry', async () => {
  for (const [status, reason] of [[409, 'closed'], [403, 'notRegistered']] as const) {
    let posts = 0;
    const api = fakeApi({ onReserve: () => { posts++; return json({ message: 'synthetic' }, status); } });
    const attendee = await ready(api);
    const schedulesBefore = api.calls.filter((call) => call.endsWith('/schedule')).length;
    await assert.rejects(attendee.reserve(['s1']), (error: AppError) => error.status === status && error.reason === reason);
    assert.equal(posts, 1);
    assert.equal(api.calls.filter((call) => call.endsWith('/schedule')).length - schedulesBefore, 1, 'only the pre-write read ran');
  }
});

test('request limits: 1–10 distinct catalog sessions', async () => {
  const attendee = await ready(fakeApi({ onReserve: () => json({ result: { successful: [], failed: [] } }) }));
  await assert.rejects(attendee.reserve([]), /between 1 and 10/);
  await assert.rejects(attendee.reserve(['s1', 's1']), /between 1 and 10/);
  await assert.rejects(attendee.reserve(Array.from({ length: 11 }, (_, i) => `s${i}`)), /between 1 and 10/);
  await assert.rejects(attendee.reserve(['not-in-catalog']), /Load the live catalog/);
});

test('cancel treats 404 as already gone and reports what GetSchedule shows', async () => {
  const api = fakeApi({ reserved: ['s1', 's2'], onCancel: (id, schedule) => {
    schedule.reserved = schedule.reserved.filter((item) => item !== id);
    return id === 's1' ? new Response(null, { status: 204 }) : json({ message: 'gone' }, 404);
  } });
  const attendee = await ready(api);
  assert.equal((await attendee.cancel('s1')).results[0]!.reserved, false);
  const second = await attendee.cancel('s2');
  assert.equal(second.results[0]!.reserved, false);
  assert.match(second.message, /confirmed from GetSchedule/);
  const none = await attendee.cancel('s3');
  assert.match(none.message, /no reservation/);
  assert.equal(api.calls.filter((call) => call.startsWith('DELETE')).length, 2, 'nothing is sent for a session that is not reserved');
});

test('EXP: unknown keys are refused, repeats are free, quests complete, and planning EXP needs the verified path', async () => {
  const store = new ProgressStore(new MemoryBackend());
  const me = 'guest:synthetic-identity-0001';
  await assert.rejects(store.award(me, 'reserve:s1'), /Unknown award/, 'the browser cannot grant itself planning EXP');
  await assert.rejects(store.award(me, 'discover:not-a-place'), /Unknown award/);
  assert.equal((await store.award(me, 'discover:venue-wynn')).exp, 50);
  assert.equal((await store.award(me, 'discover:venue-wynn')).exp, 50, 'discovering twice does not farm EXP');
  for (const id of ['encore', 'venetian', 'palace', 'forum', 'mgm']) await store.award(me, `discover:venue-${id}`);
  const view = await store.view(me);
  assert.equal(view.quests.find((quest) => quest.id === 'strip-explorer')!.done, true);
  assert.equal(view.quests.find((quest) => quest.id === 'badge-ready')!.done, true);
  assert.equal(view.exp, 6 * 50 + 150 + 30);
  const planned = await store.verifiedPlanning(me, 'reserve', ['s1', 's1']);
  assert.deepEqual(planned.recent.map((item) => item.key), ['reserve:s1', 'quest:booked']);
  assert.equal((await store.verifiedPlanning(me, 'reserve', ['s1'])).recent.length, 0);
  assert.equal((await store.view('guest:someone-else-0000001')).exp, 0, 'profiles are separate');
});

test('Builder ID identity: only a hash of the ID token subject is used, and guest EXP merges into it on sign-in', async () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'synthetic-subject-123', email: 'someone@example.com' })).toString('base64url');
  const idToken = `header.${payload}.signature`;
  const hash = subjectHash(idToken)!;
  assert.match(hash, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!hash.includes('synthetic-subject') && !hash.includes('example'), 'no raw subject or email');
  assert.equal(subjectHash('not-a-jwt'), undefined);
  assert.equal(subjectHash(undefined), undefined);
  const attendee = new Attendee(async (url) => url.includes('/oauth2/token') ? json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, id_token: idToken }) : json({}), async () => {});
  const guest = attendee.identity;
  assert.match(guest, /^guest:/);
  const start = new URL(attendee.start(origin));
  await attendee.callback('synthetic-code', start.searchParams.get('state')!, origin);
  assert.equal(attendee.identity, `builder:${hash}`);
  const store = new ProgressStore(new MemoryBackend());
  await store.award(guest, 'discover:venue-wynn');
  await store.award(attendee.identity, 'discover:venue-encore');
  await store.merge(guest, attendee.identity);
  const merged = await store.view(attendee.identity);
  assert.deepEqual(merged.discovered.sort(), ['venue-encore', 'venue-wynn']);
  assert.equal(merged.exp, 100);
});
