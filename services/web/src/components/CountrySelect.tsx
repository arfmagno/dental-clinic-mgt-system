import { useMemo } from 'react';
import { countryOptions } from '@clinic/shared';

interface Props {
  value: string;
  onChange(code: string): void;
  id?: string;
  allowEmpty?: boolean;
  'aria-label'?: string;
}

/** Dropdown of countries (ISO codes stored). Philippines first, then alphabetical. */
export function CountrySelect({ value, onChange, id, allowEmpty = true, ...rest }: Props) {
  const options = useMemo(() => countryOptions(), []);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={rest['aria-label']}>
      {allowEmpty && <option value="">— Not specified —</option>}
      {options.map((c) => (
        <option key={c.code} value={c.code}>{c.name}</option>
      ))}
    </select>
  );
}
