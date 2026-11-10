export type Theme = 'light' | 'dark';
const KEY = 'clinic.theme';

/** Light unless dark was chosen on this device. */
export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Applies a theme to <html data-theme> (CSS reads it) and the browser UI colour. */
export function applyTheme(theme: Theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#ffffff');
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'light') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}
