import { useId, useMemo } from 'react';
import { CONTACT_TYPES, DEFAULT_COUNTRY, DIAL_CODES, flagOf, formatPhone, parsePhone, type ContactType } from '@clinic/shared';
import { Icon } from './Icon';
import { emptyContact, withSinglePrimary, type ContactInput } from '../services/patientService';

const PLACEHOLDER: Record<ContactType, string> = {
  phone: '917 123 4567',
  email: 'name@example.com',
  messenger: 'Messenger name or link',
  other: 'Contact detail',
};

interface Props {
  value: ContactInput[];
  onChange(v: ContactInput[]): void;
}

/** Any number of contacts (phone, email, Messenger, other); exactly one is marked primary. */
export function ContactsEditor({ value, onChange }: Props) {
  const group = useId();
  const set = (i: number, patch: Partial<ContactInput>) => onChange(value.map((c, j) => (i === j ? { ...c, ...patch } : c)));
  const makePrimary = (i: number) => onChange(value.map((c, j) => ({ ...c, isPrimary: i === j })));
  const remove = (i: number) => onChange(withSinglePrimary(value.filter((_, j) => j !== i)));

  return (
    <div className="stack tight">
      {value.map((c, i) => (
        <div className="contact-row" key={c.id ?? `new-${i}`}>
          <select aria-label="Contact type" value={c.type} onChange={(e) => set(i, { type: e.target.value as ContactType })}>
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
          {c.type === 'phone' ? (
            <PhoneInput value={c.value} country={c.country} onChange={(phone, country) => set(i, { value: phone, country })} />
          ) : (
            <input
              aria-label="Contact detail"
              type={c.type === 'email' ? 'email' : 'text'}
              placeholder={PLACEHOLDER[c.type]}
              value={c.value}
              onChange={(e) => set(i, { value: e.target.value })}
            />
          )}
          <input aria-label="Contact label" className="label-input" placeholder="Label (e.g. Mother)" value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
          <label className="primary-pick" title="Primary contact">
            <input type="radio" name={`${group}-primary`} checked={c.isPrimary} onChange={() => makePrimary(i)} />
            <span>Primary</span>
          </label>
          <button type="button" className="btn ghost icon" aria-label="Remove contact" onClick={() => remove(i)}><Icon name="x" /></button>
        </div>
      ))}
      <div>
        <button type="button" className="btn" onClick={() => onChange([...value, emptyContact(value.length === 0)])}>+ Add</button>
      </div>
    </div>
  );
}

/** Country code (flag, short code, calling code; Philippines +63 first) and the number itself. */
function PhoneInput({ value, country, onChange }: { value: string; country?: string; onChange(value: string, country: string): void }) {
  const options = useMemo(
    () => Object.keys(DIAL_CODES).sort((a, b) => (a === DEFAULT_COUNTRY ? -1 : b === DEFAULT_COUNTRY ? 1 : a.localeCompare(b))),
    [],
  );
  const parts = parsePhone(value, country);
  return (
    <div className="phone-input">
      <select aria-label="Country code" className="cc" value={parts.country} onChange={(e) => onChange(formatPhone(e.target.value, parts.national), e.target.value)}>
        {options.map((c) => <option key={c} value={c}>{`${flagOf(c)} ${c} +${DIAL_CODES[c]}`}</option>)}
      </select>
      <input
        aria-label="Contact detail"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={PLACEHOLDER.phone}
        value={parts.national}
        onChange={(e) => onChange(formatPhone(parts.country, e.target.value), parts.country)}
      />
    </div>
  );
}
