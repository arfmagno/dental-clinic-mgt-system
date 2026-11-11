// Sync engine and server session against a small in-memory fake of the clinic server (fetch is stubbed).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SYNC_TABLES, type AnyRow, type PushRequest } from '@clinic/shared';
import { setActor } from '../data/actor';
import { db } from '../data/db';
import { ApiError, api } from './api';
import { emptyPatient, savePatient } from './patientService';
import { connectToServer, disconnectFromServer, getStaffToken, getToken, signInStaffOnline, syncToken } from './session';
import { pendingCount, syncOnce } from './syncEngine';

interface FakeServer {
  rows: Map<string, { table: string; row: AnyRow; seq: number }>;
  seq: number;
  pushes: number;
  /** Rows the server refuses, by id → reason. */
  refuse: Map<string, string>;
  /** Called during a push, before the response: simulates edits made while the request is in flight. */
  duringPush?: () => Promise<void>;
}

let server: FakeServer;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Last-write-wins like the real server; pull pages through every table by sequence number. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), 'http://clinic.test');
  const path = url.pathname.replace('/api/v1', '');
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const auth = new Headers(init?.headers).get('authorization');
  if (path === '/auth/login') return body.password === 'pw' ? json(200, { token: 'device-token' }) : json(401, { error: 'Invalid credentials' });
  if (!auth) return json(401, { error: 'unauthorized' });
  if (path === '/auth/staff') return body.pin === '1234' ? json(200, { token: `staff-token-${body.staffId}` }) : json(401, { error: 'Invalid credentials' });
  if (path === '/sync/push') {
    server.pushes++;
    await server.duringPush?.();
    const res = { accepted: {} as Record<string, string[]>, stale: {} as Record<string, string[]>, rejected: [] as { table: string; id: string; error: string }[] };
    for (const [table, rows] of Object.entries((body as PushRequest).changes)) {
      for (const row of rows as AnyRow[]) {
        const reason = server.refuse.get(row.id);
        if (reason) {
          res.rejected.push({ table, id: row.id, error: reason });
          continue;
        }
        const have = server.rows.get(row.id);
        if (have && have.row.updatedAt > row.updatedAt) (res.stale[table] ??= []).push(row.id);
        else {
          server.rows.set(row.id, { table, row, seq: ++server.seq });
          (res.accepted[table] ??= []).push(row.id);
        }
      }
    }
    return json(200, res);
  }
  if (path === '/sync/pull') {
    const since = Number(url.searchParams.get('since'));
    const limit = Number(url.searchParams.get('limit'));
    const all = [...server.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, limit);
    return json(200, { rows: page.map(({ table, row }) => ({ table, row })), cursor: page.at(-1)?.seq ?? since, hasMore: all.length > limit });
  }
  return json(404, { error: 'not found' });
}

/** A row as another device would have pushed it. */
function remote(table: string, row: AnyRow) {
  server.rows.set(row.id, { table, row, seq: ++server.seq });
}

beforeEach(async () => {
  await Promise.all([...SYNC_TABLES.map((t) => db.table(t).clear()), db.meta.clear()]);
  setActor('tester');
  localStorage.clear();
  sessionStorage.clear();
  server = { rows: new Map(), seq: 0, pushes: 0, refuse: new Map() };
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});
afterEach(() => vi.unstubAllGlobals());

const juan = (firstName = 'Juan') => ({ ...emptyPatient(), firstName, lastName: 'Dela Cruz', birthDate: '1990-05-01' });

describe('sync engine', () => {
  test('pushes local changes, then they are no longer pending; the server has them', async () => {
    const id = await savePatient(undefined, juan(), []);
    expect(await pendingCount()).toBe(2); // the patient and its audit entry
    const out = await syncOnce('device-token');
    expect(out).toMatchObject({ pushed: 2, rejected: 0, problems: [] });
    expect(await pendingCount()).toBe(0);
    expect(server.rows.get(id)?.row).toMatchObject({ firstName: 'Juan', isDeleted: false });
    expect(server.rows.get(id)?.row).not.toHaveProperty('dirty'); // device bookkeeping stays local
  });

  test('a row edited while its push is in flight stays pending and goes out next time', async () => {
    const id = await savePatient(undefined, juan(), []);
    server.duringPush = async () => {
      server.duringPush = undefined;
      await savePatient(id, juan('Juanito'), []);
    };
    await syncOnce('device-token');
    expect((await db.patients.get(id))?.dirty).toBe(1);
    await syncOnce('device-token');
    expect(server.rows.get(id)?.row.firstName).toBe('Juanito');
    expect(await pendingCount()).toBe(0);
  });

  test('rows the server refuses stay pending, with the reason reported once', async () => {
    const a = await savePatient(undefined, juan('Ana'), []);
    const b = await savePatient(undefined, juan('Ben'), []);
    server.refuse.set(a, 'Not allowed').set(b, 'Not allowed');
    const out = await syncOnce('device-token');
    expect(out).toMatchObject({ rejected: 2, problems: ['Not allowed'] });
    expect((await db.patients.get(a))?.dirty).toBe(1);
  });

  test('pull: newer remote rows win, older ones do not; pages continue from the saved cursor', async () => {
    const mine = await savePatient(undefined, juan('Mine'), []);
    await syncOnce('device-token');
    const local = (await db.patients.get(mine))!;
    remote('patients', { ...local, firstName: 'Older', updatedAt: '2000-01-01T00:00:00.000Z' } as AnyRow);
    for (let i = 0; i < 520; i++) remote('patients', { ...local, id: `other-${i}`, firstName: `Other ${i}`, updatedAt: '2026-01-01T00:00:00.000Z' } as AnyRow);

    const out = await syncOnce('device-token');
    expect(out.pulled).toBe(520); // two pages (limit 500); the older copy of "Mine" is ignored
    expect((await db.patients.get(mine))?.firstName).toBe('Mine');
    expect((await db.patients.get('other-519'))).toMatchObject({ firstName: 'Other 519', dirty: 0 });

    remote('patients', { ...local, firstName: 'Changed elsewhere', updatedAt: '2999-01-01T00:00:00.000Z' } as AnyRow);
    expect((await syncOnce('device-token')).pulled).toBe(1); // only what is new since the cursor
    expect((await db.patients.get(mine))?.firstName).toBe('Changed elsewhere');
  });
});

describe('server session', () => {
  test('api(): network failures and server errors become ApiError with a status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(api('/sync/pull')).rejects.toMatchObject({ status: 0 });
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    const err = await api('/auth/login', { method: 'POST', body: { password: 'nope' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, message: 'Invalid credentials' });
  });

  test('device token, then a staff token for the signed-in person; sync prefers the staff token', async () => {
    expect(await signInStaffOnline('s1', '1234')).toBe(false); // not connected yet
    await connectToServer('pw');
    expect(getToken()).toBe('device-token');
    expect(syncToken()).toBe('device-token');
    expect(await signInStaffOnline('s1', '9999')).toBe(false);
    expect(getStaffToken()).toBeNull();
    expect(await signInStaffOnline('s1', '1234')).toBe(true);
    expect(syncToken()).toBe('staff-token-s1');
    disconnectFromServer();
    expect([getToken(), getStaffToken(), syncToken()]).toEqual([null, null, null]);
  });
});
