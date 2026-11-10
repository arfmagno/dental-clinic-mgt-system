import { useState } from 'react';
import { getThemePref, setThemePref, type ThemePref } from '../services/theme';

const OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'Match device', icon: '🖥️' },
];

/** Light / dark / match-device appearance switch (remembered on this device). */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  return (
    <div className="seg theme-toggle" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          className={pref === o.value ? 'on' : ''}
          title={o.label}
          onClick={() => (setThemePref(o.value), setPref(o.value))}
        >
          <span aria-hidden>{o.icon}</span>
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
