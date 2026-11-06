import { Router, json, type NextFunction, type Request, type Response } from 'express';
import { Attendee, AppError, equalSecret, secret } from './attendee.ts';
import { MemoryBackend, ProgressStore } from './progress.ts';
import { AiService, readRequest } from './ai.ts';

export function attendeeRoutes(progress = new ProgressStore(new MemoryBackend()), ai = new AiService()) {
  const router = Router();
  const sessions = new Map<string, { attendee: Attendee; touched: number }>();
  function context(req: Request, create = false) {
    const id = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('campus-session='))?.slice('campus-session='.length);
    if (id && sessions.has(id)) {
      const session = sessions.get(id)!;
      session.touched = Date.now();
      return { id, ...session };
    }
    if (!create) throw new AppError(401, 'Open the local connection panel and sign in again.', undefined, 'signIn');
    for (const [key, value] of sessions) if (value.touched < Date.now() - 8 * 60 * 60_000) sessions.delete(key);
    if (sessions.size >= 10) {
      // Make room by forgetting the least recently used signed-out browser; signed-in sessions are never evicted.
      const idle = [...sessions].filter(([, value]) => !value.attendee.connected).sort((a, b) => a[1].touched - b[1].touched)[0];
      if (!idle) throw new AppError(429, 'Too many signed-in local browser sessions. Disconnect one or restart the local app.');
      sessions.delete(idle[0]);
    }
    const next = { attendee: new Attendee(), touched: Date.now() };
    const newId = secret();
    sessions.set(newId, next);
    return { id: newId, ...next };
  }
  /** Every state-changing local request needs the exact Origin and this browser session's CSRF token. */
  function guard(req: Request, _res: Response, next: NextFunction) {
    if (req.method === 'POST') {
      const attendee = context(req).attendee;
      if (req.headers.origin !== `http://${req.headers.host}` || !equalSecret(String(req.headers['x-campus-csrf'] ?? ''), attendee.csrf)) throw new AppError(403, 'This action must be confirmed in the local application.');
    }
    next();
  }
  const confirmed = (req: Request) => Boolean(req.body && req.body.confirmed === true);

  router.use(['/api/attendee', '/api/progress', '/api/ai', '/callback', '/logout'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store'); next();
  });
  router.get('/api/attendee/session', (req, res) => {
    const session = context(req, true);
    res.cookie('campus-session', session.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60_000 });
    res.json({ connected: session.attendee.connected, csrf: session.attendee.csrf });
  });
  router.use(['/api/attendee', '/api/progress', '/api/ai'], guard, json({ limit: '8kb' }));
  router.post('/api/attendee/connect', (req, res) => {
    const returnTo = req.body?.returnTo === '/map' || req.body?.returnTo === '/passport' ? req.body.returnTo as '/map' | '/passport' : '/';
    res.json({ url: context(req).attendee.start(`http://${req.headers.host}`, returnTo) });
  });
  router.get('/callback', async (req, res) => {
    let returnTo = '/';
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const attendee = context(req).attendee;
      returnTo = attendee.returnTo;
      returnTo = await attendee.callback(code, state, `http://${req.headers.host}`);
      // Carry this browser's guest EXP into the Builder ID profile; a storage failure must not block sign-in.
      await progress.merge(attendee.guest, attendee.identity).catch(() => undefined);
      res.redirect(303, `${returnTo}?connection=ready`);
    } catch {
      // Never echo an auth code, raw error, token, or untrusted redirect target.
      res.redirect(303, `${returnTo}?connection=failed`);
    }
  });
  router.get('/api/attendee/catalog', async (req, res) => res.json(await context(req).attendee.getCatalog(req.query.refresh === 'true')));
  router.get('/api/attendee/schedule', async (req, res) => res.json(await context(req).attendee.schedule()));
  router.get('/api/attendee/session/:id', async (req, res) => res.json(await context(req).attendee.getSession(String(req.params.id))));
  router.get('/api/attendee/sessions', async (req, res) => {
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter(Boolean) : [];
    res.json(await context(req).attendee.refreshSessions(ids));
  });
  router.post('/api/attendee/favorite', async (req, res) => {
    if (!confirmed(req) || typeof req.body.id !== 'string' || typeof req.body.desired !== 'boolean') throw new AppError(400, 'Review and confirm a specific favorite change.');
    const result = await context(req).attendee.favorite(req.body.id, req.body.desired);
    const attendee = context(req).attendee;
    const view = result.verified && req.body.desired ? await progress.verifiedPlanning(attendee.identity, 'favorite', [req.body.id]) : undefined;
    res.json({ ...result, progress: view });
  });
  router.post('/api/attendee/reserve', async (req, res) => {
    const ids = req.body?.ids;
    if (!confirmed(req) || !Array.isArray(ids) || ids.some((id: unknown) => typeof id !== 'string')) throw new AppError(400, 'Review and confirm the specific sessions to reserve.');
    const result = await context(req).attendee.reserve(ids);
    const reserved = result.results.filter((item) => item.reserved).map((item) => item.id);
    res.json({ ...result, progress: reserved.length ? await progress.verifiedPlanning(context(req).attendee.identity, 'reserve', reserved) : undefined });
  });
  router.post('/api/attendee/cancel', async (req, res) => {
    if (!confirmed(req) || typeof req.body.id !== 'string') throw new AppError(400, 'Review and confirm the reservation to cancel.');
    res.json(await context(req).attendee.cancel(req.body.id));
  });
  router.post('/api/attendee/disconnect', async (req, res) => res.json({ logoutUrl: await context(req).attendee.disconnect(`http://${req.headers.host}`) }));
  router.get('/logout', (_req, res) => res.redirect(303, '/?connection=disconnected'));

  router.get('/api/ai/status', (_req, res) => res.json(ai.status));
  /** AI suggestions. The shortlist comes from this server's cached catalog and GetSchedule; nothing is written to AWS. */
  router.post('/api/ai/ask', async (req, res) => {
    const request = readRequest(req.body);
    const session = context(req);
    if (!session.attendee.connected) throw new AppError(401, 'Sign in and load your catalog to use AI suggestions.', undefined, 'signIn');
    const catalog = await session.attendee.getCatalog();
    const schedule = request.mode === 'tldr' ? undefined : await session.attendee.schedule();
    res.json(await ai.ask(session.id, request, catalog.sessions, schedule));
  });
  const profile = (req: Request) => (context(req).attendee.identity.startsWith('builder:') ? 'builder' : 'guest');
  router.get('/api/progress', async (req, res) => res.json({ ...await progress.view(context(req).attendee.identity), profile: profile(req) }));
  router.post('/api/progress/award', async (req, res) => {
    const key = req.body?.key;
    if (typeof key !== 'string' || key.length > 160) throw new AppError(400, 'Unknown award.');
    let view;
    try { view = await progress.award(context(req).attendee.identity, key); } catch (error) {
      if (error instanceof Error && error.message === 'Unknown award.') throw new AppError(400, 'Unknown award.');
      throw new AppError(503, 'Progress storage is unavailable. Exploration continues; EXP was not saved.');
    }
    res.json({ ...view, profile: profile(req) });
  });
  return router;
}
