import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { isDesktop } from './services/desktop';
import { applyTheme } from './services/theme';
import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';

// Apply the saved theme (light unless dark was chosen) before the first paint.
applyTheme();

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
