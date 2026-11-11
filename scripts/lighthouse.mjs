// npm run lighthouse — audits the production build as it is hosted (real server, fresh database).
// Builds nothing: run `npm run build` first. Uses Chrome, or Edge/Chromium via CHROME_PATH.
// Writes lighthouse/report.report.html (+ .json) and fails if a score drops below its floor.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.LH_PORT ?? '3158';
const URL = `http://127.0.0.1:${PORT}/`;
const FLOORS = { performance: 90, accessibility: 100, 'best-practices': 100, seo: 90 };
const dataDir = mkdtempSync(path.join(tmpdir(), 'clinic-lh-'));

const server = spawn('npm', ['run', 'start', '-w', '@clinic/server'], {
  cwd: root,
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT,
    DATA_DIR: dataDir,
    CLINIC_PASSWORD: 'lighthouse-only',
    AUTH_SECRET: 'lighthouse-secret-lighthouse-secret',
    WEB_DIR: path.join(root, 'services', 'web', 'dist'),
    LOG_LEVEL: 'warn',
  },
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${URL}api/v1/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

let failed = false;
try {
  await waitForServer();
  const res = spawnSync(
    'npx',
    ['-y', 'lighthouse@12', URL, '--quiet', '--chrome-flags=--headless=new', '--output=json', '--output=html', '--output-path=lighthouse/report', '--only-categories=performance,accessibility,best-practices,seo'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (res.status !== 0) throw new Error('lighthouse failed to run');
  const report = JSON.parse(readFileSync(path.join(root, 'lighthouse', 'report.report.json'), 'utf8'));
  for (const [id, floor] of Object.entries(FLOORS)) {
    const score = Math.round(report.categories[id].score * 100);
    const ok = score >= floor;
    failed ||= !ok;
    console.log(`${ok ? '✓' : '✗'} ${id.padEnd(15)} ${score} (floor ${floor})`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  failed = true;
} finally {
  server.kill();
  if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); // Windows: the server may still hold the db
  } catch {
    console.warn(`(could not remove ${dataDir})`);
  }
}
process.exit(failed ? 1 : 0);
