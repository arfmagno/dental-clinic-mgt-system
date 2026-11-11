import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONDITION_LABEL, DENTAL_CLASSIFICATION_LABEL, PAYMENT_METHOD_LABEL, nationalityOf, toCents, toothInfo, type Payment, type Procedure } from '@clinic/shared';
import { DentalChart } from '../components/DentalChart';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { ConditionLegend } from '../components/Odontogram';
import { PatientForm } from '../components/PatientForm';
import { PaymentForm } from '../components/PaymentForm';
import { ProcedureForm } from '../components/ProcedureForm';
import { ProcedureTypeField } from '../components/ProcedureTypeField';
import { resolveProcedureType, splitProcedureType } from '../domain/procedureType';
import { buildChart, type ToothState } from '../domain/chart';
import { classificationOf } from '../domain/classification';
import { ageOf, formalName, formatAddress, formatDate, formatMoney, formatTime } from '../domain/format';
import { usePatientBundle } from '../hooks/useData';
import { deletePatient, savePatient, type ContactInput, type PatientFields } from '../services/patientService';
import { deletePayment, deleteProcedure, updateProcedure } from '../services/procedureService';

type ModalState =
  | { kind: 'edit' | 'record' }
  | { kind: 'payment'; procedure: Procedure; balanceCents: number }
  | { kind: 'editRecord'; procedure: Procedure }
  | null;

export function PatientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify, confirm } = useFeedback();
  const bundle = usePatientBundle(id);
  const [modal, setModal] = useState<ModalState>(null);
  const [asOf, setAsOf] = useState<string | undefined>();
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

  const { patient, contacts, procedures, payments, paid, records, entries } = bundle;
  const name = formalName(patient);
  const age = ageOf(patient.birthDate);
  const classification = classificationOf(patient);
  const balanceOf = (p: Procedure) => p.costCents - (paid.get(p.id) ?? 0);
  const balance = procedures.reduce((s, p) => s + balanceOf(p), 0);
  const lastVisit = procedures[0]?.date ?? '';
  const teethOf = (procedureId: string) => entries.filter((e) => e.procedureId === procedureId).sort((a, b) => a.tooth - b.tooth);
  const paymentsOf = (procedureId: string) => payments.filter((y) => y.procedureId === procedureId);
  const recordOf = (procedureId: string) => records.find((r) => r.procedureId === procedureId);
  const close = () => setModal(null);

  const toFields = (): PatientFields => {
    const { id: _i, createdAt: _c, updatedAt: _u, isDeleted: _d, ...fields } = patient;
    return { dentalClassification: '', ...fields };
  };
  const toContacts = (): ContactInput[] => contacts.map((c) => ({ id: c.id, type: c.type, value: c.value, label: c.label, isPrimary: c.isPrimary }));

  async function exportPdf() {
    setExporting(true);
    try {
      const { exportPatientPdf } = await import('../services/pdfService'); // loaded on demand to keep startup light
      await exportPatientPdf(bundle!, import.meta.env.VITE_CLINIC_NAME ?? 'Magno Dental Clinic');
      notify('PDF exported');
    } catch {
      notify('Could not export the PDF', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function removePatient() {
    const ok = await confirm({
      title: 'Delete patient?',
      message: <><strong>{name}</strong> will be removed from the patient list. Their records are kept (soft delete) and are not shown.</>,
      confirmLabel: 'Delete patient',
      danger: true,
    });
    if (!ok) return;
    await deletePatient(patient.id);
    notify('Patient deleted');
    nav('/patients', { replace: true });
  }

  async function removeRecord(p: Procedure) {
    const ok = await confirm({
      title: 'Delete this record?',
      message: <><strong>{p.type}</strong> on {formatDate(p.date)}, with its payments and dental chart entries, will be deleted.</>,
      confirmLabel: 'Delete record',
      danger: true,
    });
    if (!ok) return;
    await deleteProcedure(p.id);
    if (asOf && recordOf(p.id)?.id === asOf) setAsOf(undefined);
    notify('Record deleted');
  }

  async function removePayment(y: Payment) {
    const ok = await confirm({
      title: 'Remove payment?',
      message: <>The {formatMoney(y.amountCents)} payment of {formatDate(y.paidAt)} will be removed and the balance goes back up.</>,
      confirmLabel: 'Remove payment',
      danger: true,
    });
    if (!ok) return;
    await deletePayment(y.id);
    notify('Payment removed');
  }

  return (
    <div className="stack">
      <Link to="/patients" className="back-link"><Icon name="back" size={18} /> Patients</Link>

      <section className="card profile">
        <div className="profile-head">
          <div className="avatar xl">{patient.photo ? <img src={patient.photo} alt={name} /> : <span aria-hidden>👤</span>}</div>
          <div className="grow">
            <h1>{name}</h1>
            <p className="muted">{[age !== null && `${age} yrs`, nationalityOf(patient.citizenshipCode)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setModal({ kind: 'record' })}><Icon name="plus" size={18} /> Add Record</button>
          <button className="btn" onClick={() => setModal({ kind: 'edit' })}><Icon name="edit" size={18} /> Edit</button>
          <button className="btn" onClick={exportPdf} disabled={exporting}><Icon name="download" size={18} /> {exporting ? 'Exporting…' : 'Export'}</button>
          <button className="btn danger" onClick={removePatient}><Icon name="trash" size={18} /> Delete</button>
        </div>
        <dl className="facts">
          <div><dt>Date of birth</dt><dd>{patient.birthDate ? formatDate(patient.birthDate) : '—'}</dd></div>
          <div><dt>Civil status</dt><dd>{patient.civilStatus || '—'}</dd></div>
          <div><dt>Citizenship</dt><dd>{nationalityOf(patient.citizenshipCode) || '—'}</dd></div>
          <div><dt>Occupation</dt><dd>{patient.occupation || '—'}</dd></div>
          <div><dt>Dental classification</dt><dd>{DENTAL_CLASSIFICATION_LABEL[classification.value]}{classification.suggested && <span className="muted small"> (by age)</span>}</dd></div>
          <div><dt>Last visit</dt><dd>{lastVisit ? formatDate(lastVisit) : 'No visits yet'}</dd></div>
          <div>
            <dt>Outstanding balance</dt>
            <dd className={balance > 0 ? 'owed strong' : 'strong'}>
              {formatMoney(balance)}
              {balance > 0 && <> · <Link to={`/transactions?patientId=${patient.id}`}>Settle</Link></>}
            </dd>
          </div>
          <div className="wide">
            <dt>Contacts</dt>
            <dd>
              {contacts.length === 0 ? '—' : (
                <ul className="contact-list">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <span className="badge">{c.type}</span> {c.value}
                      {c.label && <span className="muted"> ({c.label})</span>}
                      {c.isPrimary && contacts.length > 1 && <span className="badge primary-badge">primary</span>}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div className="wide"><dt>Address</dt><dd>{formatAddress(patient) || '—'}</dd></div>
          {patient.remarks && <div className="wide"><dt>Remarks</dt><dd className="pre">{patient.remarks}</dd></div>}
        </dl>
      </section>

      <section className="card stack">
        <div className="row between wrap">
          <div>
            <h2>Dental chart</h2>
            <p className="muted small">
              {DENTAL_CLASSIFICATION_LABEL[classification.value]}
              {asOf && <> · as of {formatDate(records.find((r) => r.id === asOf)?.recordedAt ?? '')}</>}
            </p>
          </div>
          {asOf && <button className="btn sm" onClick={() => setAsOf(undefined)}>Current</button>}
        </div>
        <DentalChart classification={classification.value} chart={chart} />
        <ConditionLegend />
        {chart.size > 0 && (
          <ul className="tooth-notes">
            {[...chart].filter(([, s]) => s.condition !== 'healthy' || s.remarks).sort(([a], [b]) => a - b).map(([tooth, s]) => (
              <li key={tooth}>
                <strong title={toothInfo(tooth)?.name}>{tooth}</strong> {CONDITION_LABEL[s.condition]}
                {s.remarks && <span className="muted"> — {s.remarks}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Dental Records</h2>
        {procedures.length === 0 ? (
          <p className="card muted">No records yet.</p>
        ) : (
          procedures.map((p) => {
            const teeth = teethOf(p.id);
            const rec = recordOf(p.id);
            const bal = balanceOf(p);
            const pays = paymentsOf(p.id);
            return (
              <article key={p.id} className={`card proc ${asOf && rec?.id === asOf ? 'selected' : ''}`}>
                <div className="proc-head">
                  <div className="grow">
                    <strong className="proc-type">{p.type}</strong>
                    <div className="muted small">{formatDate(p.date)} · {formatTime(p.time)}</div>
                  </div>
                  <span className={`pill ${bal > 0 ? 'owed' : 'ok'}`}>{bal > 0 ? `Balance ${formatMoney(bal)}` : bal < 0 ? `Credit ${formatMoney(-bal)}` : 'Settled'}</span>
                </div>
                <div className="money-row small">
                  <span>Cost <strong>{formatMoney(p.costCents)}</strong></span>
                  <span>Paid <strong>{formatMoney(paid.get(p.id) ?? 0)}</strong></span>
                </div>
                {teeth.length > 0 && (
                  <div className="chips">
                    {teeth.map((t) => <span className="chip static" key={t.id} title={[toothInfo(t.tooth)?.name, t.remarks].filter(Boolean).join(' — ')}>{t.tooth} · {CONDITION_LABEL[t.condition]}</span>)}
                  </div>
                )}
                {p.remarks && <p className="small pre">{p.remarks}</p>}
                <div className="payments">
                  <h3 className="label">Payment history</h3>
                  {pays.length === 0 ? (
                    <p className="muted small">No payments yet.</p>
                  ) : (
                    <ul className="pay-list">
                      {pays.map((y) => (
                        <li key={y.id}>
                          <div className="grow">
                            <div>{formatDate(y.paidAt)} <span className="muted">{formatTime(y.paidAt.slice(11))}</span></div>
                            <div className="muted small">{PAYMENT_METHOD_LABEL[y.method]}{y.remarks && ` · ${y.remarks}`}</div>
                          </div>
                          <strong>{formatMoney(y.amountCents)}</strong>
                          <button className="btn ghost sm danger-text" aria-label={`Remove payment of ${formatMoney(y.amountCents)}`} onClick={() => void removePayment(y)}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="actions">
                  {bal > 0 && <button className="btn sm primary" onClick={() => setModal({ kind: 'payment', procedure: p, balanceCents: bal })}>Pay</button>}
                  {rec && teeth.length > 0 && (
                    <button className="btn sm" onClick={() => (setAsOf(rec.id), window.scrollTo({ top: 0, behavior: 'smooth' }))}><Icon name="eye" size={16} /> Chart</button>
                  )}
                  <button className="btn sm" onClick={() => setModal({ kind: 'editRecord', procedure: p })}><Icon name="edit" size={16} /> Edit</button>
                  <button className="btn sm danger" onClick={() => void removeRecord(p)}><Icon name="trash" size={16} /> Delete</button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {modal?.kind === 'edit' && (
        <Modal title="Edit patient" onClose={close} wide>
          <PatientForm
            initial={toFields()}
            initialContacts={toContacts()}
            submitLabel="Save changes"
            onCancel={close}
            onSubmit={async (f, c) => {
              await savePatient(patient.id, f, c);
              close();
              notify('Patient updated');
            }}
          />
        </Modal>
      )}
      {modal?.kind === 'record' && (
        <Modal title={`Add record · ${name}`} onClose={close} wide>
          <ProcedureForm patientId={patient.id} onSaved={() => (close(), setAsOf(undefined), notify('Record added'))} onCancel={close} />
        </Modal>
      )}
      {modal?.kind === 'payment' && (
        <Modal title={`Record payment · ${modal.procedure.type}`} onClose={close}>
          <PaymentForm procedureId={modal.procedure.id} balanceCents={modal.balanceCents} onDone={(saved) => (close(), saved && notify('Payment recorded'))} />
        </Modal>
      )}
      {modal?.kind === 'editRecord' && (
        <Modal title="Edit record" onClose={close}>
          <EditProcedure procedure={modal.procedure} onDone={(saved) => (close(), saved && notify('Record updated'))} />
        </Modal>
      )}
    </div>
  );
}

function EditProcedure({ procedure: p, onDone }: { procedure: Procedure; onDone(saved: boolean): void }) {
  const [typeInput, setTypeInput] = useState(() => splitProcedureType(p.type));
  const type = resolveProcedureType(typeInput);
  const [date, setDate] = useState(p.date);
  const [time, setTime] = useState(p.time);
  const [cost, setCost] = useState(String(p.costCents / 100));
  const [remarks, setRemarks] = useState(p.remarks);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return setError('Type the procedure.');
    setSaving(true);
    try {
      await updateProcedure(p.id, { type, date, time, costCents: toCents(cost), remarks });
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }
  return (
    <form className="stack form" onSubmit={submit}>
      <ProcedureTypeField value={typeInput} onChange={setTypeInput} />
      <div className="grid2">
        <label className="field"><span>Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="field"><span>Cost (₱)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
      <label className="field"><span>Remarks</span><textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
      <small className="muted">Payments are recorded separately. Teeth recorded with this record can't be edited here; delete and re-add the record to change them.</small>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}
