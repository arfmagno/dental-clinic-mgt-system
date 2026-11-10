// Starts the API server for the e2e run: fresh database in e2e/.data, serving the built web app.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'e2e', '.data');
rmSync(dataDir, { recursive: true, force: true });

const child = spawn('npm', ['run', 'start', '-w', '@clinic/server'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: process.env.E2E_PORT ?? '3155',
    DATA_DIR: dataDir,
    CLINIC_PASSWORD: process.env.E2E_PASSWORD ?? 'e2e-password',
    AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
    WEB_DIR: path.join(root, 'services', 'web', 'dist'),
    LOG_LEVEL: 'warn',
  },
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
child.on('exit', (code) => process.exit(code ?? 0));
