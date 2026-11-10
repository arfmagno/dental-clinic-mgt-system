import { useLiveQuery } from 'dexie-react-hooks';
import type { DentalRecord, Patient, PatientContact, Procedure, ToothEntry } from '@clinic/shared';
import { db } from '../data/db';
import { summarize, type PatientSummary } from '../domain/format';

/** Live, offline-first queries. `undefined` means still loading. All hide soft-deleted rows. */

export function usePatientSummaries(): PatientSummary[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures] = await Promise.all([db.patients.toArray(), db.procedures.toArray()]);
    const live = procedures.filter((p) => !p.isDeleted);
    const byPatient = new Map<string, Procedure[]>();
    for (const p of live) byPatient.set(p.patientId, [...(byPatient.get(p.patientId) ?? []), p]);
    return patients
      .filter((p) => !p.isDeleted)
      .map((p) => summarize(p, byPatient.get(p.id) ?? []))
      .sort((a, b) => a.patient.fullName.localeCompare(b.patient.fullName));
  }, []);
}

/** patientId -> all contact values joined, for searching by phone/email/messenger. */
export function useContactIndex(): Map<string, string> | undefined {
  return useLiveQuery(async () => {
    const map = new Map<string, string>();
    for (const c of await db.patient_contacts.toArray()) {
      if (!c.isDeleted) map.set(c.patientId, `${map.get(c.patientId) ?? ''} ${c.value}`.toLowerCase());
    }
    return map;
  }, []);
}

export interface PatientBundle {
  patient: Patient;
  contacts: PatientContact[];
  procedures: Procedure[]; // newest first
  records: DentalRecord[];
  entries: ToothEntry[];
}

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
    return {
      patient,
      contacts: contacts.filter((c) => !c.isDeleted),
      procedures: procedures.filter((p) => !p.isDeleted).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
      records: records.filter((r) => !r.isDeleted),
      entries: entries.filter((e) => !e.isDeleted),
    };
  }, [id]);
}

export interface ProcedureRow {
  procedure: Procedure;
  patientName: string;
}

export function useAllProcedures(): ProcedureRow[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures] = await Promise.all([db.patients.toArray(), db.procedures.toArray()]);
    const names = new Map(patients.filter((p) => !p.isDeleted).map((p) => [p.id, p.fullName]));
    return procedures
      .filter((p) => !p.isDeleted && names.has(p.patientId))
      .map((procedure) => ({ procedure, patientName: names.get(procedure.patientId)! }));
  }, []);
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'patient' | 'procedure';
  action: 'added' | 'updated' | 'removed';
  title: string;
  patientId: string;
}

/** Recent actions, derived from row timestamps (no separate log to keep in sync). */
export function useRecentActivity(limit = 8): ActivityItem[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures] = await Promise.all([db.patients.toArray(), db.procedures.toArray()]);
    const names = new Map(patients.map((p) => [p.id, p.fullName]));
    const action = (r: { isDeleted: boolean; createdAt: string; updatedAt: string }) =>
      r.isDeleted ? 'removed' : r.updatedAt === r.createdAt ? 'added' : 'updated';
    const items: ActivityItem[] = [
      ...patients.map((p): ActivityItem => ({ id: `p${p.id}`, at: p.updatedAt, kind: 'patient', action: action(p), title: p.fullName, patientId: p.id })),
      ...procedures.map((p): ActivityItem => ({ id: `r${p.id}`, at: p.updatedAt, kind: 'procedure', action: action(p), title: `${p.type} · ${names.get(p.patientId) ?? 'Unknown patient'}`, patientId: p.patientId })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }, [limit]);
}
