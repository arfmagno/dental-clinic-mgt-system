// Desktop shell (Electron) for Windows: opens the same offline web app in its own window.
//
// - The built web app (services/web/dist) is served from app://clinic/, a private secure origin, so
//   IndexedDB, the PIN's Web Crypto and the router work exactly as in the browser, with no
//   network and no local web server.
// - app://clinic/api/* is forwarded by this process to the clinic server address staff enter on
//   the Connect page (saved in the user's app-data folder). The page therefore talks to its own
//   origin: no CORS setup on the server, and a plain http:// server on the clinic LAN works.
// - The window cannot run Node, cannot navigate away from the app, and opens web links in the
//   default browser.
import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOST, normalizeServerUrl, route, SCHEME, START_URL } from './router.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(here, '../../web/dist');
const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json');

// Automated tests run the packaged app with a throwaway profile.
if (process.env.CLINIC_USER_DATA) app.setPath('userData', path.resolve(process.env.CLINIC_USER_DATA));

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function readSettings() {
  try {
    return JSON.parse(readFileSync(SETTINGS(), 'utf8'));
  } catch {
    return {};
  }
}
function writeSettings(patch) {
  writeFileSync(SETTINGS(), JSON.stringify({ ...readSettings(), ...patch }, null, 2));
}

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const isFile = (f) => existsSync(f) && statSync(f).isFile();

async function handle(request) {
  const r = route(request.url, WEB_DIR, readSettings().serverUrl, isFile);
  if (r.kind === 'forbidden') return new Response('Not found', { status: 404 });
  if (r.kind === 'file') return net.fetch(pathToFileURL(r.file).toString());
  if (!r.target) return jsonResponse(503, { error: 'No clinic server address is set.' });
  const headers = new Headers(request.headers);
  headers.delete('origin');
  headers.delete('cookie');
  try {
    return await net.fetch(r.target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
    });
  } catch {
    return jsonResponse(502, { error: 'Cannot reach the clinic server.' });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 500,
    title: 'Dental Clinic',
    backgroundColor: '#f4f7f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  // Stay inside the app; real web links open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(START_URL)) e.preventDefault();
  });
  void win.loadURL(START_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // one window per user: the on-device database is shared
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, handle);
    ipcMain.handle('server-url:get', () => readSettings().serverUrl ?? '');
    ipcMain.handle('server-url:set', (event, value) => {
      if (new URL(event.senderFrame.url).host !== HOST) throw new Error('Not allowed');
      const serverUrl = normalizeServerUrl(value);
      writeSettings({ serverUrl });
      return serverUrl;
    });
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });

  app.on('window-all-closed', () => app.quit());
}
