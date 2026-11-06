// Records demo B-roll clips with Playwright (synthetic data only, visibly badged).
// Usage: npm run build && npm start   (in another terminal)   then   node scripts/record-demo.mjs [baseUrl]
// Output: .local/demo-video/*.webm (git-ignored). Real sign-in shots are recorded by the participant, never automated.
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:8484';
const out = new URL('../.local/demo-video/', import.meta.url).pathname;
await mkdir(out, { recursive: true });

const sessions = [
  ['DEMO-201', 'Build an agent with generative AI (demo data)', 'Wynn', '2026-12-01', '13:00', ['Generative AI']],
  ['DEMO-202', 'Serverless event-driven patterns (demo data)', 'The Venetian', '2026-12-01', '09:00', ['Serverless']],
  ['DEMO-203', 'Guardrails for generative AI apps (demo data)', 'Caesars Forum', '2026-12-01', '15:00', ['Generative AI', 'Security']],
  ['DEMO-204', 'Vector search for beginners (demo data)', 'The Venetian', '2026-12-01', '11:00', ['Generative AI', 'Databases']],
  ['DEMO-205', 'Observability for microservices (demo data)', 'Wynn', '2026-12-01', '16:00', ['Containers']],
].map(([id, title, venue, date, time, topics]) => ({ id, title, venue, date, time, minutes: '60', timezone: 'PST', availability: 'available', reservable: true, topics, tracks: [], speakers: [], abstract: 'Synthetic demo record for the video. Not a real re:Invent session.' }));

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem('campus-hint-seen', '1');
    addEventListener('DOMContentLoaded', () => {
      const tag = document.createElement('div');
      tag.textContent = 'SYNTHETIC DEMO DATA';
      tag.setAttribute('aria-hidden', 'true');
      Object.assign(tag.style, { position: 'fixed', zIndex: 9999, left: '50%', bottom: '10px', transform: 'translateX(-50%)', padding: '4px 12px', borderRadius: '40px', background: '#ff9900', color: '#0f141a', font: '700 11px Helvetica, Arial', letterSpacing: '1px', pointerEvents: 'none' });
      document.body.append(tag);
    });
  });
  await page.route('**/api/attendee/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/attendee/', '');
    if (path === 'session') return route.fulfill({ json: { connected: true, csrf: 'demo' } });
    if (path === 'catalog') return route.fulfill({ json: { sessions, expectedCount: sessions.length, refreshedAt: new Date().toISOString(), eventName: 'Demo fixture event' } });
    if (path === 'schedule') return route.fulfill({ json: { favorites: [], reserved: [], personalTime: [] } });
    return route.fulfill({ status: 404, json: { error: 'Not part of the demo' } });
  });
  await page.route('**/api/ai/ask', (route) => {
    const body = route.request().postDataJSON();
    const picks = body.mode === 'guide'
      ? [{ id: 'DEMO-201', reason: 'Hands-on agents session right here at Wynn.' }, { id: 'DEMO-205', reason: 'Later the same afternoon, same building.' }]
      : [{ id: 'DEMO-204', reason: 'Beginner-level and about generative AI, as you asked.' }, { id: 'DEMO-201', reason: 'Hands-on follow-up in the afternoon, no clash.' }, { id: 'DEMO-203', reason: 'Adds the security angle you mentioned.' }];
    return route.fulfill({ json: { mode: body.mode, picks, note: 'Leave 20 minutes to walk between venues.', fallback: false, provider: 'demo model (scripted)', shortlisted: 4, dropped: 1 } });
  });
}

async function clip(name, run) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  await stub(page);
  try { await run(page); } catch (error) { console.error(`${name}: ${error.message}`); }
  const video = page.video();
  await context.close(); await browser.close();
  if (video) await rename(await video.path(), `${out}${name}.webm`);
  console.log('recorded', name);
}
const pause = (page, ms) => page.waitForTimeout(ms);

await clip('01-planner-hero', async (page) => { await page.goto(`${base}/`); await pause(page, 2500); await page.mouse.wheel(0, 500); await pause(page, 2000); });
await clip('02-ai-concierge', async (page) => {
  await page.goto(`${base}/?connection=ready`);
  const panel = page.getByRole('region', { name: 'Plan my day with AI' });
  await panel.scrollIntoViewIfNeeded(); await pause(page, 1200);
  await panel.getByRole('textbox').pressSequentially('Beginner generative AI on Dec 1, plus some security', { delay: 45 });
  await panel.getByRole('button', { name: 'Suggest sessions' }).click(); await pause(page, 2500);
  await panel.getByRole('button', { name: /reservation tray/i }).first().click(); await pause(page, 2500);
});
await clip('03-globe-walk', async (page) => {
  await page.goto(`${base}/map`); await pause(page, 12000);
  await page.getByRole('button', { name: /^3 · The Venetian$/ }).click(); await pause(page, 12000);
});
await clip('04-building-guide', async (page) => {
  await page.goto(`${base}/map?connection=ready`); await pause(page, 12000);
  await page.getByRole('button', { name: /^2 · Wynn$/ }).click(); await pause(page, 10000);
  const guide = page.getByRole('region', { name: 'Ask the building guide' });
  await guide.getByRole('textbox').pressSequentially('Anything hands-on here?', { delay: 45 });
  await guide.getByRole('button', { name: 'Ask' }).click(); await pause(page, 3500);
});
await clip('05-passport', async (page) => { await page.goto(`${base}/passport`); await pause(page, 2000); await page.mouse.wheel(0, 420); await pause(page, 2500); await page.mouse.wheel(0, 600); await pause(page, 2000); });
console.log((await readdir(out)).filter((file) => file.endsWith('.webm')));
