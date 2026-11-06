import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Attendee, AppError } from '../server/attendee.ts';
import { normalizeSession } from '../src/domain/live.ts';

const origin = 'http://127.0.0.1:8484';
const session = { sessionId: 'fixture-session', title: 'Synthetic contract fixture', sessionTime: { date: '2026-12-01', time: '11:00', length: '60' } };
const json = (value: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const tokens = () => json({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', expires_in: 3600 });
async function signIn(attendee: Attendee) {
  const url = new URL(attendee.start(origin));
  await attendee.callback('synthetic-code', url.searchParams.get('state')!, origin);
}

test('PKCE uses fresh state/verifier, exact callback, and a single-use browser-bound attempt', async () => {
  let challenge = '';
  let exchanges = 0;
  const attendee = new Attendee(async (url, init) => {
    assert.equal(url, 'https://oauth.awsevents.com/oauth2/token');
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('redirect_uri'), `${origin}/callback`);
    assert.equal(body.get('code'), 'synthetic-code');
    const verifier = body.get('code_verifier')!;
    assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(createHash('sha256').update(verifier).digest('base64url'), challenge);
    exchanges++;
    return tokens();
  });
  const first = new URL(attendee.start(origin));
  const second = new URL(attendee.start(origin));
  assert.notEqual(first.searchParams.get('state'), second.searchParams.get('state'));
  assert.notEqual(first.searchParams.get('code_challenge'), second.searchParams.get('code_challenge'));
  challenge = second.searchParams.get('code_challenge')!;
  await attendee.callback('synthetic-code', second.searchParams.get('state')!, origin);
  assert.equal(attendee.connected, true);
  await assert.rejects(attendee.callback('synthetic-code', second.searchParams.get('state')!, origin));
  assert.equal(exchanges, 1);
  assert.throws(() => attendee.start('https://hosted.example'), AppError);
  assert.throws(() => attendee.start('http://127.0.0.1:9999'), AppError);
});

test('incorrect state or callback host never exchanges a code', async () => {
  const attendee = new Attendee(async () => { throw new Error('Token exchange must not run.'); });
  let start = new URL(attendee.start(origin));
  await assert.rejects(attendee.callback('code', start.searchParams.get('state')!, 'http://localhost:8484'), /could not be verified/);
  start = new URL(attendee.start(origin));
  await assert.rejects(attendee.callback('code', `${start.searchParams.get('state')}x`, origin), /could not be verified/);
  assert.equal(attendee.connected, false);
});

test('catalog walks short and empty pages until nextToken is absent; reads are cached', async () => {
  let pages = 0;
  const attendee = new Attendee(async (url, init) => {
    if (url.includes('/oauth2/token')) return tokens();
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-access-token');
    assert.equal(new URL(url).hostname, 'api.awsevents.com');
    assert.equal(init?.redirect, 'error');
    if (url.includes('/sessions?')) {
      pages++;
      const token = new URL(url).searchParams.get('nextToken');
      if (!token) return json({ items: [session], totalCount: 2, nextToken: 'page-two' });
      if (token === 'page-two') return json({ items: [], totalCount: 2, nextToken: 'page-three' });
      return json({ items: [{ sessionId: 'fixture-unplaced' }], totalCount: 2 });
    }
    return json({ event: { name: 'Synthetic event' } });
  }, async () => {});
  await signIn(attendee);
  const catalog = await attendee.getCatalog();
  assert.equal(catalog.sessions.length, 2);
  assert.equal(catalog.sessions[1]?.title, 'Title not provided');
  assert.equal(catalog.sessions[1]?.venue, undefined);
  assert.equal(catalog.sessions[0]?.timezone, undefined);
  await attendee.getCatalog();
  assert.equal(pages, 3);
});

test('pagination cycles fail rather than silently expose an incomplete catalog', async () => {
  const attendee = new Attendee(async (url) => url.includes('/oauth2/token') ? tokens() : url.includes('/sessions?') ? json({ items: [], totalCount: 2, nextToken: 'repeat' }) : json({ event: {} }), async () => {});
  await signIn(attendee);
  await assert.rejects(attendee.getCatalog(), /pagination/);
});

test('401 refreshes once and rotated credentials are used only for the Events API', async () => {
  let tokenRequests = 0;
  let reads = 0;
  const attendee = new Attendee(async (url, init) => {
    if (url.includes('/oauth2/token')) {
      tokenRequests++;
      if (tokenRequests === 1) return tokens();
      assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), 'synthetic-refresh-token');
      return json({ access_token: 'synthetic-rotated-access', refresh_token: 'synthetic-rotated-refresh', expires_in: 3600 });
    }
    if (++reads === 1) return json({}, 401);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-rotated-access');
    return json({}, 401);
  }, async () => {});
  await signIn(attendee);
  await assert.rejects(attendee.schedule(), (error: unknown) => error instanceof AppError && error.status === 401);
  assert.equal(tokenRequests, 2);
  assert.equal(reads, 2);
});

test('403 registration, 409 closure, HTML errors and 429 retry-after are explicit failures', async () => {
  for (const status of [403, 409, 429, 503]) {
    let calls = 0;
    const attendee = new Attendee(async (url) => {
      if (url.includes('/oauth2/token')) return tokens();
      calls++;
      return status === 503 ? new Response('<html>edge failure</html>', { status }) : json({}, status, { 'Retry-After': '7' });
    }, async () => {});
    await signIn(attendee);
    await assert.rejects(attendee.schedule(), (error: unknown) => error instanceof AppError && error.status === status && (status !== 429 || error.retryAfter === 7));
    assert.equal(calls, 1);
  }
});

test('an uncertain favorite write is reconciled without blindly retrying it', async () => {
  let favorited = false;
  let writes = 0;
  const attendee = new Attendee(async (url, init) => {
    if (url.includes('/oauth2/token')) return tokens();
    if (url.endsWith('/schedule')) return json({ schedule: { favorites: favorited ? [session.sessionId] : [], reserved: [], personalTime: [] } });
    if (init?.method === 'POST') { writes++; favorited = true; throw new Error('Synthetic connection dropped after write.'); }
    if (url.includes('/sessions?')) return json({ items: [session], totalCount: 1 });
    return json({ event: {} });
  }, async () => {});
  await signIn(attendee);
  await attendee.getCatalog();
  const result = await attendee.favorite(session.sessionId, true);
  assert.equal(result.verified, true);
  assert.match(result.message, /uncertain/);
  assert.equal(writes, 1);
  assert.equal((await attendee.favorite(session.sessionId, true)).verified, true);
  assert.equal(writes, 1);
  await assert.rejects(attendee.favorite('not-in-catalog', true));
});

test('HTTP 200 with a new refusal code never becomes a success claim', async () => {
  const attendee = new Attendee(async (url, init) => {
    if (url.includes('/oauth2/token')) return tokens();
    if (url.endsWith('/schedule')) return json({ schedule: { favorites: [], reserved: [], personalTime: [] } });
    if (init?.method === 'POST') return json({ result: { successful: [], failed: [{ sessionId: session.sessionId, code: 'newReason' }] } });
    if (url.includes('/sessions?')) return json({ items: [session], totalCount: 1 });
    return json({ event: {} });
  }, async () => {});
  await signIn(attendee);
  await attendee.getCatalog();
  const result = await attendee.favorite(session.sessionId, true);
  assert.equal(result.verified, false);
  assert.match(result.message, /newReason/);
});

test('disconnect revokes refresh token, clears local state and offers the separate logout chain', async () => {
  const attendee = new Attendee(async (url, init) => {
    if (url.endsWith('/token')) return tokens();
    assert.equal(url, 'https://oauth.awsevents.com/oauth2/revoke');
    assert.equal(new URLSearchParams(String(init?.body)).get('token'), 'synthetic-refresh-token');
    return new Response(null, { status: 200 });
  });
  await signIn(attendee);
  const result = new URL(await attendee.disconnect(origin));
  assert.equal(attendee.connected, false);
  assert.equal(result.origin, 'https://idp.awsevents.com');
  const inner = new URL(result.searchParams.get('redirect_uri')!);
  assert.equal(inner.searchParams.get('logout_uri'), `${origin}/logout`);
  await assert.rejects(attendee.schedule(), /Sign in/);
});

test('normalization never invents IDs or assumes the timezone of a session', () => {
  assert.equal(normalizeSession({ title: 'Missing identity' }), null);
  const normalized = normalizeSession(session)!;
  assert.equal(normalized.time, '11:00');
  assert.equal(normalized.timezone, undefined);
  assert.deepEqual(normalized.topics, []);
});
