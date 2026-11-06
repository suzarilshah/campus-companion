import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Verify distributable source without reusing node_modules, dist or local settings.
const root = fileURLToPath(new URL('..', import.meta.url));
const destination = await mkdtemp(join(tmpdir(), 'campus-clean-'));
const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'playwright.config.ts', 'index.html', 'server', 'src', 'tests', 'contracts'];
let code = 0;
try {
  for (const file of files) await cp(join(root, file), join(destination, file), { recursive: true });
  for (const args of [['ci', '--no-audit', '--no-fund'], ['run', 'check']]) {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: destination, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) { code = result.status ?? 1; break; }
  }
} catch (error) {
  code = 1;
  console.error(error);
} finally {
  if (code === 0) await rm(destination, { recursive: true, force: true });
  else console.error(`Clean-install check failed. Evidence preserved at ${destination}`);
}
process.exitCode = code;
