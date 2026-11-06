import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createLocalApp } from './app.ts';
import { FileBackend, MemoryBackend, NeonBackend, ProgressStore } from './progress.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const production = process.argv.includes('--production');
const port = Number(process.env.PORT ?? 8484);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('PORT must be an integer between 1024 and 65535.');
}
// EXP awards only (no tokens or schedule); git-ignored. PROGRESS_FILE=':memory:' keeps test runs isolated.
// Optional git-ignored .env (e.g. DATABASE_URL for Neon). Values are never printed.
// .env.local is written by `neon link`; .env is for manual overrides. Existing variables win.
for (const file of ['.env.local', '.env']) { try { process.loadEnvFile(resolve(root, file)); } catch { /* Optional file. */ } }
const progressFile = process.env.PROGRESS_FILE ?? resolve(root, '.local/progress.json');
const progress = new ProgressStore(progressFile === ':memory:' ? new MemoryBackend()
  : process.env.DATABASE_URL ? new NeonBackend(process.env.DATABASE_URL) : new FileBackend(progressFile));
const app = createLocalApp(port, true, progress);
const server = createServer(app);
let closeVite: (() => Promise<void>) | undefined;

if (production) {
  try {
    await access(resolve(root, 'dist/index.html'));
  } catch {
    console.error('Build the application first: npm run build');
    process.exit(1);
  }
  app.use(express.static(resolve(root, 'dist'), { dotfiles: 'deny', index: 'index.html' }));
  app.get(['/map', '/passport'], (_req, res) => res.sendFile(resolve(root, 'dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { server },
      cors: false,
      fs: { strict: true, allow: [root] },
    },
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}
app.use((_req, res) => res.status(404).type('text').send('Page not found.'));
server.on('error', async (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Stop the other process or choose another PORT for sample mode.`
    : `Local server failed: ${error.code ?? 'unknown error'}`);
  await closeVite?.();
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.info(`Campus companion · local browser app\nOpen http://127.0.0.1:${port}\nProgress storage: ${progress.storage}. Live connection is user-initiated. Press Ctrl+C to stop.`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await closeVite?.();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
