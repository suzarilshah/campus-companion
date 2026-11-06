import express from 'express';
import { attendeeRoutes } from './attendee-routes.ts';
import { AppError } from './attendee.ts';
import type { ProgressStore } from './progress.ts';
import type { AiService } from './ai.ts';
import { GuideError, type GuideService } from './guide.ts';

/** Fail closed on DNS rebinding and foreign browser origins before serving anything. */
export function createLocalApp(port: number, live = false, progress?: ProgressStore, ai?: AiService, guide?: GuideService) {
  const app = express();
  const authorities = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const authority = req.headers.host;
    if (!authority || !authorities.has(authority)) {
      res.status(403).json({ error: 'This application is available only on its local address.' });
      return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${authority}`) {
      res.status(403).json({ error: 'Cross-origin requests are not accepted.' });
      return;
    }
    const authReturn = live && req.method === 'GET' && ['/callback', '/logout'].includes(req.path);
    // A cross-site redirect chain (AWS → /callback → /) keeps Sec-Fetch-Site: cross-site on the final
    // landing page. Plain top-level page loads are read-only, so allow them; /api stays blocked.
    const pageNavigation = ['GET', 'HEAD'].includes(req.method)
      && req.headers['sec-fetch-mode'] === 'navigate'
      && req.headers['sec-fetch-dest'] === 'document'
      && !req.path.startsWith('/api');
    if (req.headers['sec-fetch-site'] === 'cross-site' && !authReturn && !pageNavigation) {
      res.status(403).json({ error: 'Open this application directly on your computer.' });
      return;
    }
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'microphone=(), camera=(), geolocation=()',
    });
    next();
  });
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json(live ? { mode: 'local', attendeeStatus: 'per-browser' } : { mode: 'synthetic', attendeeConnected: false });
  });
  // Public Strip guide (same service and quotas as the hosted site; Origin is already checked above).
  app.post('/api/guide', express.json({ limit: '2kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.headers.origin) { res.status(403).json({ error: 'Not allowed.' }); return; }
    if (!guide?.enabled) { res.status(503).json({ error: 'The Strip guide is turned off right now.' }); return; }
    try { res.json(await guide.ask(req.socket.remoteAddress ?? '', req.body?.question)); } catch (error) {
      if (error instanceof GuideError) { if (error.retryAfter) res.set('Retry-After', String(error.retryAfter)); res.status(error.status).json({ error: error.message }); } else res.status(500).json({ error: 'Something went wrong.' });
    }
  });
  if (live) app.use(attendeeRoutes(progress, ai));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) {
      if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
      res.status(error.status).json({ error: error.message, ...(error.reason ? { reason: error.reason } : {}) });
    } else res.status(502).json({ error: 'The request could not be verified. Refresh before retrying any change.' });
  });
  // Nothing in this slice can accept attendee mutations or fall through to HTML.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API operation not implemented.' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD').status(405).end();
      return;
    }
    next();
  });
  return app;
}
