import { useId } from 'react';
import { ADDRESS_LABELS } from '@clinic/shared';
import { emptyAddress, withSinglePrimary, type AddressInput } from '../services/patientService';
import { CountrySelect } from './CountrySelect';

interface Props {
  value: AddressInput[];
  onChange(v: AddressInput[]): void;
}

/** Structured addresses; a patient may have several, exactly one primary. */
export function AddressesEditor({ value, onChange }: Props) {
  const group = useId();
  const set = (i: number, patch: Partial<AddressInput>) => onChange(value.map((a, j) => (i === j ? { ...a, ...patch } : a)));
  const makePrimary = (i: number) => onChange(value.map((a, j) => ({ ...a, isPrimary: i === j })));
  const remove = (i: number) => onChange(withSinglePrimary(value.filter((_, j) => j !== i)));

  return (
    <div className="stack tight">
      {value.map((a, i) => (
        <fieldset className="address-card" key={a.id ?? `new-${i}`}>
          <legend className="sr-only">Address {i + 1}</legend>
          <div className="row wrap between">
            <select aria-label="Address type" value={a.label} onChange={(e) => set(i, { label: e.target.value })} className="auto">
              {ADDRESS_LABELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <div className="row">
              <label className="primary-pick">
                <input type="radio" name={`${group}-primary`} checked={a.isPrimary} onChange={() => makePrimary(i)} />
                <span>Primary</span>
              </label>
              <button type="button" className="btn ghost icon" aria-label="Remove address" onClick={() => remove(i)}>✕</button>
            </div>
          </div>
          <label className="field">
            <span>House no., street, subdivision</span>
            <input autoComplete="address-line1" value={a.street} onChange={(e) => set(i, { street: e.target.value })} />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Barangay / district</span>
              <input autoComplete="address-line2" value={a.district} onChange={(e) => set(i, { district: e.target.value })} />
            </label>
            <label className="field">
              <span>City / municipality</span>
              <input autoComplete="address-level2" value={a.city} onChange={(e) => set(i, { city: e.target.value })} />
            </label>
          </div>
          <div className="grid3">
            <label className="field">
              <span>Province</span>
              <input autoComplete="address-level1" value={a.province} onChange={(e) => set(i, { province: e.target.value })} />
            </label>
            <label className="field">
              <span>Postal code</span>
              <input autoComplete="postal-code" inputMode="numeric" value={a.postalCode} onChange={(e) => set(i, { postalCode: e.target.value })} />
            </label>
            <label className="field">
              <span>Country</span>
              <CountrySelect value={a.countryCode} onChange={(v) => set(i, { countryCode: v })} />
            </label>
          </div>
        </fieldset>
      ))}
      <div>
        <button type="button" className="btn" onClick={() => onChange([...value, emptyAddress(value.length === 0)])}>+ Add address</button>
      </div>
    </div>
  );
}
