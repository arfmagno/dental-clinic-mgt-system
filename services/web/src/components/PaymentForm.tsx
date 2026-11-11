import { useMemo, useState, type FormEvent } from 'react';
import { PAYMENT_METHODS_OFFERED, PAYMENT_METHOD_LABEL, TEXT_LIMITS, toCents, type PaymentMethod } from '@clinic/shared';
import { formatMoney, nowLocal } from '../domain/format';
import { addPayment } from '../services/procedureService';

interface Props {
  procedureId: string;
  balanceCents: number;
  /** true after a payment was recorded, false on cancel. */
  onDone(saved: boolean): void;
}

/** Record money received for a procedure. Defaults: the outstanding balance, cash, now. */
export function PaymentForm({ procedureId, balanceCents, onDone }: Props) {
  const now = useMemo(() => nowLocal(), []);
  const [amount, setAmount] = useState(balanceCents > 0 ? String(balanceCents / 100) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await addPayment(procedureId, { amountCents: toCents(amount), method, paidAt: `${date}T${time || '00:00'}`, remarks });
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={submit}>
      <p className="muted">Outstanding: <strong>{formatMoney(balanceCents)}</strong></p>
      <div className="grid2">
        <label className="field">
          <span>Amount received (₱) *</span>
          <input autoFocus required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span>Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS_OFFERED.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </select>
        </label>
      </div>
      <div className="grid2">
        <label className="field"><span>Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="field"><span>Remarks</span><input maxLength={TEXT_LIMITS.note} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. OR no. 1234" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</button>
        <button type="button" className="btn" onClick={() => onDone(false)} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
