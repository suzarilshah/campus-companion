import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, request } from 'node:http';
import { createLocalApp } from '../server/app.ts';

test('local server rejects foreign hosts, origins, and unsupported mutations', async (t) => {
  // Bind to an ephemeral loopback port; app gate deliberately expects the public port.
  const server = createServer(createLocalApp(8484));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const call = (headers: Record<string, string>, method = 'GET', path = '/api/health') => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject); req.end();
  });
  const host = { host: '127.0.0.1:8484' };
  assert.deepEqual(JSON.parse((await call(host)).body), { mode: 'synthetic', attendeeConnected: false });
  assert.equal((await call({ host: 'evil.example:8484' })).status, 403);
  assert.equal((await call({ ...host, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ ...host, origin: 'null' })).status, 403);
  assert.equal((await call({ ...host, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await call({ ...host, origin: 'http://127.0.0.1:8484' })).status, 200);
  // Landing page after AWS → /callback → / keeps cross-site; page loads pass, API reads and writes do not.
  const navigation = { ...host, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  assert.equal((await call(navigation, 'GET', '/?connection=ready')).status, 404); // passes the guard; no static handler in this test app
  assert.equal((await call(navigation, 'GET', '/api/health')).status, 403);
  assert.equal((await call({ ...navigation, 'sec-fetch-mode': 'cors' }, 'GET', '/?x=1')).status, 403);
  assert.equal((await call(host, 'POST', '/api/reservations')).status, 404);
  assert.equal((await call(host, 'POST', '/')).status, 405);
});

test('attendee routes bind a browser cookie and require matching Origin plus CSRF for actions', async (t) => {
  const server = createServer(createLocalApp(8484, true));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const call = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method, headers: { host: '127.0.0.1:8484', ...headers } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    });
    req.on('error', reject); req.end();
  });
  const opened = await call('/api/attendee/session');
  const status = JSON.parse(opened.body);
  assert.deepEqual(Object.keys(status).sort(), ['connected', 'csrf']);
  const setCookie = opened.headers['set-cookie']![0]!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  const cookie = setCookie.split(';')[0]!;
  const headers = { cookie, origin: 'http://127.0.0.1:8484', 'x-campus-csrf': status.csrf };
  assert.equal((await call('/api/attendee/connect', { cookie }, 'POST')).status, 403);
  assert.equal((await call('/api/attendee/connect', { ...headers, 'x-campus-csrf': 'wrong' }, 'POST')).status, 403);
  const connect = await call('/api/attendee/connect', headers, 'POST');
  assert.equal(new URL(JSON.parse(connect.body).url).origin, 'https://oauth.awsevents.com');
  assert.equal((await call('/api/attendee/schedule', { cookie })).status, 401);
  const callback = await call('/callback?code=synthetic-code&state=wrong', { cookie, 'sec-fetch-site': 'cross-site' });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.location, '/?connection=failed');
  assert.equal(callback.headers['cache-control'], 'no-store');
  assert.ok(!callback.body.includes('synthetic-code'));
});

test('a busy local app evicts the oldest signed-out browser session instead of refusing new ones', async (t) => {
  const server = createServer(createLocalApp(8484, true));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const status = () => new Promise<number>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path: '/api/attendee/session', headers: { host: '127.0.0.1:8484' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    req.on('error', reject); req.end();
  });
  for (let i = 0; i < 14; i++) assert.equal(await status(), 200, `browser ${i + 1}`);
});
