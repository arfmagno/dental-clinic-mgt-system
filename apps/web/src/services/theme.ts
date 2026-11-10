export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'clinic.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Applies a preference to <html data-theme> (CSS reads it) and the browser UI colour. */
export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f172a' : '#0d9488');
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

/** Follow OS changes while the preference is "system". */
export function watchSystemTheme() {
  const m = media();
  const onChange = () => getThemePref() === 'system' && applyTheme('system');
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}
