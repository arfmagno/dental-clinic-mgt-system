import { db } from '../data/db';

/**
 * The public demo build (`npm run build:demo`): the same app with no server, filled with sample
 * data on first visit. Everything stays in the visitor's browser; *Reset demo* starts over.
 * The flag is fixed at build time, so the normal build drops the demo code entirely.
 */
export const isDemo = import.meta.env.VITE_DEMO === 'true';

const SEEDED = 'demo.seededAt';

/** First visit only: puts the sample clinic (60 patients, visits, payments, activity) on the device. */
export async function seedDemo() {
  if (await db.meta.get(SEEDED)) return;
  const { buildDemoData, SYNC_TABLES } = await import('@clinic/shared');
  const now = new Date().toISOString();
  const data = buildDemoData({ now });
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.meta], async () => {
    // dirty 0: there is no server to sync to, so nothing should look "waiting to sync"
    for (const t of SYNC_TABLES) await db.table(t).bulkPut(data[t].map((row) => ({ ...row, dirty: 0 })));
    await db.meta.put({ key: SEEDED, value: now });
  });
  try {
    localStorage.setItem('clinic.feature.reports', '1'); // show off the optional reports
  } catch {
    /* storage unavailable */
  }
}

/** Wipes everything this demo stored in the browser and starts again from the sample data. */
export async function resetDemo() {
  db.close();
  await db.delete();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
  location.reload();
}
