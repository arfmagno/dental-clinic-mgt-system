import { useLiveQuery } from 'dexie-react-hooks';
import {
  formatName,
  nameSortKey,
  paidByProcedure,
  type DentalRecord,
  type Patient,
  type PatientContact,
  type Payment,
  type Procedure,
  type ToothEntry,
} from '@clinic/shared';
import { db } from '../data/db';
import { formatAddress, summarize, type PatientSummary } from '../domain/format';
import { contactSearchText } from '../domain/search';

/** Live, offline-first queries. `undefined` means still loading. All hide soft-deleted rows. */

/** Every active patient with derived name, last visit and balance, sorted by last name. */
export function usePatientSummaries(): PatientSummary[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures, payments] = await Promise.all([db.patients.toArray(), db.procedures.toArray(), db.payments.toArray()]);
    const paid = paidByProcedure(payments);
    const byPatient = new Map<string, Procedure[]>();
    for (const p of procedures) if (!p.isDeleted) byPatient.set(p.patientId, [...(byPatient.get(p.patientId) ?? []), p]);
    return patients
      .filter((p) => !p.isDeleted)
      .sort((a, b) => nameSortKey(a).localeCompare(nameSortKey(b)))
      .map((p) => summarize(p, byPatient.get(p.id) ?? [], paid));
  }, []);
}

/** patientId -> searchable text from contacts and the address. */
export function useSearchIndex(): Map<string, string> | undefined {
  return useLiveQuery(async () => {
    const map = new Map<string, string>();
    const add = (id: string, text: string) => map.set(id, `${map.get(id) ?? ''} ${text}`);
    for (const c of await db.patient_contacts.toArray()) if (!c.isDeleted) add(c.patientId, contactSearchText(c));
    for (const p of await db.patients.toArray()) if (!p.isDeleted) add(p.id, formatAddress(p));
    return map;
  }, []);
}

export interface PatientBundle {
  patient: Patient;
  contacts: PatientContact[]; // primary first
  procedures: Procedure[]; // newest first
  payments: Payment[]; // oldest first
  paid: Map<string, number>; // procedureId -> total paid
  records: DentalRecord[];
  entries: ToothEntry[];
}

const primaryFirst = <T extends { isPrimary: boolean }>(a: T, b: T) => Number(b.isPrimary) - Number(a.isPrimary);

/** `null` = no such (or deleted) patient. */
export function usePatientBundle(id: string | undefined): PatientBundle | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const patient = await db.patients.get(id);
    if (!patient || patient.isDeleted) return null;
    const [contacts, procedures, records, entries] = await Promise.all([
      db.patient_contacts.where('patientId').equals(id).toArray(),
      db.procedures.where('patientId').equals(id).toArray(),
      db.dental_records.where('patientId').equals(id).toArray(),
      db.tooth_entries.where('patientId').equals(id).toArray(),
    ]);
    const live = procedures.filter((p) => !p.isDeleted);
    const payments = (await db.payments.where('procedureId').anyOf(live.map((p) => p.id)).toArray())
      .filter((p) => !p.isDeleted)
      .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
    return {
      patient,
      contacts: contacts.filter((c) => !c.isDeleted).sort(primaryFirst),
      procedures: live.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
      payments,
      paid: paidByProcedure(payments),
      records: records.filter((r) => !r.isDeleted),
      entries: entries.filter((e) => !e.isDeleted),
    };
  }, [id]);
}

export interface ProcedureRow {
  procedure: Procedure;
  patientName: string;
  patientSortKey: string;
  paidCents: number;
}

export function useAllProcedures(): ProcedureRow[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures, payments] = await Promise.all([db.patients.toArray(), db.procedures.toArray(), db.payments.toArray()]);
    const live = new Map(patients.filter((p) => !p.isDeleted).map((p) => [p.id, p]));
    const paid = paidByProcedure(payments);
    return procedures
      .filter((p) => !p.isDeleted && live.has(p.patientId))
      .map((procedure) => {
        const patient = live.get(procedure.patientId)!;
        return { procedure, patientName: formatName(patient), patientSortKey: nameSortKey(patient), paidCents: paid.get(procedure.id) ?? 0 };
      });
  }, []);
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'patient' | 'procedure' | 'payment';
  action: 'added' | 'updated' | 'removed';
  title: string;
  patientId: string;
}

/** Recent actions, derived from row timestamps (no separate log to keep in sync). */
export function useRecentActivity(limit = 8): ActivityItem[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures, payments] = await Promise.all([db.patients.toArray(), db.procedures.toArray(), db.payments.toArray()]);
    const names = new Map(patients.map((p) => [p.id, formatName(p)]));
    const procs = new Map(procedures.map((p) => [p.id, p]));
    const action = (r: { isDeleted: boolean; createdAt: string; updatedAt: string }) =>
      r.isDeleted ? 'removed' : r.updatedAt === r.createdAt ? 'added' : 'updated';
    const items: ActivityItem[] = [
      ...patients.map((p): ActivityItem => ({ id: `p${p.id}`, at: p.updatedAt, kind: 'patient', action: action(p), title: formatName(p), patientId: p.id })),
      ...procedures.map((p): ActivityItem => ({ id: `r${p.id}`, at: p.updatedAt, kind: 'procedure', action: action(p), title: `${p.type} · ${names.get(p.patientId) ?? 'Unknown patient'}`, patientId: p.patientId })),
      ...payments.flatMap((p): ActivityItem[] => {
        const proc = procs.get(p.procedureId);
        return proc ? [{ id: `y${p.id}`, at: p.updatedAt, kind: 'payment', action: action(p), title: `${proc.type} · ${names.get(proc.patientId) ?? 'Unknown patient'}`, patientId: proc.patientId }] : [];
      }),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }, [limit]);
}
