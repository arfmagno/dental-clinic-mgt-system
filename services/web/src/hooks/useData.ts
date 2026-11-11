import { useLiveQuery } from 'dexie-react-hooks';
import {
  formatName,
  nameSortKey,
  paidByProcedure,
  type AuditEntity,
  type DentalRecord,
  type Patient,
  type PatientContact,
  type Payment,
  type Procedure,
  type ToothEntry,
} from '@clinic/shared';
import { PATIENT_ACTOR } from '../data/actor';
import { db } from '../data/db';
import { formatAddress, summarize, type PatientSummary } from '../domain/format';
import { buildReport, type Period, type Report } from '../domain/reports';
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
  kind: 'patient' | 'procedure' | 'payment' | 'chart' | 'staff';
  action: 'added' | 'updated' | 'removed';
  title: string;
  /** '' for staff-account changes. */
  patientId: string;
  /** Who did it: a staff name, "Patient (self-registration)", or '' when not recorded (older data). */
  by: string;
}

const KIND_OF: Record<AuditEntity, ActivityItem['kind']> = { patients: 'patient', procedures: 'procedure', payments: 'payment', dental_records: 'chart', staff: 'staff' };

/**
 * Every action, newest first, from the audit trail (who did what, written with each change).
 * Rows from before the trail existed have no entries; their latest change is shown from the row's
 * own timestamps, without a "by".
 */
export function useActivity(): ActivityItem[] | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures, payments, records, staff, audit] = await Promise.all([
      db.patients.toArray(),
      db.procedures.toArray(),
      db.payments.toArray(),
      db.dental_records.toArray(),
      db.staff.toArray(),
      db.audit_log.toArray(),
    ]);
    const names = new Map(patients.map((p) => [p.id, formatName(p)]));
    const procs = new Map(procedures.map((p) => [p.id, p]));
    const pays = new Map(payments.map((p) => [p.id, p]));
    const recs = new Map(records.map((r) => [r.id, r]));
    const staffNames = new Map(staff.map((s) => [s.id, s.name]));
    const patientName = (id: string) => names.get(id) ?? 'Unknown patient';
    const byName = (actor: string) => (actor === PATIENT_ACTOR ? 'Patient (self-registration)' : (staffNames.get(actor) ?? 'Unknown'));

    const title = (kind: ActivityItem['kind'], entityId: string, patientId: string): string | null => {
      switch (kind) {
        case 'patient':
          return patientName(entityId);
        case 'procedure':
          return `${procs.get(entityId)?.type ?? 'Procedure'} · ${patientName(patientId)}`;
        case 'payment': {
          const proc = procs.get(pays.get(entityId)?.procedureId ?? '');
          return `${proc?.type ?? 'Payment'} · ${patientName(patientId)}`;
        }
        case 'chart':
          // a procedure's own chart record is covered by the procedure entry
          return recs.get(entityId)?.procedureId ? null : `Chart update · ${patientName(patientId)}`;
        case 'staff':
          return `Staff account · ${staffNames.get(entityId) ?? 'Unknown'}`;
      }
    };

    const items: ActivityItem[] = [];
    const audited = new Set<string>();
    for (const e of audit) {
      if (e.isDeleted) continue;
      audited.add(e.entityId);
      const kind = KIND_OF[e.entity];
      const t = title(kind, e.entityId, e.patientId);
      if (t !== null) items.push({ id: `a${e.id}`, at: e.createdAt, kind, action: e.action, title: t, patientId: e.patientId, by: byName(e.actor) });
    }

    // Older rows without audit entries: show their latest change.
    const action = (r: { isDeleted: boolean; createdAt: string; updatedAt: string }) =>
      r.isDeleted ? 'removed' : r.updatedAt === r.createdAt ? 'added' : 'updated';
    const legacy = (id: string, at: string, kind: ActivityItem['kind'], act: ActivityItem['action'], patientId: string) => {
      if (audited.has(id)) return;
      const t = title(kind, id, patientId);
      if (t !== null) items.push({ id: `l${id}`, at, kind, action: act, title: t, patientId, by: '' });
    };
    for (const p of patients) legacy(p.id, p.updatedAt, 'patient', action(p), p.id);
    for (const p of procedures) legacy(p.id, p.updatedAt, 'procedure', action(p), p.patientId);
    for (const p of payments) {
      const proc = procs.get(p.procedureId);
      if (proc) legacy(p.id, p.updatedAt, 'payment', action(p), proc.patientId);
    }
    for (const r of records) legacy(r.id, r.updatedAt, 'chart', action(r), r.patientId);

    return items.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  }, []);
}

/** Clinic report for a period, recomputed live as records change. */
export function useReport(period: Period): Report | undefined {
  return useLiveQuery(async () => {
    const [patients, procedures, payments] = await Promise.all([db.patients.toArray(), db.procedures.toArray(), db.payments.toArray()]);
    return buildReport({ patients, procedures, payments }, period);
  }, [period]);
}
