import { OTHER_PROCEDURE, PROCEDURE_TYPES } from '@clinic/shared';
import type { ProcedureTypeInput } from '../domain/procedureType';

interface Props {
  value: ProcedureTypeInput;
  onChange(v: ProcedureTypeInput): void;
}

/** Procedure type dropdown; "Other" reveals a required text box for the actual type. */
export function ProcedureTypeField({ value, onChange }: Props) {
  return (
    <div className="stack tight">
      <label className="field">
        <span>Type of procedure *</span>
        <select required value={value.choice} onChange={(e) => onChange({ ...value, choice: e.target.value })}>
          <option value="" disabled>— Choose —</option>
          {PROCEDURE_TYPES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </label>
      {value.choice === OTHER_PROCEDURE && (
        <label className="field">
          <span>Other type of procedure *</span>
          <input required autoFocus maxLength={80} placeholder="e.g. Gum treatment" value={value.other} onChange={(e) => onChange({ ...value, other: e.target.value })} />
        </label>
      )}
    </div>
  );
}
