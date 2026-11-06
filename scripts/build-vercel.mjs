// Vercel build (Build Output API v3): static hosted-preview site + one bundled function, POST /api/guide.
// Run by Vercel via vercel.json; locally: `node scripts/build-vercel.mjs` then inspect .vercel/output.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_HOSTED: '1' } });
cpSync('dist', `${out}/static`, { recursive: true });

const fn = `${out}/functions/api/guide.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ['server/vercel-guide.ts'], outfile: `${fn}/index.mjs`, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  minify: true, legalComments: 'none', logLevel: 'warning',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 20, memory: 512 }));

const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '/(.*)', headers: security, continue: true },
    { handle: 'filesystem' },
    { src: '/api/(.*)', status: 404, dest: '/404-api' },
    { src: '/(map|passport)/?', dest: '/index.html' },
  ],
}, null, 2));
console.log('Vercel output ready:', out);
