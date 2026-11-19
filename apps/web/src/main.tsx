import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-700.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { launchApp } from '@/app/pwa/launch';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const render = () =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Production builds register the service worker after load; an update waits for the next launch
// (06 §8, src/app/pwa/launch.ts). `pnpm dev` has no service worker.
launchApp({
  container:
    import.meta.env.PROD && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  render,
  afterLoad: (run) => {
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  },
});
