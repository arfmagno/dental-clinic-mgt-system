import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../services/theme';
import { Icon } from './Icon';

/** Dark mode switch (light by default; remembered on this device). */
export function ThemeToggle() {
  const [theme, set] = useState<Theme>(getTheme);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Light mode' : 'Dark mode'}
      className="btn ghost icon"
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        setTheme(next);
        set(next);
      }}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}
