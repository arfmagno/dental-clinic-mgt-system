import { useEffect, useState } from 'react';

/**
 * Optional features, switched per device under Settings → Preferences. All are off by default:
 * the clinic's day-to-day screens stay as simple as possible unless someone wants more.
 */
export type Feature = 'reports';
const KEY = (f: Feature) => `clinic.feature.${f}`;
const EVENT = 'clinic:features';

export function isEnabled(f: Feature): boolean {
  try {
    return localStorage.getItem(KEY(f)) === '1';
  } catch {
    return false;
  }
}

export function setEnabled(f: Feature, on: boolean) {
  try {
    if (on) localStorage.setItem(KEY(f), '1');
    else localStorage.removeItem(KEY(f));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Live value: every screen updates as soon as the switch changes (also in other tabs). */
export function useFeature(f: Feature): boolean {
  const [on, setOn] = useState(() => isEnabled(f));
  useEffect(() => {
    const update = () => setOn(isEnabled(f));
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, [f]);
  return on;
}
