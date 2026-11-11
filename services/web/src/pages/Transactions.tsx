import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PAYMENT_METHODS_OFFERED, PAYMENT_METHOD_LABEL, type PatientContact, type PaymentMethod, type Procedure } from '@clinic/shared';
import { useFeedback } from '../components/Feedback';
import { Icon, type IconName } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PatientPicker } from '../components/PatientPicker';
import { PageRange, Pager } from '../components/Pager';
import { PaymentForm } from '../components/PaymentForm';
import { contactLink } from '../domain/contact';
import { paginate } from '../domain/paging';
import { formalName, formatDate, formatMoney, formatTime, nowLocal } from '../domain/format';
import { usePatientBundle, usePatientSummaries } from '../hooks/useData';
import { settleProcedures } from '../services/procedureService';

export const OWING_PAGE_SIZE = 20;
export const TXN_PAGE_SIZE = 10;

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
  const owingView = params.get('view') === 'owing'; // from the dashboard's Settle Balances
  const bundle = usePatientBundle(patientId || undefined);
  const { notify } = useFeedback();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [single, setSingle] = useState<Unsettled | null>(null);
  const [bulk, setBulk] = useState(false);
  const [unsettledPage, setUnsettledPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const choose = (id: string) => {
    setSelected(new Set());
    setUnsettledPage(1);
    setHistoryPage(1);
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
  const unsettledShown = paginate(unsettled, TXN_PAGE_SIZE, unsettledPage);
  const historyShown = paginate(history, TXN_PAGE_SIZE, historyPage);

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
      {!patientId && <OutstandingBalance />}

      <div className="card stack tight">
        <span className="field-label">Patient</span>
        <PatientPicker value={patientId} onChange={choose} autoFocus={!patientId && !owingView} />
      </div>

      {!patientId ? (
        <OwingPatients onPick={choose} />
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
              {bundle.contacts[0] && <ContactButton contact={bundle.contacts[0]} />}
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
                  <span>Select all{unsettled.length > TXN_PAGE_SIZE && ` (${unsettled.length})`}</span>
                </label>
              )}
            </div>
            {unsettled.length === 0 ? (
              <p className="card muted center-text">All settled. Nothing to collect.</p>
            ) : (
              <>
              <ul className="txn-list">
                {unsettledShown.items.map((u) => {
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
              <Pager page={unsettledShown} onPage={setUnsettledPage} label="Unsettled pages" />
              </>
            )}
          </section>

          <section className="stack tight">
            <h2 className="section-title">Payment history</h2>
            {history.length === 0 ? (
              <p className="card muted">No payments yet.</p>
            ) : (
              <>
              <ul className="card pay-list">
                {historyShown.items.map(({ payment: y, type }) => (
                  <li key={y.id}>
                    <div className="grow">
                      <div>{type}</div>
                      <div className="muted small">{formatDate(y.paidAt)} {formatTime(y.paidAt.slice(11))} · {PAYMENT_METHOD_LABEL[y.method]}{y.remarks && ` · ${y.remarks}`}</div>
                    </div>
                    <strong>{formatMoney(y.amountCents)}</strong>
                  </li>
                ))}
              </ul>
              <Pager page={historyShown} onPage={setHistoryPage} label="Payment history pages" />
              </>
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

const CONTACT_ICON: Record<PatientContact['type'], IconName> = { phone: 'phone', email: 'mail', messenger: 'message', other: 'message' };
const CONTACT_KIND: Record<PatientContact['type'], string> = { phone: 'Phone', email: 'Email', messenger: 'Messenger', other: 'Contact' };

/** Reaches the patient through their primary contact: call, email or Messenger; anything else is copied. */
function ContactButton({ contact }: { contact: PatientContact }) {
  const { notify } = useFeedback();
  const link = contactLink(contact);
  const label = `${CONTACT_KIND[contact.type]}: ${contact.value}${contact.label ? ` (${contact.label})` : ''}`;
  const body = <><Icon name={CONTACT_ICON[contact.type]} size={16} /> Contact</>;
  return (
    <div className="contact-line">
      {link ? (
        <a className="btn sm" href={link.href} title={label} aria-label={`Contact ${label}`} {...(link.newTab ? { target: '_blank', rel: 'noreferrer' } : {})}>{body}</a>
      ) : (
        <button
          type="button"
          className="btn sm"
          title={label}
          aria-label={`Contact ${label}`}
          onClick={() => navigator.clipboard.writeText(contact.value).then(() => notify('Contact copied'), () => notify(contact.value))}
        >
          {body}
        </button>
      )}
      <span className="muted small">{contact.value}</span>
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

/** The clinic's total unpaid balance, across every patient (moved here from Records). */
function OutstandingBalance() {
  const summaries = usePatientSummaries();
  const owing = summaries?.filter((s) => s.balanceCents > 0) ?? [];
  const total = owing.reduce((s, p) => s + p.balanceCents, 0);
  return (
    <div className="card stat">
      <small className="muted">Outstanding balance</small>
      <strong className={total > 0 ? 'owed' : ''}>{summaries ? formatMoney(total) : '–'}</strong>
      {summaries && <small className="muted">{owing.length} patient{owing.length === 1 ? '' : 's'} with a balance</small>}
    </div>
  );
}

/** Before a patient is picked: everyone with an outstanding balance, largest first. */
function OwingPatients({ onPick }: { onPick(id: string): void }) {
  const [pageNo, setPageNo] = useState(1);
  const owing = usePatientSummaries()
    ?.filter((s) => s.balanceCents > 0)
    .sort((a, b) => b.balanceCents - a.balanceCents);
  if (owing === undefined) return <p className="muted">Loading…</p>;
  const page = paginate(owing, OWING_PAGE_SIZE, pageNo);
  return (
    <section className="stack tight" aria-labelledby="owing-title">
      <h2 id="owing-title" className="section-title">Patients with a balance</h2>
      {owing.length === 0 ? (
        <p className="card muted center-text">No outstanding balances. Choose a patient above to see their payments.</p>
      ) : (
        <>
        <PageRange page={page} pageSize={OWING_PAGE_SIZE} noun={['patient', 'patients']} />
        <ul className="card owing-list">
          {page.items.map((s) => (
            <li key={s.patient.id}>
              <button type="button" onClick={() => onPick(s.patient.id)}>
                <span className="grow strong">{s.name}</span>
                <span className="owed strong">{formatMoney(s.balanceCents)}</span>
                <span className="btn sm" aria-hidden>Settle</span>
              </button>
            </li>
          ))}
        </ul>
        <Pager page={page} onPage={setPageNo} label="Patient pages" />
        </>
      )}
    </section>
  );
}
