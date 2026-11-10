import { useMemo, useState, type FormEvent } from 'react';
import { CONDITIONS, CONDITION_LABEL, PROCEDURE_TYPES, dentitionOf, toCents, type Condition, type Dentition } from '@clinic/shared';
import { buildChart, type ToothState } from '../domain/chart';
import { nowLocal } from '../domain/format';
import { usePatientBundle } from '../hooks/useData';
import { createProcedure } from '../services/procedureService';
import { ConditionLegend, Odontogram } from './Odontogram';
import { PatientPicker } from './PatientPicker';

interface Props {
  /** Fixed when opened from a patient's page; otherwise the user must pick one. */
  patientId?: string;
  onSaved(procedureId: string, patientId: string): void;
  onCancel?(): void;
}

interface ToothPick {
  condition: Condition;
  remarks: string;
  touched: boolean; // user changed the condition by hand, so a later type change won't overwrite it
}

const defaultCondition = (type: string): Condition | undefined => PROCEDURE_TYPES.find((t) => t.name === type)?.condition;

export function ProcedureForm({ patientId: fixedPatientId, onSaved, onCancel }: Props) {
  const [patientId, setPatientId] = useState(fixedPatientId ?? '');
  const bundle = usePatientBundle(patientId || undefined);
  const now = useMemo(nowLocal, []); // default to "now"; both fields stay editable for past records
  const [type, setType] = useState('');
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [cost, setCost] = useState('');
  const [paid, setPaid] = useState('');
  const [remarks, setRemarks] = useState('');
  const [dentition, setDentition] = useState<Dentition>('permanent');
  const [picks, setPicks] = useState<Map<number, ToothPick>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const chart = useMemo(() => (bundle ? buildChart(bundle.records, bundle.entries) : new Map<number, ToothState>()), [bundle]);
  // Show pending selections on the chart as their new condition.
  const display = useMemo(() => {
    const m = new Map<number, Pick<ToothState, 'condition'>>(chart);
    for (const [t, p] of picks) m.set(t, { condition: p.condition });
    return m;
  }, [chart, picks]);
  const selected = useMemo(() => new Set(picks.keys()), [picks]);

  const isPast = date !== now.date;

  function toggleTooth(tooth: number) {
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(tooth)) next.delete(tooth);
      else next.set(tooth, { condition: defaultCondition(type) ?? 'healthy', remarks: '', touched: false });
      return next;
    });
  }

  function changeType(v: string) {
    setType(v);
    const c = defaultCondition(v);
    if (c) setPicks((prev) => new Map([...prev].map(([t, p]) => [t, p.touched ? p : { ...p, condition: c }])));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!patientId) return setError('Choose a patient first.');
    setSaving(true);
    setError('');
    try {
      const id = await createProcedure({
        patientId,
        type,
        date,
        time,
        costCents: toCents(cost),
        paidCents: toCents(paid),
        remarks,
        teeth: [...picks].map(([tooth, p]) => ({ tooth, condition: p.condition, remarks: p.remarks })),
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
        <label className="field">
          <span>Type of procedure *</span>
          <input required list="procedure-types" value={type} onChange={(e) => changeType(e.target.value)} placeholder="e.g. Filling" />
          <datalist id="procedure-types">
            {PROCEDURE_TYPES.map((t) => <option key={t.name} value={t.name} />)}
          </datalist>
        </label>
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
      <small className="muted" style={{ marginTop: -8 }}>
        {isPast ? 'Recording a past procedure.' : 'Defaults to now.'} Change the date or time to record an earlier visit.
        {isPast && <button type="button" className="link" onClick={() => (setDate(nowLocal().date), setTime(nowLocal().time))}> Reset to now</button>}
      </small>

      <div className="grid2">
        <label className="field">
          <span>Cost (₱)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
        </label>
        <label className="field">
          <span>Amount paid (₱)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0.00" />
        </label>
      </div>

      <label className="field">
        <span>Remarks</span>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </label>

      <fieldset className="field teeth-field">
        <legend>Teeth affected <small className="muted">(tap teeth on the chart; optional)</small></legend>
        <div className="row wrap between">
          <div className="seg" role="group" aria-label="Dentition">
            {(['permanent', 'primary'] as const).map((d) => (
              <button type="button" key={d} className={dentition === d ? 'on' : ''} onClick={() => setDentition(d)}>
                {d === 'permanent' ? 'Adult' : 'Child'}
              </button>
            ))}
          </div>
          {!patientId && <small className="muted">Pick a patient to see their current chart.</small>}
        </div>
        <Odontogram dentition={dentition} chart={display} selected={selected} onToothClick={toggleTooth} />
        <ConditionLegend />
        {picks.size > 0 && (
          <div className="pick-list">
            {[...picks].sort(([a], [b]) => a - b).map(([tooth, p]) => (
              <div className="pick-row" key={tooth}>
                <strong>{tooth}</strong>
                <select
                  aria-label={`Condition of tooth ${tooth}`}
                  value={p.condition}
                  onChange={(e) => setPicks((prev) => new Map(prev).set(tooth, { ...p, condition: e.target.value as Condition, touched: true }))}
                >
                  {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                </select>
                <input
                  aria-label={`Remarks for tooth ${tooth}`}
                  placeholder="Remarks"
                  value={p.remarks}
                  onChange={(e) => setPicks((prev) => new Map(prev).set(tooth, { ...p, remarks: e.target.value }))}
                />
                <button type="button" className="btn ghost icon" aria-label={`Remove tooth ${tooth}`} onClick={() => toggleTooth(tooth)}>✕</button>
              </div>
            ))}
          </div>
        )}
        {[...picks.keys()].some((t) => dentitionOf(t) !== dentition) && <small className="muted">Some selected teeth are on the other chart.</small>}
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn primary" disabled={saving || !patientId}>{saving ? 'Saving…' : 'Save procedure'}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
