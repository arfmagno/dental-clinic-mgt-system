import { useMemo } from 'react';
import { CONDITIONS, CONDITION_LABEL, TEXT_LIMITS, toothInfo, type Condition, type DentalClassification } from '@clinic/shared';
import type { ToothState } from '../domain/chart';
import { DentalChart } from './DentalChart';
import { Icon } from './Icon';
import { ConditionLegend } from './Odontogram';

export interface ToothPick {
  condition: Condition;
  remarks: string;
  touched: boolean; // condition changed by hand, so automatic defaults won't overwrite it
}

interface Props {
  classification: DentalClassification;
  /** The patient's current chart; picked teeth are drawn on top in their new condition. */
  chart: Map<number, ToothState>;
  picks: Map<number, ToothPick>;
  onChange(picks: Map<number, ToothPick>): void;
  /** Condition a tooth starts with when it is tapped. */
  initialCondition(tooth: number): Condition;
}

/** Tap teeth on the chart, then set each one's condition and remarks. */
export function TeethPicker({ classification, chart, picks, onChange, initialCondition }: Props) {
  const display = useMemo(() => {
    const m = new Map<number, Pick<ToothState, 'condition'>>(chart);
    for (const [t, p] of picks) m.set(t, { condition: p.condition });
    return m;
  }, [chart, picks]);
  const selected = useMemo(() => new Set(picks.keys()), [picks]);

  const toggle = (tooth: number) => {
    const next = new Map(picks);
    if (next.has(tooth)) next.delete(tooth);
    else next.set(tooth, { condition: initialCondition(tooth), remarks: '', touched: false });
    onChange(next);
  };
  const set = (tooth: number, p: ToothPick) => onChange(new Map(picks).set(tooth, p));

  return (
    <>
      <DentalChart classification={classification} chart={display} selected={selected} onToothClick={toggle} />
      <ConditionLegend />
      {picks.size > 0 && (
        <div className="pick-list">
          {[...picks].sort(([a], [b]) => a - b).map(([tooth, p]) => (
            <div className="pick-row" key={tooth}>
              <strong title={toothInfo(tooth)?.name}>{tooth}</strong>
              <select aria-label={`Condition of tooth ${tooth}`} value={p.condition} onChange={(e) => set(tooth, { ...p, condition: e.target.value as Condition, touched: true })}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
              </select>
              <input
                aria-label={`Remarks for tooth ${tooth}`}
                maxLength={TEXT_LIMITS.note}
                placeholder={`Remarks (${toothInfo(tooth)?.name ?? ''})`}
                value={p.remarks}
                onChange={(e) => set(tooth, { ...p, remarks: e.target.value })}
              />
              <button type="button" className="btn ghost icon" aria-label={`Remove tooth ${tooth}`} onClick={() => toggle(tooth)}><Icon name="x" /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
