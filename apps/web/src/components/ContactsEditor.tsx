import { CONTACT_TYPES, type ContactType } from '@clinic/shared';
import type { ContactInput } from '../services/patientService';

const PLACEHOLDER: Record<ContactType, string> = {
  phone: '0917 123 4567',
  email: 'name@example.com',
  messenger: 'Messenger name or link',
  other: 'Contact detail',
};

interface Props {
  value: ContactInput[];
  onChange(v: ContactInput[]): void;
}

/** A patient can have any number of contacts: phone, email, Messenger, other. */
export function ContactsEditor({ value, onChange }: Props) {
  const set = (i: number, patch: Partial<ContactInput>) => onChange(value.map((c, j) => (i === j ? { ...c, ...patch } : c)));
  return (
    <div className="stack tight">
      {value.map((c, i) => (
        <div className="contact-row" key={c.id ?? `new-${i}`}>
          <select aria-label="Contact type" value={c.type} onChange={(e) => set(i, { type: e.target.value as ContactType })}>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <input
            aria-label="Contact value"
            type={c.type === 'email' ? 'email' : 'text'}
            inputMode={c.type === 'phone' ? 'tel' : undefined}
            placeholder={PLACEHOLDER[c.type]}
            value={c.value}
            onChange={(e) => set(i, { value: e.target.value })}
          />
          <input aria-label="Label" className="label-input" placeholder="Label (e.g. Mother)" value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
          <button type="button" className="btn ghost icon" aria-label="Remove contact" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div>
        <button type="button" className="btn" onClick={() => onChange([...value, { type: 'phone', value: '', label: '', isPrimary: value.length === 0 }])}>
          + Add contact
        </button>
      </div>
    </div>
  );
}
