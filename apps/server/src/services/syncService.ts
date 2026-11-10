import {
  BASE_COLUMNS,
  SYNC_TABLES,
  TABLE_COLUMNS,
  type AnyRow,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncTable,
} from '@clinic/shared';
import type { SqlDriver } from '../infra/db/driver.js';
import { SyncRepository } from '../repositories/syncRepository.js';

/** A device clock further ahead than this is clamped, so one bad clock cannot win every conflict. */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_PULL_LIMIT = 1000;

export class ValidationError extends Error {}

/**
 * Sync rules: validation, last-write-wins conflict resolution, and change feed paging.
 * Knows nothing about HTTP; depends on the repository and the driver port only.
 */
export class SyncService {
  constructor(
    private db: SqlDriver,
    private now: () => Date = () => new Date(),
  ) {}

  async push(req: PushRequest): Promise<PushResponse> {
    const res: PushResponse = { accepted: {}, stale: {}, rejected: [] };
    // Parents before children so foreign keys hold within a single push.
    for (const table of SYNC_TABLES) {
      const rows = req.changes?.[table] ?? [];
      for (const raw of rows) {
        const id = typeof raw?.id === 'string' ? raw.id : '?';
        try {
          const row = this.validate(table, raw);
          const applied = await this.db.transaction(async (tx) => {
            const repo = new SyncRepository(tx);
            return repo.upsertIfNewer(table, row, await repo.nextSeq());
          });
          (applied ? (res.accepted[table] ??= []) : (res.stale[table] ??= [])).push(row.id);
        } catch (err) {
          res.rejected.push({ table, id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return res;
  }

  async pull(since: number, limit = 500): Promise<PullResponse> {
    const n = Math.max(1, Math.min(limit, MAX_PULL_LIMIT));
    const repo = new SyncRepository(this.db);
    // Every table's first n changes past the cursor contain the global first n.
    const all: { table: SyncTable; row: AnyRow; seq: number }[] = [];
    for (const table of SYNC_TABLES) {
      for (const r of await repo.changedSince(table, since, n + 1)) all.push({ table, ...r });
    }
    all.sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, n);
    return {
      rows: page.map(({ table, row }) => ({ table, row })),
      cursor: page.length ? page[page.length - 1].seq : since,
      hasMore: all.length > n,
    };
  }

  private validate(table: SyncTable, raw: AnyRow): AnyRow {
    if (!raw || typeof raw !== 'object') throw new ValidationError('row must be an object');
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) throw new ValidationError('invalid id');
    for (const k of ['createdAt', 'updatedAt'] as const) {
      if (typeof raw[k] !== 'string' || Number.isNaN(Date.parse(raw[k]))) throw new ValidationError(`invalid ${k}`);
    }
    if (typeof raw.isDeleted !== 'boolean') throw new ValidationError('isDeleted must be boolean');

    const allowed = new Set<string>([...BASE_COLUMNS, ...TABLE_COLUMNS[table]]);
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) if (allowed.has(k) && v !== undefined) row[k] = v; // unknown keys dropped

    const ceiling = this.now().getTime() + MAX_CLOCK_SKEW_MS;
    if (Date.parse(raw.updatedAt) > ceiling) row.updatedAt = new Date(ceiling).toISOString();
    return row as AnyRow;
  }
}
