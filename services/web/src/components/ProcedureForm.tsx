import { useMemo, useState, type FormEvent } from 'react';
import {
  PAYMENT_METHODS_OFFERED,
  PAYMENT_METHOD_LABEL,
  PROCEDURE_TYPES,
  OTHER_PROCEDURE,
  toCents,
  type Condition,
  type PaymentMethod,
  TEXT_LIMITS,
} from '@clinic/shared';
import { buildChart, type ToothState } from '../domain/chart';
import { classificationOf } from '../domain/classification';
import { nowLocal } from '../domain/format';
import { resolveProcedureType, type ProcedureTypeInput } from '../domain/procedureType';
import { ProcedureTypeField } from './ProcedureTypeField';
import { usePatientBundle } from '../hooks/useData';
import { createProcedure } from '../services/procedureService';
import { PatientPicker } from './PatientPicker';
import { TeethPicker, type ToothPick } from './TeethPicker';

interface Props {
  /** Fixed when opened from a patient's page; otherwise the user must pick one. */
  patientId?: string;
  onSaved(procedureId: string, patientId: string): void;
  onCancel(): void;
}

const defaultCondition = (type: string): Condition | undefined => PROCEDURE_TYPES.find((t) => t.name === type)?.condition;

export function ProcedureForm({ patientId: fixedPatientId, onSaved, onCancel }: Props) {
  const [patientId, setPatientId] = useState(fixedPatientId ?? '');
  const bundle = usePatientBundle(patientId || undefined);
  const now = useMemo(() => nowLocal(), []); // default to "now"; both fields stay editable for past records
  const [typeInput, setTypeInput] = useState<ProcedureTypeInput>({ choice: '', other: '' });
  const type = resolveProcedureType(typeInput);
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [cost, setCost] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [remarks, setRemarks] = useState('');
  const [picks, setPicks] = useState<Map<number, ToothPick>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const chart = useMemo(() => (bundle ? buildChart(bundle.records, bundle.entries) : new Map<number, ToothState>()), [bundle]);
  const isPast = date !== now.date;
  const classification = bundle ? classificationOf(bundle.patient).value : null;

  function changeType(v: ProcedureTypeInput) {
    setTypeInput(v);
    const c = v.choice === OTHER_PROCEDURE ? undefined : defaultCondition(v.choice);
    if (c) setPicks((prev) => new Map([...prev].map(([t, p]) => [t, p.touched ? p : { ...p, condition: c }])));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!patientId) return setError('Choose a patient first.');
    if (!type) return setError(typeInput.choice === OTHER_PROCEDURE ? 'Type the procedure.' : 'Choose the type of procedure.');
    setSaving(true);
    setError('');
    try {
      const id = await createProcedure({
        patientId,
        type,
        date,
        time,
        costCents: toCents(cost),
        remarks,
        teeth: [...picks].map(([tooth, p]) => ({ tooth, condition: p.condition, remarks: p.remarks })),
        payment: toCents(paidNow) > 0 ? { amountCents: toCents(paidNow), method, remarks: '' } : null,
      });
      onSaved(id, patientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={submit}>
      {!fixedPatientId && (
        <div className="field">
          <span>Patient *</span>
          <PatientPicker value={patientId} onChange={setPatientId} autoFocus />
        </div>
      )}

      <div className="grid2">
        <ProcedureTypeField value={typeInput} onChange={changeType} />
        <div className="grid2 tight-grid">
          <label className="field">
            <span>Date *</span>
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
      </div>
      <small className="muted hint">
        {isPast ? 'Recording a past procedure.' : 'Date and time default to now.'} Change them to record an earlier visit.
        {isPast && <button type="button" className="link" onClick={() => { const n = nowLocal(); setDate(n.date); setTime(n.time); }}> Reset to now</button>}
      </small>

      <div className="grid3">
        <label className="field">
          <span>Cost (₱)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
        </label>
        <label className="field">
          <span>Amount received now (₱)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0.00" />
        </label>
        <label className="field">
          <span>Payment method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} disabled={!(toCents(paidNow) > 0)}>
            {PAYMENT_METHODS_OFFERED.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Remarks</span>
        <textarea rows={2} maxLength={TEXT_LIMITS.remarks} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </label>

      <fieldset className="field teeth-field">
        <legend>Teeth affected <small className="muted">(tap teeth on the chart; optional)</small></legend>
        {classification ? (
          <TeethPicker
            classification={classification}
            chart={chart}
            picks={picks}
            onChange={setPicks}
            initialCondition={(tooth) => defaultCondition(type) ?? chart.get(tooth)?.condition ?? 'healthy'}
          />
        ) : (
          <small className="muted">Pick a patient to see their chart.</small>
        )}
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving || !patientId}>{saving ? 'Adding record…' : 'Add record'}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
