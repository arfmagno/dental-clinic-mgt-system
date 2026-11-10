import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { normalizeServerUrl, route } from './router.js';

const WEB = path.resolve('/srv/web');
const has = (...files) => (f) => files.map((x) => path.join(WEB, x)).includes(f);

test('server address: scheme added, path dropped, bad input refused', () => {
  assert.equal(normalizeServerUrl('192.168.1.10:3001'), 'http://192.168.1.10:3001');
  assert.equal(normalizeServerUrl(' https://clinic.example.com/app/ '), 'https://clinic.example.com');
  assert.throws(() => normalizeServerUrl(''), /Enter/);
  assert.throws(() => normalizeServerUrl('ftp://x'), /http/);
  assert.throws(() => normalizeServerUrl('file:///C:/x'), /http/);
  assert.throws(() => normalizeServerUrl('http://user:pw@host'), /password/);
});

test('api requests go to the configured server, with the query string', () => {
  assert.deepEqual(route('app://clinic/api/v1/sync/pull?since=5', WEB, 'http://10.0.0.2:3001', has()), { kind: 'api', target: 'http://10.0.0.2:3001/api/v1/sync/pull?since=5' });
  assert.deepEqual(route('app://clinic/api/v1/healthz', WEB, undefined, has()), { kind: 'api', target: null });
});

test('static files are served; app routes fall back to index.html', () => {
  assert.deepEqual(route('app://clinic/assets/index-abc.js', WEB, '', has('assets/index-abc.js')), { kind: 'file', file: path.join(WEB, 'assets/index-abc.js') });
  assert.deepEqual(route('app://clinic/patients/123', WEB, '', has()), { kind: 'file', file: path.join(WEB, 'index.html') });
  assert.deepEqual(route('app://clinic/', WEB, '', has('index.html')), { kind: 'file', file: path.join(WEB, 'index.html') });
});

test('nothing outside the web folder or another host is served', () => {
  assert.deepEqual(route('app://clinic/..%2F..%2Fwindows%2Fwin.ini', WEB, '', () => true), { kind: 'forbidden' });
  assert.deepEqual(route('app://clinic/%E0%A4%A', WEB, '', () => true), { kind: 'forbidden' });
  assert.deepEqual(route('app://evil/index.html', WEB, '', () => true), { kind: 'forbidden' });
});
