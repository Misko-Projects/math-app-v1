import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { contentAssets } from './content-assets';

// Palette (05 §11); mirrors the design tokens in packages/ui/src/tokens/theme.css.
const THEME_COLOR = '#1f7a8c';
const BACKGROUND_COLOR = '#f4e3c3';

const MB = 1024 * 1024;
/** 02 §6: shell + content + K–3 narration audio ≤ 60 MB. The build fails above it. */
export const PRECACHE_BUDGET_BYTES = 60 * MB;
/** Workbox skips (with a warning) any single file above this; content JSON is the largest. */
const MAX_PRECACHE_FILE_BYTES = 10 * MB;

type PrecacheEntry = { url: string; size: number };

/** Workbox manifest transform: prints the precache size and enforces the budget. */
export async function checkPrecacheBudget<T extends PrecacheEntry>(
  entries: T[],
): Promise<{ manifest: T[] }> {
  const total = entries.reduce((sum, e) => sum + e.size, 0);
  const summary = `precache: ${entries.length} entries, ${(total / MB).toFixed(2)} MB (budget ${PRECACHE_BUDGET_BYTES / MB} MB)`;
  if (total > PRECACHE_BUDGET_BYTES) throw new Error(`${summary}: over the 02 §6 budget`);
  console.log(summary);
  return { manifest: entries };
}

/** Vite's default `server.fs.deny`, plus `pnpm secrets:link` output (apps/api/.dev.vars) and local D1 state. */
export const SECRET_FILE_DENY = [
  '.env',
  '.env.*',
  '*.{crt,pem}',
  '**/.git/**',
  '**/.dev.vars',
  '**/.dev.vars.*',
  // Local D1 state (apps/api/.wrangler): child profiles, the event log and credential hashes.
  '**/.wrangler/**',
] as const;

// 02 §3: Vite on :5173 proxies /api to `wrangler dev` on :8787 so the browser sees one origin.
// `--mode https` (pnpm dev:https) adds a self-signed certificate for LAN tablet testing.
export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    // Content JSON as static assets under /content/ (02 §6).
    contentAssets(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // The new service worker waits for the next app launch (06 §8): src/app/pwa/launch.ts
      // registers it and src/sw.ts never calls skipWaiting(), so the browser activates an update
      // only once every app window has closed.
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      injectManifest: {
        // Classic script: the app registers /sw.js without `type: 'module'`.
        rollupFormat: 'iife',
        // 02 §1, §6: the app shell, every content JSON file (fetched, never bundled) and the
        // narration audio, so the whole app works offline. Not the `.vite/` build manifest, not
        // the woff fallbacks (Chrome uses woff2), and never anything under /api/.
        // (vite-plugin-pwa adds manifest.webmanifest itself.)
        globPatterns: [
          '**/*.{html,js,css,woff2,svg,png}',
          'content/*.json',
          'audio/manifest.json',
          'audio/*.ogg',
        ],
        maximumFileSizeToCacheInBytes: MAX_PRECACHE_FILE_BYTES,
        manifestTransforms: [checkPrecacheBudget],
      },
      manifest: {
        name: 'Number Island',
        short_name: 'Number Island',
        description: 'A cozy island math adventure.',
        lang: 'en',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ];
  if (mode === 'https') plugins.push(basicSsl());

  return {
    plugins,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: {
        // Vite may serve any file under the workspace root, and `pnpm dev:lan` exposes it on the home
        // network. Keep Vite's defaults and also deny the Worker's secrets file (08 §6) and its local
        // D1 database (apps/api/.wrangler, 08 §5).
        deny: [...SECRET_FILE_DENY],
      },
      proxy: {
        // `xfwd` adds X-Forwarded-For/-Proto, which the API trusts only from loopback: per-client
        // login rate limits for tablets on `pnpm dev:lan`, and `Secure` cookies under
        // `pnpm dev:https` (08 §2, apps/api/src/lib/http.ts).
        '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false, xfwd: true },
      },
    },
    preview: { port: 4173, strictPort: true },
    build: {
      // scripts/bundle-size.mjs reads dist/.vite/manifest.json.
      manifest: true,
      target: 'es2023',
    },
  };
});
