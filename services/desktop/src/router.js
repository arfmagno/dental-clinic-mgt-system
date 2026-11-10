// Pure request routing for the desktop shell (no Electron imports, so it is unit-testable).
import path from 'node:path';

export const SCHEME = 'app';
export const HOST = 'clinic';
export const START_URL = `${SCHEME}://${HOST}/`;

/**
 * Checks and normalises the clinic server address staff type in ("192.168.1.10:3001",
 * "https://clinic.example.com/"). Returns the origin, or throws with a readable message.
 */
export function normalizeServerUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) throw new Error('Enter the clinic server address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('That does not look like a server address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('The address must start with http:// or https://');
  if (url.username || url.password) throw new Error('Do not put a password in the address.');
  return url.origin;
}

/**
 * Decides what an app:// request is:
 *  - { kind: 'api', target }   proxied to the clinic server (null target = no server set yet)
 *  - { kind: 'file', file }    a file of the built web app (unknown paths → index.html, for the router)
 *  - { kind: 'forbidden' }     anything trying to escape the web folder
 */
export function route(requestUrl, webDir, serverUrl, exists) {
  const url = new URL(requestUrl);
  if (url.protocol !== `${SCHEME}:` || url.host !== HOST) return { kind: 'forbidden' };
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return { kind: 'api', target: serverUrl ? `${serverUrl}${url.pathname}${url.search}` : null };
  }
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return { kind: 'forbidden' };
  }
  const root = path.resolve(webDir);
  const file = path.resolve(root, `.${rel}`);
  if (file !== root && !file.startsWith(root + path.sep)) return { kind: 'forbidden' };
  if (rel !== '/' && exists(file)) return { kind: 'file', file };
  return { kind: 'file', file: path.join(root, 'index.html') };
}
