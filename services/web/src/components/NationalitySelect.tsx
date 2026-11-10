import { useMemo } from 'react';
import { nationalityOf, nationalityOptions } from '@clinic/shared';

interface Props {
  value: string;
  onChange(code: string): void;
  id?: string;
  required?: boolean;
}

/** Citizenship as a nationality ("Filipino"); stores the country code (PH). Filipino first. */
export function NationalitySelect({ value, onChange, id, required }: Props) {
  const options = useMemo(() => nationalityOptions(), []);
  const known = !value || options.some((o) => o.code === value);
  return (
    <select id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">— Select —</option>}
      {!known && <option value={value}>{nationalityOf(value)}</option>}
      {options.map((o) => (
        <option key={o.code} value={o.code}>{o.label}</option>
      ))}
    </select>
  );
}
