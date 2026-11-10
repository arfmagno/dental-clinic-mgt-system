import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONDITION_LABEL, balanceCents, toCents, type Dentition, type Procedure } from '@clinic/shared';
import { ConditionLegend, Odontogram } from '../components/Odontogram';
import { Modal } from '../components/Modal';
import { PatientForm } from '../components/PatientForm';
import { ProcedureForm } from '../components/ProcedureForm';
import { buildChart, type ToothState } from '../domain/chart';
import { ageOf, formatDate, formatMoney, formatTime } from '../domain/format';
import { usePatientBundle } from '../hooks/useData';
import { deletePatient, savePatient, type ContactInput, type PatientFields } from '../services/patientService';
import { addPayment, deleteProcedure, updateProcedure } from '../services/procedureService';

export function PatientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const bundle = usePatientBundle(id);
  const [modal, setModal] = useState<'edit' | 'procedure' | 'delete' | null>(null);
  const [editing, setEditing] = useState<Procedure | null>(null);
  const [asOf, setAsOf] = useState<string | undefined>();
  const [dentition, setDentition] = useState<Dentition>('permanent');
  const [exporting, setExporting] = useState(false);

  const chart = useMemo(() => (bundle ? buildChart(bundle.records, bundle.entries, asOf) : new Map<number, ToothState>()), [bundle, asOf]);

  if (bundle === undefined) return <p className="muted">Loading…</p>;
  if (bundle === null)
    return (
      <div className="card stack">
        <p>This patient could not be found.</p>
        <Link to="/patients" className="btn">Back to patients</Link>
      </div>
    );

  const { patient, contacts, procedures, records, entries } = bundle;
  const age = ageOf(patient.birthDate);
  const balance = procedures.reduce((s, p) => s + balanceCents(p), 0);
  const lastVisit = procedures[0]?.date ?? '';
  const teethOf = (procedureId: string) =>
    entries.filter((e) => e.procedureId === procedureId).sort((a, b) => a.tooth - b.tooth);
  const recordOf = (procedureId: string) => records.find((r) => r.procedureId === procedureId);

  const toFields = (): PatientFields => {
    const { id: _i, createdAt: _c, updatedAt: _u, isDeleted: _d, ...fields } = patient;
    return fields;
  };
  const toContacts = (): ContactInput[] => contacts.map((c) => ({ id: c.id, type: c.type, value: c.value, label: c.label, isPrimary: c.isPrimary }));

  async function exportPdf() {
    setExporting(true);
    try {
      const { exportPatientPdf } = await import('../services/pdfService'); // loaded on demand to keep startup light
      await exportPatientPdf(bundle!, import.meta.env.VITE_CLINIC_NAME ?? 'Dental Clinic');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <Link to="/patients" className="muted">← Patients</Link>
        <div className="row wrap">
          <button className="btn primary" onClick={() => setModal('procedure')}>+ Add procedure</button>
          <button className="btn" onClick={() => setModal('edit')}>Edit</button>
          <button className="btn" onClick={exportPdf} disabled={exporting}>{exporting ? 'Preparing…' : 'Export PDF'}</button>
          <button className="btn danger" onClick={() => setModal('delete')}>Delete</button>
        </div>
      </div>

      <section className="card profile">
        <div className="avatar xl">{patient.photo ? <img src={patient.photo} alt={patient.fullName} /> : <span aria-hidden>👤</span>}</div>
        <div className="grow stack tight">
          <h1>{patient.fullName}</h1>
          <dl className="facts">
            <div><dt>Age</dt><dd>{age === null ? '—' : `${age}${patient.birthDate ? ` (b. ${formatDate(patient.birthDate)})` : ''}`}</dd></div>
            <div><dt>Civil status</dt><dd>{patient.civilStatus || '—'}</dd></div>
            <div><dt>Citizenship</dt><dd>{patient.citizenship || '—'}</dd></div>
            <div><dt>Occupation</dt><dd>{patient.occupation || '—'}</dd></div>
            <div className="wide"><dt>Address</dt><dd>{patient.address || '—'}</dd></div>
            <div><dt>Last visit</dt><dd>{lastVisit ? formatDate(lastVisit) : 'No visits yet'}</dd></div>
            <div><dt>Outstanding balance</dt><dd className={balance > 0 ? 'owed strong' : 'strong'}>{formatMoney(balance)}</dd></div>
            <div className="wide">
              <dt>Contacts</dt>
              <dd>
                {contacts.length === 0 ? '—' : (
                  <ul className="contact-list">
                    {contacts.map((c) => <li key={c.id}><span className="badge">{c.type}</span> {c.value}{c.label && <span className="muted"> ({c.label})</span>}</li>)}
                  </ul>
                )}
              </dd>
            </div>
            {patient.remarks && <div className="wide"><dt>Remarks</dt><dd>{patient.remarks}</dd></div>}
          </dl>
        </div>
      </section>

      <section className="card stack">
        <div className="row between wrap">
          <h2>Dental chart {asOf && <small className="muted">· as of {formatDate(records.find((r) => r.id === asOf)?.recordedAt ?? '')}</small>}</h2>
          <div className="row wrap">
            {asOf && <button className="btn" onClick={() => setAsOf(undefined)}>Show current</button>}
            <div className="seg" role="group" aria-label="Dentition">
              {(['permanent', 'primary'] as const).map((d) => (
                <button key={d} className={dentition === d ? 'on' : ''} onClick={() => setDentition(d)}>{d === 'permanent' ? 'Adult' : 'Child'}</button>
              ))}
            </div>
          </div>
        </div>
        <Odontogram dentition={dentition} chart={chart} />
        <ConditionLegend />
        {chart.size > 0 && (
          <ul className="tooth-notes">
            {[...chart].filter(([, s]) => s.condition !== 'healthy' || s.remarks).sort(([a], [b]) => a - b).map(([tooth, s]) => (
              <li key={tooth}><strong>{tooth}</strong> {CONDITION_LABEL[s.condition]}{s.remarks && <span className="muted"> — {s.remarks}</span>}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2>Procedures &amp; dental records</h2>
        {procedures.length === 0 ? (
          <p className="card muted">No procedures recorded yet.</p>
        ) : (
          procedures.map((p) => {
            const teeth = teethOf(p.id);
            const rec = recordOf(p.id);
            const bal = balanceCents(p);
            return (
              <article key={p.id} className={`card proc ${asOf && rec?.id === asOf ? 'selected' : ''}`}>
                <div className="row between wrap">
                  <div>
                    <strong>{p.type}</strong>
                    <div className="muted small">{formatDate(p.date)} {formatTime(p.time)}</div>
                  </div>
                  <div className="right small">
                    <div>Cost {formatMoney(p.costCents)} · Paid {formatMoney(p.paidCents)}</div>
                    <div className={bal > 0 ? 'owed strong' : 'ok strong'}>{bal > 0 ? `Balance ${formatMoney(bal)}` : bal < 0 ? `Credit ${formatMoney(-bal)}` : 'Settled'}</div>
                  </div>
                </div>
                {teeth.length > 0 && (
                  <div className="chips">
                    {teeth.map((t) => <span className="chip static" key={t.id} title={t.remarks}>{t.tooth} · {CONDITION_LABEL[t.condition]}</span>)}
                  </div>
                )}
                {p.remarks && <p className="small">{p.remarks}</p>}
                <div className="row wrap small-actions">
                  {rec && teeth.length > 0 && (
                    <button className="btn ghost" onClick={() => (setAsOf(rec.id), window.scrollTo({ top: 0, behavior: 'smooth' }))}>View chart at this point</button>
                  )}
                  {bal > 0 && (
                    <button className="btn ghost" onClick={() => {
                      const v = window.prompt(`Payment received (₱). Balance is ${formatMoney(bal)}`, String(bal / 100));
                      if (v) addPayment(p.id, toCents(v)).catch((e) => alert(e.message));
                    }}>Record payment</button>
                  )}
                  <button className="btn ghost" onClick={() => setEditing(p)}>Edit</button>
                  <button className="btn ghost danger-text" onClick={() => window.confirm('Delete this procedure and its dental record?') && void deleteProcedure(p.id)}>Delete</button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {modal === 'edit' && (
        <Modal title="Edit patient" onClose={() => setModal(null)} wide>
          <PatientForm
            initial={toFields()}
            initialContacts={toContacts()}
            submitLabel="Save changes"
            onCancel={() => setModal(null)}
            onSubmit={async (f, c) => {
              await savePatient(patient.id, f, c);
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === 'procedure' && (
        <Modal title={`Add procedure · ${patient.fullName}`} onClose={() => setModal(null)} wide>
          <ProcedureForm patientId={patient.id} onSaved={() => (setModal(null), setAsOf(undefined))} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete patient?" onClose={() => setModal(null)}>
          <div className="stack">
            <p>
              <strong>{patient.fullName}</strong> will be removed from the patient list. Their records are kept (soft delete) and are not shown.
            </p>
            <div className="row">
              <button className="btn danger" onClick={async () => (await deletePatient(patient.id), nav('/patients', { replace: true }))}>Delete patient</button>
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit procedure" onClose={() => setEditing(null)}>
          <EditProcedure procedure={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function EditProcedure({ procedure: p, onDone }: { procedure: Procedure; onDone(): void }) {
  const [type, setType] = useState(p.type);
  const [date, setDate] = useState(p.date);
  const [time, setTime] = useState(p.time);
  const [cost, setCost] = useState(String(p.costCents / 100));
  const [paid, setPaid] = useState(String(p.paidCents / 100));
  const [remarks, setRemarks] = useState(p.remarks);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await updateProcedure(p.id, { type, date, time, costCents: toCents(cost), paidCents: toCents(paid), remarks });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }
  return (
    <form className="stack form" onSubmit={submit}>
      <label className="field"><span>Type of procedure</span><input required value={type} onChange={(e) => setType(e.target.value)} /></label>
      <div className="grid2">
        <label className="field"><span>Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Cost (₱)</span><input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        <label className="field"><span>Amount paid (₱)</span><input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
      </div>
      <label className="field"><span>Remarks</span><textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
      <small className="muted">Teeth recorded with this procedure can't be edited here; delete and re-add the procedure to change them.</small>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onDone}>Cancel</button></div>
    </form>
  );
}
