import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { isDesktop } from './services/desktop';
import { applyTheme } from './services/theme';
import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';

// Apply the saved theme (light unless dark was chosen) before the first paint.
applyTheme();

// Windows has no flag emoji: load a bundled flag font (works offline) for the phone country codes.
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl);

// Registers the service worker that caches the whole app for offline use and applies updates.
// Not needed in the desktop app, which already loads every file from disk.
if (!isDesktop) registerSW({ immediate: true });

// Ask the browser not to evict local data (patient records) under storage pressure.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
