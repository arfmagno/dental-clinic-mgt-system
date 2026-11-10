import { PAYMENT_METHODS, isValidTooth, type Condition, type PaymentMethod } from '@clinic/shared';
import { db } from '../data/db';
import { createRow, softDeleteRow, updateRow } from '../data/repository';
import { recordedAtOf } from '../domain/format';

export interface ToothInput {
  tooth: number; // FDI
  condition: Condition;
  remarks: string;
}

export interface PaymentInput {
  amountCents: number;
  method: PaymentMethod;
  paidAt: string; // local YYYY-MM-DDTHH:mm
  remarks: string;
}

export interface ProcedureInput {
  patientId: string;
  type: string;
  date: string; // YYYY-MM-DD (defaults to today in the UI, editable for past records)
  time: string; // HH:mm
  costCents: number;
  remarks: string;
  teeth: ToothInput[];
  /** Optional amount received when the procedure is recorded. */
  payment?: Omit<PaymentInput, 'paidAt'> | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function validateProcedure(i: Pick<ProcedureInput, 'type' | 'date' | 'time' | 'costCents'>) {
  if (!i.type.trim()) throw new Error('Procedure type is required');
  if (!DATE.test(i.date)) throw new Error('A valid date is required');
  if (i.time && !TIME.test(i.time)) throw new Error('Time must look like 14:30');
  if (!Number.isInteger(i.costCents) || i.costCents < 0) throw new Error('Cost cannot be negative');
}

function validatePayment(p: PaymentInput) {
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) throw new Error('Payment must be greater than zero');
  if (!PAYMENT_METHODS.includes(p.method)) throw new Error('Choose a payment method');
  if (!DATETIME.test(p.paidAt)) throw new Error('A valid payment date is required');
}

/**
 * Creating a procedure ALWAYS creates the matching dental record (and its per-tooth entries) in
 * the same transaction, so a patient's chart can never drift from their procedure history.
 */
export async function createProcedure(input: ProcedureInput): Promise<string> {
  validateProcedure(input);
  const seen = new Set<number>();
  for (const t of input.teeth) {
    if (!isValidTooth(t.tooth)) throw new Error(`Tooth ${t.tooth} is not a valid FDI tooth`);
    if (seen.has(t.tooth)) throw new Error(`Tooth ${t.tooth} listed twice`);
    seen.add(t.tooth);
  }
  const at = recordedAtOf(input.date, input.time);
  const payment = input.payment && input.payment.amountCents > 0 ? { ...input.payment, paidAt: at } : null;
  if (payment) validatePayment(payment);

  return db.transaction('rw', [db.patients, db.procedures, db.payments, db.dental_records, db.tooth_entries], async () => {
    const patient = await db.patients.get(input.patientId);
    if (!patient || patient.isDeleted) throw new Error('A procedure needs an existing patient');

    const procedure = await createRow(db.procedures, {
      patientId: input.patientId,
      type: input.type.trim(),
      date: input.date,
      time: input.time,
      costCents: input.costCents,
      remarks: input.remarks.trim(),
    });
    if (payment) await createRow(db.payments, { procedureId: procedure.id, ...payment, remarks: payment.remarks.trim() });
    const record = await createRow(db.dental_records, {
      patientId: input.patientId,
      procedureId: procedure.id,
      recordedAt: at,
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

export type ProcedurePatch = Partial<Pick<ProcedureInput, 'type' | 'date' | 'time' | 'costCents' | 'remarks'>>;

/** Edits the procedure's own details; keeps the linked dental record's date in step. */
export async function updateProcedure(id: string, patch: ProcedurePatch): Promise<void> {
  await db.transaction('rw', db.procedures, db.dental_records, async () => {
    const current = await db.procedures.get(id);
    if (!current || current.isDeleted) throw new Error('Procedure not found');
    const next = { ...current, ...patch };
    validateProcedure(next);
    await updateRow(db.procedures, id, { type: next.type.trim(), date: next.date, time: next.time, costCents: next.costCents, remarks: next.remarks.trim() });
    if (patch.date !== undefined || patch.time !== undefined) {
      for (const r of await db.dental_records.where('procedureId').equals(id).toArray()) {
        if (!r.isDeleted) await updateRow(db.dental_records, r.id, { recordedAt: recordedAtOf(next.date, next.time) });
      }
    }
  });
}

export async function addPayment(procedureId: string, input: PaymentInput): Promise<void> {
  validatePayment(input);
  await db.transaction('rw', db.procedures, db.payments, async () => {
    const procedure = await db.procedures.get(procedureId);
    if (!procedure || procedure.isDeleted) throw new Error('Procedure not found');
    await createRow(db.payments, { procedureId, ...input, remarks: input.remarks.trim() });
  });
}

export async function deletePayment(id: string): Promise<void> {
  await softDeleteRow(db.payments, id);
}

/** Soft-deletes the procedure together with its payments, dental record and tooth entries. */
export async function deleteProcedure(id: string): Promise<void> {
  await db.transaction('rw', [db.procedures, db.payments, db.dental_records, db.tooth_entries], async () => {
    await softDeleteRow(db.procedures, id);
    for (const p of await db.payments.where('procedureId').equals(id).toArray()) await softDeleteRow(db.payments, p.id);
    for (const r of await db.dental_records.where('procedureId').equals(id).toArray()) await softDeleteRow(db.dental_records, r.id);
    for (const e of await db.tooth_entries.where('procedureId').equals(id).toArray()) await softDeleteRow(db.tooth_entries, e.id);
  });
}
