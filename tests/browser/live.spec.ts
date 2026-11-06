import { expect, test } from '@playwright/test';

// The first-visit controls card is covered by its own test; skip it elsewhere so it does not cover the canvas.
test.beforeEach(async ({ page }, info) => { if (!info.title.includes('controls card')) await page.addInitScript(() => localStorage.setItem('campus-hint-seen', '1')); });

test('live connection is opt-in and shows the official sign-in destination without navigating', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No attendee connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with AWS Builder ID' })).toBeEnabled();
  // Deliberately do not invoke real OAuth from browser automation.
  await expect(page.getByText('tokens stay in this local server’s memory', { exact: false })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('synthetic live-contract scenario requires confirmation and reflects reconciled favorites', async ({ page }) => {
  const fixture = { id: 'contract-fixture-id', title: 'Synthetic live-panel fixture', topics: ['AI'], format: 'Workshop', venue: 'The Venetian' };
  let writes = 0;
  let favorites: string[] = [];
  await page.route('**/api/attendee/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/attendee/', '');
    let result: unknown;
    if (path === 'session') result = { connected: true, csrf: 'synthetic-csrf' };
    else if (path === 'catalog') result = { sessions: [fixture], expectedCount: 1, refreshedAt: '2026-09-29T00:00:00Z', eventName: 'Synthetic fixture event' };
    else if (path === 'schedule') result = { favorites, reserved: [], personalTime: [] };
    else if (path === `session/${fixture.id}`) result = fixture;
    else if (path === 'favorite') {
      expect(route.request().postDataJSON()).toEqual({ id: fixture.id, desired: true, confirmed: true });
      writes++; favorites = [fixture.id];
      result = { schedule: { favorites, reserved: [], personalTime: [] }, verified: true, message: 'Current favorite state confirmed from GetSchedule.' };
    } else throw new Error(`Unexpected local endpoint: ${path}`);
    await route.fulfill({ json: result });
  });
  await page.goto('/?connection=ready&view=2d');
  // Signed in: the planner loads the catalog by itself.
  await expect(page.getByRole('status').filter({ hasText: 'Loaded' })).toBeVisible();
  await page.getByRole('button', { name: /Synthetic live-panel fixture/ }).click();
  await expect(page.getByText('Timezone not provided')).toBeVisible();
  await page.getByRole('button', { name: 'Review adding AWS favorite' }).click();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Keep current state' }).click();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Review adding AWS favorite' }).click();
  await page.getByRole('button', { name: 'Confirm favorite change' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'confirmed from GetSchedule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review removing AWS favorite' })).toBeVisible();
  expect(writes).toBe(1);
});

test('the map loads the real catalog once when connected, and arriving at a building shows only its sessions', async ({ page }) => {
  let catalogReads = 0;
  let writes = 0;
  let favorites: string[] = [];
  const fixture = { id: 'fixture-live', title: 'Synthetic contract fixture for map navigation', venue: 'The Venetian', topics: ['AI'], tracks: [], speakers: [], format: 'Workshop', date: '2026-12-01', time: '09:00', availability: 'limited' };
  const wynnOnly = { id: 'fixture-wynn', title: 'Synthetic fixture held at Wynn', venue: 'Wynn', topics: [], tracks: [], speakers: [], date: '2026-12-02', time: '10:00' };
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/session')) return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path.endsWith('/schedule')) return route.fulfill({ json: { favorites, reserved: [], personalTime: [] } });
    if (path.endsWith('/catalog')) {
      catalogReads++;
      return route.fulfill({ json: { sessions: [fixture, wynnOnly, { id: 'elsewhere', title: 'Somewhere else', venue: 'Unlisted Hall', topics: [], tracks: [], speakers: [] }], expectedCount: 3, refreshedAt: '2026-09-29T00:00:00Z', eventName: 'Synthetic fixture event', event: { startDate: '2026-11-30T00:00:00-08:00', endDate: '2026-12-04T00:00:00-08:00', timezone: 'America/Los_Angeles', city: 'Las Vegas' } } });
    }
    if (path.endsWith('/favorite')) {
      expect(route.request().postDataJSON()).toEqual({ id: fixture.id, desired: true, confirmed: true });
      writes++; favorites = [fixture.id];
      return route.fulfill({ json: { schedule: { favorites, reserved: [], personalTime: [] }, verified: true, message: 'Current favorite state confirmed from GetSchedule.' } });
    }
    throw new Error(`Unexpected request on the map: ${path}`);
  });
  await page.goto('/map');
  await expect(page.getByRole('status').filter({ hasText: 'Loaded 3 sessions and your current schedule' })).toBeVisible();
  expect(catalogReads).toBe(1);
  await expect(page.getByText('Synthetic fixture event')).toBeVisible();
  await expect(page.getByText('Not on this map: Unlisted Hall (1)', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'The Venetian 1: inspect illustrative venue, 1 sessions in your catalog, 0 reserved, 0 favorited' })).toBeAttached();
  await page.getByRole('button', { name: 'Jump to The Venetian' }).click();
  const panel = page.getByRole('complementary', { name: 'The Venetian sessions' });
  await expect(panel.getByText('Synthetic contract fixture for map navigation')).toBeVisible();
  // Only this building: no Wynn session, no whole-Strip lists.
  await expect(panel.getByText('Synthetic fixture held at Wynn')).toHaveCount(0);
  await expect(panel.getByText('Sessions by building')).toHaveCount(0);
  await expect(panel.getByText('Limited seats')).toBeVisible();
  await expect(panel.getByText('timezone not provided')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open these sessions in the planning desk' })).toHaveAttribute('href', '/?connection=ready&venue=The%20Venetian');
  await panel.getByRole('button', { name: 'Review adding favorite' }).click();
  expect(writes).toBe(0);
  await panel.getByRole('button', { name: 'Keep as is' }).click();
  expect(writes).toBe(0);
  await panel.getByRole('button', { name: 'Review adding favorite' }).click();
  await panel.getByRole('button', { name: 'Confirm favorite change' }).click();
  await expect(panel.getByText('♥ Favorited')).toBeVisible();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Jump to Wynn' }).click();
  const wynn = page.getByRole('complementary', { name: 'Wynn sessions' });
  await expect(wynn.getByText('Synthetic fixture held at Wynn')).toBeVisible();
  await expect(wynn.getByText('Synthetic contract fixture for map navigation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close venue details' }).click();
  await page.getByRole('searchbox', { name: 'Search sessions on the map' }).fill('no such session');
  await expect(page.getByText('Sessions by building · 0 match')).toBeVisible();
  expect(catalogReads).toBe(1);
});

test('reservations: tray review, one confirmed ReserveSessions call, per-session results, then cancel with review', async ({ page }) => {
  const sessions = ['r1', 'r2', 'r3'].map((id, index) => ({ id, title: `Synthetic reservable ${id}`, venue: 'Wynn', topics: [], tracks: [], speakers: [], date: '2026-12-01', time: `1${index}:00`, minutes: '60', availability: 'available' }));
  let reserved: string[] = [];
  const posts: unknown[] = [];
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions, expectedCount: 3, refreshedAt: '2026-09-29T00:00:00Z', eventName: 'Synthetic fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved, personalTime: [] } });
    if (path.startsWith('session/')) return route.fulfill({ json: sessions.find((item) => item.id === decodeURIComponent(path.slice(8))) });
    if (path === 'reserve') {
      const body = route.request().postDataJSON(); posts.push(body);
      reserved = ['r1'];
      return route.fulfill({ json: { schedule: { favorites: [], reserved, personalTime: [] }, verified: true, message: '1 of 2 reservations confirmed from GetSchedule.', results: [{ id: 'r1', reserved: true }, { id: 'r2', reserved: false, code: 'scheduleConflict', conflictsWith: ['r3'] }] } });
    }
    if (path === 'cancel') { reserved = []; return route.fulfill({ json: { schedule: { favorites: [], reserved, personalTime: [] }, verified: true, message: 'Cancellation confirmed from GetSchedule.', results: [{ id: 'r1', reserved: false }] } }); }
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.goto('/?connection=ready&view=2d');
  // Signed in: the planner loads the catalog by itself.
  await expect(page.getByRole('status').filter({ hasText: 'Loaded' })).toBeVisible();
  for (const id of ['r1', 'r2']) {
    await page.getByRole('button', { name: new RegExp(`Synthetic reservable ${id}`) }).click();
    await page.getByRole('button', { name: '+ Add to reservation tray' }).click();
  }
  const tray = page.getByRole('region', { name: 'Reservation tray' });
  await expect(tray).toContainText('Reservation tray · 2/10');
  await tray.getByRole('button', { name: 'Review reservations' }).click();
  expect(posts).toEqual([]);
  await tray.getByRole('button', { name: 'Confirm 2 reservations' }).click();
  expect(posts).toEqual([{ ids: ['r1', 'r2'], confirmed: true }]);
  const results = page.getByRole('status', { name: 'Reservation results' });
  await expect(results).toContainText('✓ Synthetic reservable r1');
  await expect(results).toContainText('It clashes with something already on your schedule. Clashes with: Synthetic reservable r3.');
  await expect(tray).toContainText('Reservation tray · 1/10', { timeout: 2000 });
  await page.locator('#session-list').getByRole('button', { name: /Synthetic reservable r1/ }).click();
  await page.getByRole('button', { name: 'Review cancelling reservation' }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cancellation confirmed from GetSchedule' })).toBeVisible();
  expect(posts.length).toBe(1);
});

test('a signed-in but unregistered Builder ID gets the official registration path instead of a sign-in loop', async ({ page }) => {
  let catalogReads = 0;
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog' || path === 'schedule') { if (path === 'catalog') catalogReads++; return route.fulfill({ status: 403, json: { error: 'This Builder ID is not registered for re:Invent 2026.', reason: 'notRegistered' } }); }
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.goto('/map');
  const help = page.getByRole('alert').filter({ hasText: 'not registered for re:Invent 2026' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('link', { name: 'Open official re:Invent registration' })).toHaveAttribute('href', 'https://registration.awsevents.com/flow/awsevents/reinvent2026/reg');
  await help.getByRole('button', { name: 'I’ve registered — check again' }).click();
  await expect.poll(() => catalogReads).toBe(2);
  await expect(page.getByRole('button', { name: 'Sign in with AWS Builder ID' })).toHaveCount(0);
});

test('a closed reservation window (409) is explained and nothing is retried', async ({ page }) => {
  let reserveCalls = 0;
  const session = { id: 'c1', title: 'Synthetic closed-window session', venue: 'Wynn', topics: [], tracks: [], speakers: [], availability: 'limited' };
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions: [session], expectedCount: 1, refreshedAt: '2026-09-29T00:00:00Z', eventName: 'Synthetic fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved: [], personalTime: [] } });
    if (path === 'reserve') { reserveCalls++; return route.fulfill({ status: 409, json: { error: 'This AWS operation is currently closed. Try again when it opens.', reason: 'closed' } }); }
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.goto('/map');
  await expect(page.getByText('Synthetic fixture event')).toBeVisible();
  await page.getByRole('button', { name: 'Jump to Wynn' }).click();
  await page.getByRole('button', { name: '+ Add to reservation tray' }).click();
  await page.getByRole('button', { name: 'Review reservations' }).click();
  await page.getByRole('button', { name: 'Confirm 1 reservation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'currently closed (409)' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(reserveCalls).toBe(1);
  await expect(page.getByRole('region', { name: 'Reservation tray' })).toContainText('Reservation tray · 1/10');
});

test('the planner loads by itself when signed in, matches "Encore Las Vegas" for Encore, and shows real venue names when a filter finds nothing', async ({ page }) => {
  let catalogReads = 0;
  const sessions = [
    { id: 'e1', title: 'Synthetic session at Encore', venue: 'Encore Las Vegas', topics: [], tracks: [], speakers: [] },
    { id: 'w1', title: 'Synthetic session at Wynn', venue: 'Wynn Las Vegas', topics: [], tracks: [], speakers: [] },
    { id: 'n1', title: 'Synthetic session without venue', topics: [], tracks: [], speakers: [] },
  ];
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') { catalogReads++; return route.fulfill({ json: { sessions, expectedCount: 3, refreshedAt: '2026-09-29T00:00:00Z', eventName: 'Synthetic fixture event' } }); }
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved: [], personalTime: [] } });
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.goto('/?connection=ready&venue=Encore');
  await expect(page.getByRole('button', { name: /Synthetic session at Encore/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Synthetic session at Wynn/ })).toHaveCount(0);
  expect(catalogReads).toBe(1);
  await page.goto('/?connection=ready&venue=Caesars%20Forum');
  await expect(page.getByText('The loaded catalog has no session at “Caesars Forum”')).toBeVisible();
  await expect(page.getByText('Venue not provided · 1')).toBeVisible();
  await page.getByRole('button', { name: 'Wynn Las Vegas · 1' }).click();
  await expect(page.getByRole('button', { name: /Synthetic session at Wynn/ })).toBeVisible();
});

test('the building explorer stacks real floors from room strings, routes to a room by checkpoints, and never invents booths', async ({ page }) => {
  const base = { topics: [], tracks: [], speakers: [], venue: 'The Venetian' };
  const sessions = [
    { ...base, id: 'v1', title: 'Synthetic workshop on Level 3', room: 'Level 3 | Lido 3001A', format: 'Workshop', date: '2026-12-01', time: '10:00' },
    { ...base, id: 'v2', title: 'Synthetic talk on Level 3', room: 'Level 3 | Lido 3002', format: 'Breakout session', date: '2026-12-01', time: '11:00' },
    { ...base, id: 'v3', title: 'Synthetic talk on Level 1', room: 'Level 1 | Hall A', format: 'Breakout session', date: '2026-12-02', time: '09:00' },
    { ...base, id: 'v4', title: 'Synthetic session with no level', room: 'Palazzo Ballroom', format: 'Keynote' },
    { ...base, id: 'w1', title: 'Synthetic Wynn session', venue: 'Wynn', room: 'Level 2 | Room 201' },
  ];
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions, expectedCount: sessions.length, refreshedAt: '2026-10-11T00:00:00Z', eventName: 'Synthetic fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved: [], personalTime: [] } });
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/map');
  await expect(page.getByText('Synthetic fixture event')).toBeVisible();
  await page.getByRole('button', { name: 'Jump to The Venetian' }).click();
  // Arrive first: once the visitor is at the building, the route starts indoors (no "Head to" step).
  await expect(page.locator('canvas').first()).toHaveAttribute('data-walk', 'false', { timeout: 30_000 });
  await expect(page.getByText('YOU’RE AT')).toBeVisible();
  await page.getByRole('button', { name: /Explore inside/ }).click();
  const explorer = page.getByRole('dialog', { name: 'The Venetian explorer' });
  await expect(explorer.getByText('4 of 4 sessions · 4 rooms')).toBeVisible();
  const floors = explorer.getByRole('navigation', { name: 'Floors' });
  await expect(floors.getByRole('button')).toHaveText(['All', 'Expo', '?', '3', '1']);
  await expect(explorer.getByText(/booth numbers are not published yet/)).toBeVisible();
  await expect(explorer.getByText('Synthetic Wynn session')).toHaveCount(0);
  await explorer.getByRole('searchbox').fill('lido 3001');
  await explorer.getByRole('button', { name: /Synthetic workshop on Level 3/ }).click();
  const card = explorer.getByRole('status', { name: 'Your next stop' });
  await expect(card).toContainText('STEP 1 OF 4');
  await expect(card).toContainText('Enter The Venetian');
  await expect(floors.getByRole('button', { name: 'Level 3' })).toHaveAttribute('aria-pressed', 'true');
  for (const expected of ['Go to Level 3', 'Find Level 3 | Lido 3001A', 'Arrive for “Synthetic workshop on Level 3”']) {
    await card.getByRole('button', { name: 'I’m at this checkpoint ✓' }).click();
    await expect(card).toContainText(expected);
  }
  await expect(card.getByRole('button', { name: 'Review adding favorite' })).toBeVisible();
  await explorer.getByRole('searchbox').fill('palazzo');
  await explorer.getByRole('button', { name: /Synthetic session with no level/ }).click();
  await card.getByRole('button', { name: 'I’m at this checkpoint ✓' }).click();
  await expect(card).toContainText('Find the right floor');
  await page.keyboard.press('Escape');
  await expect(explorer).toHaveCount(0);
});

test('planner filters are shareable in the URL, removable as chips, and My schedule groups GetSchedule items by day with clash hints', async ({ page }) => {
  const base = { topics: [], tracks: [], speakers: [], venue: 'Wynn' };
  const sessions = [
    { ...base, id: 'a', title: 'Synthetic reserved A', date: '2026-12-01', time: '10:00', minutes: '60', format: 'Workshop' },
    { ...base, id: 'b', title: 'Synthetic favorite overlapping A', date: '2026-12-01', time: '10:30', minutes: '60', format: 'Chalk talk' },
    { ...base, id: 'c', title: 'Synthetic day-two session', date: '2026-12-02', time: '09:00', minutes: '60', format: 'Workshop' },
  ];
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions, expectedCount: 3, refreshedAt: '2026-10-12T00:00:00Z', eventName: 'Synthetic fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: ['b'], reserved: ['a'], personalTime: [] } });
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.goto('/?format=Workshop');
  await expect(page.getByRole('status').filter({ hasText: '2 live sessions match' })).toBeVisible();
  await page.locator('.filters').getByLabel('Day').selectOption('2026-12-02');
  await expect(page).toHaveURL(/day=2026-12-02/);
  await expect(page.getByRole('status').filter({ hasText: '1 live sessions match' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove filter Workshop' }).click();
  await expect(page).not.toHaveURL(/format=/);
  const mine = page.getByRole('region', { name: 'My schedule' });
  await expect(mine.getByRole('heading', { name: '2026-12-01' })).toBeVisible();
  await expect(mine).toContainText('★ Reserved');
  await expect(mine).toContainText('Possible clash by listed local time with Synthetic reserved A');
});

test('QA regressions: a session with no seats offers a seat re-check, not a doomed reservation', async ({ page }) => {
  const sessions = [{ id: 'full', title: 'Synthetic full session', venue: 'Wynn', topics: [], tracks: [], speakers: [], availability: 'unavailable', date: '2026-12-01', time: '10:00' }];
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions, expectedCount: 1, refreshedAt: '2026-10-12T00:00:00Z', eventName: 'Synthetic fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved: [], personalTime: [] } });
    if (path.startsWith('session/')) return route.fulfill({ json: sessions[0] });
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.goto('/');
  await page.locator('#session-list').getByRole('button', { name: /Synthetic full session/ }).click();
  await expect(page.getByText('No seats available right now')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add to reservation tray' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Re-check seats' })).toBeVisible();
});

test('AI concierge shows only catalog sessions with AI-written reasons, and adding a pick only fills the review tray', async ({ page }) => {
  const sessions = [
    { id: 'g1', title: 'Synthetic generative AI builders session', venue: 'Wynn', date: '2026-12-01', time: '13:00', minutes: '60', availability: 'available', reservable: true, topics: ['Generative AI'], tracks: [], speakers: [] },
    { id: 's1', title: 'Synthetic serverless session', venue: 'The Venetian', date: '2026-12-01', time: '09:00', minutes: '60', availability: 'available', reservable: true, topics: ['Serverless'], tracks: [], speakers: [] },
  ];
  const writes: string[] = [];
  let asked: Record<string, unknown> | undefined;
  await page.route('**/api/attendee/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'synthetic-csrf' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions, expectedCount: 2, refreshedAt: '2026-11-07T00:00:00Z', eventName: 'Synthetic fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved: [], personalTime: [] } });
    writes.push(path);
    throw new Error(`Unexpected local endpoint: ${path}`);
  });
  await page.route('**/api/ai/ask', async (route) => {
    asked = route.request().postDataJSON();
    expect(route.request().headers()['x-campus-csrf']).toBe('synthetic-csrf');
    return route.fulfill({ json: { mode: 'concierge', picks: [{ id: 'g1', reason: 'Hands-on generative AI, matches your interest.' }], note: 'Arrive early.', fallback: false, provider: 'Synthetic model', shortlisted: 2, dropped: 1 } });
  });
  await page.goto('/?connection=ready');
  const panel = page.getByRole('region', { name: 'Plan my day with AI' });
  await panel.getByRole('textbox').fill('generative ai');
  await panel.getByRole('button', { name: 'Suggest sessions' }).click();
  await expect(panel.getByText('Synthetic generative AI builders session')).toBeVisible();
  await expect(panel.getByText('Hands-on generative AI, matches your interest.')).toBeVisible();
  await expect(panel.getByText(/1 unverifiable suggestion removed/)).toBeVisible();
  expect(asked).toEqual({ mode: 'concierge', question: 'generative ai' });
  await panel.getByRole('button', { name: /Add to reservation tray|reservation tray/i }).first().click();
  await expect(page.locator('.bk-tray').first()).toContainText('Synthetic generative AI builders session');
  expect(writes).toEqual([]);
});

test('the Strip guide shows grounded answers with walk-to buttons and explains limits instead of failing silently', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('campus-hint-seen', '1'));
  let calls = 0;
  await page.route('**/api/guide', async (route) => {
    calls++;
    const { question } = route.request().postDataJSON();
    if (/python/i.test(question)) return route.fulfill({ json: { refused: true, answer: 'I can only help with Campus Companion: the six re:Invent 2026 venues, the Strip globe, the passport and how to use this site.', places: [] } });
    if (/again/i.test(question)) return route.fulfill({ status: 429, json: { error: 'You’ve asked a lot of questions. Please wait a little and try again.' } });
    return route.fulfill({ json: { refused: false, answer: 'The opening keynote is at The Venetian.', places: ['venue-venetian'] } });
  });
  await page.goto('/map');
  const guide = page.getByRole('region', { name: 'Ask the Strip guide' });
  await guide.getByRole('button', { name: 'Where is the opening keynote?' }).click();
  await expect(guide.getByText('The opening keynote is at The Venetian.')).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Walk to The Venetian →' })).toBeVisible();
  await guide.getByRole('textbox').fill('write python for me');
  await guide.getByRole('button', { name: 'Ask' }).click();
  await expect(guide.getByText(/I can only help with Campus Companion/)).toBeVisible();
  await guide.getByRole('textbox').fill('ask again please');
  await guide.getByRole('button', { name: 'Ask' }).click();
  await expect(guide.getByText(/wait a little/)).toBeVisible();
  expect(calls).toBe(3);
});
