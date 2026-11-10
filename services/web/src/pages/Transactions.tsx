import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PAYMENT_METHODS_OFFERED, PAYMENT_METHOD_LABEL, type PaymentMethod, type Procedure } from '@clinic/shared';
import { useFeedback } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { PatientPicker } from '../components/PatientPicker';
import { PaymentForm } from '../components/PaymentForm';
import { formalName, formatDate, formatMoney, formatTime, nowLocal } from '../domain/format';
import { usePatientBundle } from '../hooks/useData';
import { settleProcedures } from '../services/procedureService';

interface Unsettled {
  procedure: Procedure;
  paidCents: number;
  balanceCents: number;
}

/**
 * Settle a patient's balances: pick the patient, see every unsettled record, then settle one
 * (any amount, defaulting to its balance) or several at once (each in full).
 * Every settlement is a payment row linked to its record; balances are always derived.
 */
export function Transactions() {
  const [params, setParams] = useSearchParams();
  const patientId = params.get('patientId') ?? '';
  const bundle = usePatientBundle(patientId || undefined);
  const { notify } = useFeedback();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [single, setSingle] = useState<Unsettled | null>(null);
  const [bulk, setBulk] = useState(false);

  const choose = (id: string) => {
    setSelected(new Set());
    setParams(id ? { patientId: id } : {}, { replace: true });
  };

  const unsettled = useMemo<Unsettled[]>(() => {
    if (!bundle) return [];
    return bundle.procedures
      .map((procedure) => {
        const paidCents = bundle.paid.get(procedure.id) ?? 0;
        return { procedure, paidCents, balanceCents: procedure.costCents - paidCents };
      })
      .filter((u) => u.balanceCents > 0)
      .toReversed(); // oldest first: settle in the order they were incurred
  }, [bundle]);

  const history = useMemo(() => {
    if (!bundle) return [];
    const types = new Map(bundle.procedures.map((p) => [p.id, p.type]));
    return bundle.payments.toReversed().map((y) => ({ payment: y, type: types.get(y.procedureId) ?? '' }));
  }, [bundle]);

  // Drop selections that were settled meanwhile.
  const live = new Set(unsettled.map((u) => u.procedure.id));
  const picked = unsettled.filter((u) => selected.has(u.procedure.id));
  const outstanding = unsettled.reduce((s, u) => s + u.balanceCents, 0);
  const pickedTotal = picked.reduce((s, u) => s + u.balanceCents, 0);
  const allPicked = unsettled.length > 0 && picked.length === unsettled.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set([...prev].filter((x) => live.has(x)));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="stack narrow">
      <h1>Transactions</h1>

      <div className="card stack tight">
        <span className="field-label">Patient</span>
        <PatientPicker value={patientId} onChange={choose} autoFocus={!patientId} />
      </div>

      {!patientId ? (
        <p className="muted center-text pad">Choose a patient to see their unsettled records.</p>
      ) : bundle === undefined ? (
        <p className="muted">Loading…</p>
      ) : bundle === null ? (
        <p className="card muted">This patient could not be found.</p>
      ) : (
        <>
          <section className="card summary">
            <div className="grow">
              <Link to={`/patients/${bundle.patient.id}`} className="strong">{formalName(bundle.patient)}</Link>
              <div className="muted small">{unsettled.length} unsettled record{unsettled.length === 1 ? '' : 's'}</div>
            </div>
            <div className="right">
              <div className="muted small">Outstanding</div>
              <div className={`big-money ${outstanding > 0 ? 'owed' : 'ok'}`}>{formatMoney(outstanding)}</div>
            </div>
          </section>

          <section className="stack tight">
            <div className="row between">
              <h2 className="section-title">Unsettled</h2>
              {unsettled.length > 1 && (
                <label className="switch small">
                  <input type="checkbox" checked={allPicked} onChange={() => setSelected(allPicked ? new Set() : new Set(live))} />
                  <span>Select all</span>
                </label>
              )}
            </div>
            {unsettled.length === 0 ? (
              <p className="card muted center-text">All settled. Nothing to collect.</p>
            ) : (
              <ul className="txn-list">
                {unsettled.map((u) => {
                  const p = u.procedure;
                  const on = selected.has(p.id);
                  return (
                    <li key={p.id} className={`card txn ${on ? 'on' : ''}`}>
                      <label className="txn-check">
                        <input type="checkbox" checked={on} onChange={() => toggle(p.id)} aria-label={`Select ${p.type} on ${formatDate(p.date)}`} />
                      </label>
                      <div className="grow">
                        <strong>{p.type}</strong>
                        <div className="muted small">{formatDate(p.date)} · {formatTime(p.time)}</div>
                        <div className="muted small">Cost {formatMoney(p.costCents)} · Paid {formatMoney(u.paidCents)}</div>
                      </div>
                      <div className="txn-end">
                        <strong className="owed">{formatMoney(u.balanceCents)}</strong>
                        <button type="button" className="btn sm" onClick={() => setSingle(u)}>Settle</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="stack tight">
            <h2 className="section-title">Payment history</h2>
            {history.length === 0 ? (
              <p className="card muted">No payments yet.</p>
            ) : (
              <ul className="card pay-list">
                {history.map(({ payment: y, type }) => (
                  <li key={y.id}>
                    <div className="grow">
                      <div>{type}</div>
                      <div className="muted small">{formatDate(y.paidAt)} {formatTime(y.paidAt.slice(11))} · {PAYMENT_METHOD_LABEL[y.method]}{y.remarks && ` · ${y.remarks}`}</div>
                    </div>
                    <strong>{formatMoney(y.amountCents)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {picked.length > 0 && (
            <div className="bulkbar" role="region" aria-label="Selected records">
              <div className="grow">
                <strong>{picked.length} selected</strong>
                <div className="small">{formatMoney(pickedTotal)}</div>
              </div>
              <button type="button" className="btn primary" onClick={() => setBulk(true)}>Settle</button>
            </div>
          )}

          {single && (
            <Modal title={`Settle · ${single.procedure.type}`} onClose={() => setSingle(null)}>
              <PaymentForm
                procedureId={single.procedure.id}
                balanceCents={single.balanceCents}
                onDone={(saved) => {
                  setSingle(null);
                  if (saved) notify('Payment recorded');
                }}
              />
            </Modal>
          )}
          {bulk && (
            <Modal title={`Settle ${picked.length} record${picked.length === 1 ? '' : 's'}`} onClose={() => setBulk(false)}>
              <BulkSettleForm
                items={picked}
                onDone={(result) => {
                  setBulk(false);
                  if (!result) return;
                  setSelected(new Set());
                  notify(`Settled ${result.count} record${result.count === 1 ? '' : 's'} · ${formatMoney(result.totalCents)}`);
                }}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

function BulkSettleForm({ items, onDone }: { items: Unsettled[]; onDone(result: { count: number; totalCents: number } | null): void }) {
  const now = useMemo(() => nowLocal(), []);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const total = items.reduce((s, u) => s + u.balanceCents, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onDone(await settleProcedures(items.map((u) => u.procedure.id), { method, paidAt: `${date}T${time || '00:00'}`, remarks }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={submit}>
      <ul className="settle-list">
        {items.map((u) => (
          <li key={u.procedure.id}>
            <span className="grow">{u.procedure.type} <span className="muted small">· {formatDate(u.procedure.date)}</span></span>
            <span>{formatMoney(u.balanceCents)}</span>
          </li>
        ))}
        <li className="total">
          <span className="grow">Total</span>
          <span>{formatMoney(total)}</span>
        </li>
      </ul>
      <label className="field">
        <span>Method</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS_OFFERED.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
        </select>
      </label>
      <div className="grid2">
        <label className="field"><span>Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="field"><span>Remarks</span><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. OR no. 1234" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>{saving ? 'Settling…' : `Settle ${formatMoney(total)}`}</button>
        <button type="button" className="btn" onClick={() => onDone(null)} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
