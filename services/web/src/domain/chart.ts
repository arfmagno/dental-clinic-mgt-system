import type { Condition, DentalRecord, ToothEntry } from '@clinic/shared';

export interface ToothState {
  condition: Condition;
  remarks: string;
  recordedAt: string;
  recordId: string;
  procedureId: string | null;
}

/** Chronological order of dental records: by recorded date/time, then by creation. */
export function sortRecordsAsc(records: DentalRecord[]): DentalRecord[] {
  return [...records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Builds the tooth chart by replaying records oldest -> newest; later records override earlier
 * ones per tooth. Pass `uptoRecordId` to see the chart as it was right after that record.
 * Teeth never mentioned in any record are simply absent (treated as healthy by the UI).
 */
export function buildChart(records: DentalRecord[], entries: ToothEntry[], uptoRecordId?: string): Map<number, ToothState> {
  const byRecord = new Map<string, ToothEntry[]>();
  for (const e of entries) {
    if (e.isDeleted) continue;
    const list = byRecord.get(e.recordId);
    if (list) list.push(e);
    else byRecord.set(e.recordId, [e]);
  }
  const chart = new Map<number, ToothState>();
  for (const rec of sortRecordsAsc(records.filter((r) => !r.isDeleted))) {
    for (const e of byRecord.get(rec.id) ?? []) {
      chart.set(e.tooth, { condition: e.condition, remarks: e.remarks, recordedAt: rec.recordedAt, recordId: rec.id, procedureId: e.procedureId });
    }
    if (rec.id === uptoRecordId) break;
  }
  return chart;
}
