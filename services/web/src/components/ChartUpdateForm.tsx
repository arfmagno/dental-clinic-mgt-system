import { useMemo, useState, type FormEvent } from 'react';
import { TEXT_LIMITS, type DentalClassification } from '@clinic/shared';
import type { ToothState } from '../domain/chart';
import { nowLocal } from '../domain/format';
import { createChartUpdate } from '../services/procedureService';
import { TeethPicker, type ToothPick } from './TeethPicker';

interface Props {
  patientId: string;
  classification: DentalClassification;
  chart: Map<number, ToothState>;
  onSaved(): void;
  onCancel(): void;
}

/** Changes the dental chart without a procedure: exam findings, work done elsewhere, corrections. */
export function ChartUpdateForm({ patientId, classification, chart, onSaved, onCancel }: Props) {
  const now = useMemo(() => nowLocal(), []);
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [remarks, setRemarks] = useState('');
  const [picks, setPicks] = useState<Map<number, ToothPick>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (picks.size === 0) return setError('Tap at least one tooth on the chart.');
    setSaving(true);
    setError('');
    try {
      await createChartUpdate({ patientId, date, time, remarks, teeth: [...picks].map(([tooth, p]) => ({ tooth, condition: p.condition, remarks: p.remarks })) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={submit}>
      <p className="muted small">For findings from an exam, work done at another clinic, or a correction. No procedure or charge is recorded.</p>
      <fieldset className="field teeth-field">
        <legend>Teeth <small className="muted">(tap teeth on the chart, then set their condition)</small></legend>
        <TeethPicker classification={classification} chart={chart} picks={picks} onChange={setPicks} initialCondition={(t) => chart.get(t)?.condition ?? 'healthy'} />
      </fieldset>
      <div className="grid2">
        <label className="field"><span>Date *</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="field"><span>Notes</span><textarea rows={2} maxLength={TEXT_LIMITS.remarks} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Initial exam, filling done abroad" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save chart'}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
