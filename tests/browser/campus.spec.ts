import { expect, test } from '@playwright/test';

// The first-visit controls card is covered by its own test; skip it elsewhere so it does not cover the canvas.
test.beforeEach(async ({ page }, info) => { if (!info.title.includes('controls card')) await page.addInitScript(() => localStorage.setItem('campus-hint-seen', '1')); });

test('campus renders, jumps to a venue, orbits, and returns to overview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/map');
  await expect(page).toHaveTitle(/Explore the Strip globe/);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute('data-calls'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Jump to Wynn' }).click();
  await expect(page.getByRole('heading', { name: 'Wynn' })).toBeVisible();
  // Labels only show when their building faces the camera, so check after the visitor has arrived.
  await expect(canvas).toHaveAttribute('data-walk', 'false', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Wynn: inspect illustrative venue' })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-walk', 'false', { timeout: 20_000 });
  await page.getByRole('button', { name: '⚙ View' }).click();
  await page.getByRole('button', { name: 'Reduce motion' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Overview', exact: false }).click();
  await expect(canvas).toHaveAttribute('data-view', 'globe');
  const overviewCamera = await canvas.getAttribute('data-camera');
  // Projected labels move with the globe; make them click-through so the drag lands on the planet itself.
  await page.addStyleTag({ content: '.landmark-label{pointer-events:none!important}' });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.4, bounds!.y + bounds!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.3, bounds!.y + bounds!.height * 0.55, { steps: 10 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-camera', overviewCamera!);
  await page.mouse.move(bounds!.x + bounds!.width * 0.3, bounds!.y + bounds!.height * 0.5);
  await page.mouse.wheel(0, -900);
  await expect(canvas).toHaveAttribute('data-view', 'street');
  await page.getByRole('button', { name: 'Overview', exact: false }).click();
  await expect(canvas).toHaveAttribute('data-view', 'globe');
  const calls = Number(await canvas.getAttribute('data-calls'));
  const triangles = Number(await canvas.getAttribute('data-triangles'));
  expect(calls).toBeLessThan(250);
  expect(triangles).toBeLessThan(100_000);
  await page.getByRole('link', { name: /^Planner/ }).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Plan what’s next/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a lost WebGL context falls back to the real-data planning desk', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-calls'))).toBeGreaterThan(0);
  await page.locator('canvas').evaluate((canvas) => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.getByText('3D is unavailable on this device.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Explore the session list' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with AWS Builder ID' })).toBeVisible();
});

test('the planning desk never downloads the heavy 3D renderer and shows no invented sessions', async ({ page }) => {
  const sceneRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('CampusCanvas')) sceneRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Plan what’s next/ })).toBeVisible();
  await expect(page.getByText(/sample|synthetic|fictional/i)).toHaveCount(0);
  expect(sceneRequests).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('an unavailable GPU still offers the planning desk', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/map');
  await expect(page.getByText('3D is unavailable on this device.', { exact: false }).filter({ visible: true })).toBeVisible();
  await page.getByRole('link', { name: 'Explore the session list' }).click();
  await expect(page.getByRole('heading', { name: /Plan what’s next/ })).toBeVisible();
});

test('the map is its own full viewport and the visitor walks via keyboard and on-screen controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/map');
  await page.reload(); // Verify the production server serves a direct map URL.
  const canvas = page.locator('canvas');
  await expect.poll(async () => Number(await canvas.getAttribute('data-calls'))).toBeGreaterThan(0);
  const layout = await page.evaluate(() => ({
    body: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    width: document.querySelector('.map-page')!.getBoundingClientRect().width,
  }));
  expect(layout.body).toBe(layout.viewport);
  expect(layout.width).toBe(1280);
  await expect(page.getByRole('button', { name: 'Jump to Encore' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jump to MGM Grand' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Walking · ON' })).toHaveAttribute('aria-pressed', 'true');
  const before = await canvas.getAttribute('data-avatar');
  await page.keyboard.down('w');
  await expect.poll(() => canvas.getAttribute('data-avatar')).not.toBe(before);
  // The avatar animates: legs swing while walking and settle back to rest afterwards.
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-stride')))).toBeGreaterThan(0.05);
  await expect(canvas).toHaveAttribute('data-walk', 'true');
  await page.keyboard.up('w');
  await expect(canvas).toHaveAttribute('data-walk', 'false');
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-stride')))).toBeLessThan(0.02);
  const afterKeyboard = await canvas.getAttribute('data-avatar');
  await page.getByRole('button', { name: 'Walk right' }).dispatchEvent('pointerdown');
  await expect.poll(() => canvas.getAttribute('data-avatar')).not.toBe(afterKeyboard);
  await page.getByRole('button', { name: 'Walk right' }).dispatchEvent('pointerup');
  await page.getByRole('button', { name: 'Jump to Caesars Palace' }).click();
  await expect(page.getByRole('heading', { name: 'Caesars Palace' })).toBeVisible();
  await expect(page.getByText('Sign in to see this building’s real sessions')).toBeVisible();
  await expect(page.getByText(/sample|synthetic session/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: false }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Campus overview.' })).toBeVisible();
});

test('narrow map retains the scene, return link, and walking controls without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Walk forward' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Planner/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the visitor walks to a clicked venue around obstacles, and time of day and ambient life are interactive', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/map');
  const canvas = page.locator('canvas');
  await expect.poll(async () => Number(await canvas.getAttribute('data-calls'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Jump to Wynn' }).click();
  await expect(canvas).toHaveAttribute('data-walk', 'true');
  await expect(canvas).toHaveAttribute('data-walk', 'false', { timeout: 20_000 });
  const [x, z] = (await canvas.getAttribute('data-avatar'))!.split(',').map(Number);
  expect(Math.hypot(x! - 3.1, z! + 15.7)).toBeLessThan(0.25); // arrived at the Wynn plaza
  await page.getByRole('button', { name: '⚙ View' }).click();
  const night = page.getByRole('button', { name: /Time of day: Day/ });
  await night.click();
  await expect(page.locator('.campus-stage')).toHaveAttribute('data-time', 'sunset');
  await page.getByRole('button', { name: /Time of day: Sunset/ }).click();
  await expect(page.locator('.campus-stage')).toHaveAttribute('data-time', 'night');
  // Ambient life is opt-in: no animation loop while at rest until it is switched on.
  const frames = Number(await canvas.getAttribute('data-frames'));
  await page.waitForTimeout(600);
  expect(Number(await canvas.getAttribute('data-frames')) - frames).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Ambient life' }).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames')) - frames).toBeGreaterThan(8);
  await page.getByRole('button', { name: 'Ambient life' }).click();
  // The walk is bounded by the diorama: an unreachable spot is ignored rather than crossing a building.
  await page.getByRole('button', { name: 'Overview' }).click();
});

test('discovering places earns EXP, the passport lists stamps and quests, and the shuttle can be ridden', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // Parallel tests share one local server, so this test gets its own progress state. Server-side award rules
  // (validation, no repeats, quests, verified-only planning EXP) are covered by tests/reservations.test.ts.
  const { ProgressStore, MemoryBackend } = await import('../../server/progress.ts');
  const store = new ProgressStore(new MemoryBackend());
  await page.route('**/api/progress**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: await store.view('guest:e2e-isolated-profile') });
    try { return route.fulfill({ json: await store.award('guest:e2e-isolated-profile', route.request().postDataJSON().key) }); } catch { return route.fulfill({ status: 400, json: { error: 'Unknown award.' } }); }
  });
  await page.goto('/map');
  const canvas = page.locator('canvas');
  await expect.poll(async () => Number(await canvas.getAttribute('data-calls'))).toBeGreaterThan(0);
  const hud = page.getByRole('button', { name: /^LV \d+ .*EXP.* — open passport$/ });
  await expect(hud).toHaveAccessibleName(/LV 1 Newcomer 0 EXP/);
  await page.getByRole('button', { name: 'Jump to Wynn' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Discovered Wynn' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Here: Wynn')).toContainText('From the 2026 AWS agenda');
  await expect(hud).not.toHaveAccessibleName(/Newcomer 0 EXP/);
  await hud.click();
  const passport = page.getByRole('dialog', { name: 'Exploration passport' });
  await expect(passport.getByRole('button', { name: /^Discovered: Wynn\. Walk there$/ })).toBeVisible();
  await expect(passport).toContainText('not a record of real attendance');
  // Walk to an illustrative shuttle stop from the passport, then ride to another stop.
  await passport.getByRole('button', { name: /Shuttle stop · Wynn\. Walk there$/ }).click();
  const postcard = page.getByLabel('Here: Shuttle stop · Wynn');
  await expect(postcard).toContainText('Illustrative — not an official location', { timeout: 20_000 });
  await postcard.getByRole('button', { name: 'MGM Grand' }).click();
  await expect(canvas).toHaveAttribute('data-ride', 'true');
  await expect(canvas).toHaveAttribute('data-ride', 'false', { timeout: 20_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Rode the shuttle' })).toBeVisible();
  await expect(page.getByLabel('Here: Shuttle stop · MGM Grand')).toBeVisible();
});

test('Shift runs faster than walking and the blocky visitor animates its limbs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/map');
  const canvas = page.locator('canvas');
  await expect.poll(async () => Number(await canvas.getAttribute('data-calls'))).toBeGreaterThan(0);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect(canvas).toHaveAttribute('data-walk', 'run');
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-stride')))).toBeGreaterThan(0.1);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-walk', 'false');
});

test('the first-visit controls card explains how to play once, then stays dismissed', async ({ page }) => {
  await page.goto('/map');
  const card = page.getByRole('note').filter({ hasText: 'How to play' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Shift');
  await card.getByRole('button', { name: 'Let’s go' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'How to play' })).toHaveCount(0);
});

test('the HUD keeps secondary settings in a popover, the legend in "About", and help can be reopened', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lighter graphics' })).toHaveCount(0);
  await page.getByRole('button', { name: '⚙ View' }).click();
  await expect(page.getByRole('group', { name: 'View settings' }).getByRole('button', { name: 'Lighter graphics' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'View settings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'About this map and legend' }).click();
  await expect(page.getByRole('group', { name: 'About this map' })).toContainText('Illustrative geography, not a wayfinding map');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('note', { name: 'How to play' })).toBeVisible();
});

test('the passport and building explorer behave like dialogs for keyboard users', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('canvas')).toBeVisible();
  const opener = page.getByRole('button', { name: /open passport/ });
  await opener.click();
  await expect(page.getByRole('heading', { name: 'Exploration passport' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Exploration passport' })).toHaveCount(0);
  await expect(opener).toBeFocused();
  // Projected 3D labels are mouse affordances; the minimap and lists carry keyboard navigation.
  await expect(page.locator('.landmark-label').first()).toHaveAttribute('tabindex', '-1');
});

test('on a phone the details panel is a bottom sheet that peeks and expands', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map');
  const handle = page.getByRole('button', { name: 'Show details' });
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  const peek = await page.locator('#map-details').boundingBox();
  expect(peek!.height).toBeLessThan(110);
  await handle.click();
  await expect(page.getByRole('button', { name: 'Show more map' })).toHaveAttribute('aria-expanded', 'true');
  expect((await page.locator('#map-details').boundingBox())!.height).toBeGreaterThan(300);
});

test('QA regressions: tablet layout keeps the EXP badge, walk pad and help reachable, and venues are keyboard-reachable at any width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/map');
  await expect(page.locator('canvas')).toBeVisible();
  const covered = async (selector: string) => page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return 'missing';
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit && (element === hit || element.contains(hit)) ? 'ok' : `covered by ${hit?.className}`;
  }, selector);
  expect(await covered('.exp-hud')).toBe('ok');
  for (const label of ['About this map and legend', 'How to play']) {
    const button = page.getByRole('button', { name: label });
    const box = (await button.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute('aria-label'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe(label);
  }
  // With the minimap hidden at this width, the overview panel still lists every venue as a real button.
  const quick = page.getByRole('navigation', { name: 'Go to a venue' });
  await expect(quick.getByRole('button')).toHaveCount(6);
  await quick.getByRole('button', { name: '2 · Wynn' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Wynn', level: 1 })).toBeVisible();
});

test('QA regressions: the skip link is visible on focus and popovers close on an outside click', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('canvas')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip the world to venue details' });
  await expect(skip).toBeFocused();
  const box = (await skip.boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.textContent, [box.x + box.width / 2, box.y + box.height / 2])).toContain('Skip the world');
  await page.getByRole('button', { name: '⚙ View' }).click();
  await expect(page.getByRole('group', { name: 'View settings' })).toBeVisible();
  await page.locator('canvas').click({ position: { x: 300, y: 300 } });
  await expect(page.getByRole('group', { name: 'View settings' })).toHaveCount(0);
});

test('event passport shows the identity page, six venue stamps, quests and a sign-in path for session stamps', async ({ page }) => {
  await page.goto('/passport');
  await expect(page.getByRole('heading', { name: /Your event passport/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Passport' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.pp-stamps li')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: /^Quests/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sign in with AWS Builder ID/ })).toBeVisible();
  await expect(page.getByText(/not a record of real-world attendance/)).toBeVisible();
  await page.getByRole('link', { name: /Collect stamps on the globe/ }).click();
  await expect(page).toHaveURL(/\/map$/);
});
