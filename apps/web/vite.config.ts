import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Palette (05 §11); mirrors the design tokens in packages/ui/src/tokens/theme.css.
const THEME_COLOR = '#1f7a8c';
const BACKGROUND_COLOR = '#f4e3c3';

/** Vite's default `server.fs.deny`, plus `pnpm secrets:link` output (apps/api/.dev.vars). */
export const SECRET_FILE_DENY = [
  '.env',
  '.env.*',
  '*.{crt,pem}',
  '**/.git/**',
  '**/.dev.vars',
  '**/.dev.vars.*',
] as const;

// 02 §3: Vite on :5173 proxies /api to `wrangler dev` on :8787 so the browser sees one origin.
// `--mode https` (pnpm dev:https) adds a self-signed certificate for LAN tablet testing.
export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // The new service worker waits for the next app launch (06 §8); see src/sw.ts.
      registerType: 'prompt',
      injectRegister: 'auto',
      includeManifestIcons: false,
      injectManifest: {
        // Empty precache for the scaffold. The app shell, content and audio join the precache
        // with the offline issue (02 §1, §6).
        // (vite-plugin-pwa always adds manifest.webmanifest itself; that is the only entry.)
        globPatterns: [],
      },
      manifest: {
        name: 'Number Island',
        short_name: 'Number Island',
        description: 'A cozy island math adventure.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
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
        // network. Keep Vite's defaults and also deny the Worker's secrets file (08 §6).
        deny: [...SECRET_FILE_DENY],
      },
      proxy: {
        '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
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
