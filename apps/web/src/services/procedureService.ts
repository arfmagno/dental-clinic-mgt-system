import type { Condition } from '@clinic/shared';
import { db } from '../data/db';
import { createRow, softDeleteRow, updateRow } from '../data/repository';
import { recordedAtOf } from '../domain/format';

export interface ToothInput {
  tooth: number; // FDI
  condition: Condition;
  remarks: string;
}

export interface ProcedureInput {
  patientId: string;
  type: string;
  date: string; // YYYY-MM-DD (defaults to today in the UI, editable for past records)
  time: string; // HH:mm
  costCents: number;
  paidCents: number;
  remarks: string;
  teeth: ToothInput[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function validate(i: Pick<ProcedureInput, 'type' | 'date' | 'time' | 'costCents' | 'paidCents'>) {
  if (!i.type.trim()) throw new Error('Procedure type is required');
  if (!DATE.test(i.date)) throw new Error('A valid date is required');
  if (i.time && !TIME.test(i.time)) throw new Error('Time must look like 14:30');
  if (!Number.isFinite(i.costCents) || i.costCents < 0) throw new Error('Cost cannot be negative');
  if (!Number.isFinite(i.paidCents) || i.paidCents < 0) throw new Error('Amount paid cannot be negative');
}

/**
 * Creating a procedure ALWAYS creates the matching dental record (and its per-tooth entries) in
 * the same transaction, so a patient's chart can never drift from their procedure history.
 */
export async function createProcedure(input: ProcedureInput): Promise<string> {
  validate(input);
  const seen = new Set<number>();
  for (const t of input.teeth) {
    if (seen.has(t.tooth)) throw new Error(`Tooth ${t.tooth} listed twice`);
    seen.add(t.tooth);
  }

  return db.transaction('rw', db.patients, db.procedures, db.dental_records, db.tooth_entries, async () => {
    const patient = await db.patients.get(input.patientId);
    if (!patient || patient.isDeleted) throw new Error('A procedure needs an existing patient');

    const procedure = await createRow(db.procedures, {
      patientId: input.patientId,
      type: input.type.trim(),
      date: input.date,
      time: input.time,
      costCents: input.costCents,
      paidCents: input.paidCents,
      remarks: input.remarks.trim(),
    });
    const record = await createRow(db.dental_records, {
      patientId: input.patientId,
      procedureId: procedure.id,
      recordedAt: recordedAtOf(input.date, input.time),
      remarks: input.remarks.trim(),
    });
    for (const t of input.teeth) {
      await createRow(db.tooth_entries, {
        recordId: record.id,
        patientId: input.patientId,
        procedureId: procedure.id,
        tooth: t.tooth,
        condition: t.condition,
        remarks: t.remarks.trim(),
      });
    }
    return procedure.id;
  });
}

export type ProcedurePatch = Partial<Pick<ProcedureInput, 'type' | 'date' | 'time' | 'costCents' | 'paidCents' | 'remarks'>>;

/** Edits the procedure's own details; keeps the linked dental record's date in step. */
export async function updateProcedure(id: string, patch: ProcedurePatch): Promise<void> {
  await db.transaction('rw', db.procedures, db.dental_records, async () => {
    const current = await db.procedures.get(id);
    if (!current || current.isDeleted) throw new Error('Procedure not found');
    const next = { ...current, ...patch };
    validate(next);
    await updateRow(db.procedures, id, {
      type: next.type.trim(),
      date: next.date,
      time: next.time,
      costCents: next.costCents,
      paidCents: next.paidCents,
      remarks: next.remarks.trim(),
    });
    if (patch.date !== undefined || patch.time !== undefined) {
      const records = await db.dental_records.where('procedureId').equals(id).toArray();
      for (const r of records) if (!r.isDeleted) await updateRow(db.dental_records, r.id, { recordedAt: recordedAtOf(next.date, next.time) });
    }
  });
}

export async function addPayment(id: string, cents: number): Promise<void> {
  if (!(cents > 0)) throw new Error('Payment must be greater than zero');
  const current = await db.procedures.get(id);
  if (!current || current.isDeleted) throw new Error('Procedure not found');
  await updateProcedure(id, { paidCents: current.paidCents + cents });
}

/** Soft-deletes the procedure together with its dental record and tooth entries. */
export async function deleteProcedure(id: string): Promise<void> {
  await db.transaction('rw', db.procedures, db.dental_records, db.tooth_entries, async () => {
    await softDeleteRow(db.procedures, id);
    for (const r of await db.dental_records.where('procedureId').equals(id).toArray()) await softDeleteRow(db.dental_records, r.id);
    for (const e of await db.tooth_entries.where('procedureId').equals(id).toArray()) await softDeleteRow(db.tooth_entries, e.id);
  });
}
