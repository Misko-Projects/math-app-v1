import { expect, type Page, test } from '@playwright/test';

// The PWA (W00, 02 §1, 06 §1, §8): an installable manifest with PNG icons, and a service worker
// that precaches the shell, the content JSON and the narration audio so the app starts offline.

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

// A fresh browser context is a brand-new device: the app opens on the welcome screen.
const heading = (page: Page) => page.getByRole('heading', { level: 1, name: /Number Island/ });

/** Opens the app and waits until the service worker is active (precache complete) and in control. */
async function openControlled(page: Page): Promise<void> {
  await page.goto('/');
  await expect(heading(page)).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first install claims the open page (src/sw.ts); reload once if that has not happened.
  const controlled = await page
    .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!controlled) {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test.describe('PWA', () => {
  // Installing the worker precaches ~1,000 files (mostly narration clips), which takes 10–20 s
  // against `wrangler dev`; the default 30 s test timeout leaves too little headroom on CI.
  test.describe.configure({ timeout: 90_000 });

  test('links an installable manifest with PNG icons that load', async ({ page, browserName }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const res = await page.request.get(href as string);
    expect(res.status()).toBe(200);
    const manifest = (await res.json()) as {
      name?: string;
      short_name?: string;
      display?: string;
      start_url?: string;
      scope?: string;
      icons?: ManifestIcon[];
    };
    expect(manifest.name).toBe('Number Island');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');

    const icons = manifest.icons ?? [];
    const wanted = [
      { sizes: '192x192', purpose: 'any', px: 192 },
      { sizes: '512x512', purpose: 'any', px: 512 },
      { sizes: '512x512', purpose: 'maskable', px: 512 },
    ];
    for (const want of wanted) {
      const icon = icons.find(
        (i) =>
          i.type === 'image/png' &&
          i.sizes === want.sizes &&
          (i.purpose ?? 'any').split(' ').includes(want.purpose),
      );
      expect(icon, `${want.sizes} ${want.purpose} PNG icon`).toBeDefined();
      const iconRes = await page.request.get((icon as ManifestIcon).src);
      expect(iconRes.status()).toBe(200);
      expect(iconRes.headers()['content-type']).toContain('image/png');
      expect(pngSize(await iconRes.body())).toEqual({ width: want.px, height: want.px });
    }

    // Chrome's own installability check (the criteria behind the install prompt).
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      const { errors } = await cdp.send('Page.getAppManifest');
      expect(errors).toEqual([]);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors).toEqual([]);
    }
  });

  test('registers a service worker that controls the page', async ({ page }) => {
    await openControlled(page);
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        scope: reg ? new URL(reg.scope).pathname : null,
        script: navigator.serviceWorker.controller?.scriptURL ?? null,
        state: navigator.serviceWorker.controller?.state ?? null,
      };
    });
    expect(sw.scope).toBe('/');
    expect(sw.script).toMatch(/\/sw\.js$/);
    expect(sw.state).toBe('activated');
  });

  test('boots offline from the precache: shell, content, narration and deep links', async ({
    page,
    context,
  }) => {
    await openControlled(page);
    await context.setOffline(true);

    const content: { path: string; status: number; fromServiceWorker: boolean }[] = [];
    page.on('response', (r) => {
      const { pathname } = new URL(r.url());
      if (pathname.startsWith('/content/')) {
        content.push({
          path: pathname,
          status: r.status(),
          fromServiceWorker: r.fromServiceWorker(),
        });
      }
    });

    const nav = await page.reload();
    expect(nav?.fromServiceWorker()).toBe(true);
    await expect(heading(page)).toBeVisible();

    // The content (02 §6: fetched as assets) came from the service worker, not the network.
    expect(content.map((c) => c.path)).toContain('/content/index.json');
    expect(content.map((c) => c.path)).toContainEqual(
      expect.stringMatching(/^\/content\/narration\.[0-9a-f]{8}\.json$/),
    );
    for (const c of content)
      expect(c, c.path).toMatchObject({ status: 200, fromServiceWorker: true });

    const offline = await page.evaluate(async () => {
      const manifestRes = await fetch('/audio/manifest.json');
      const audio = (await manifestRes.json()) as { clips: Record<string, { file: string }> };
      const files = [...new Set(Object.values(audio.clips).map((c) => c.file))];
      const clip = await fetch(`/audio/${files[0]}`);
      const cached = new Set<string>();
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) cached.add(new URL(req.url).pathname);
      }
      let api: string;
      try {
        api = `HTTP ${(await fetch('/api/health')).status}`;
      } catch {
        api = 'network error';
      }
      return {
        clipOk: clip.ok,
        clipType: clip.headers.get('content-type'),
        clipBytes: (await clip.arrayBuffer()).byteLength,
        missingClips: files.filter((f) => !cached.has(`/audio/${f}`)),
        clipCount: files.length,
        cachedApi: [...cached].filter((p) => p.startsWith('/api/')),
        api,
      };
    });
    // Narration audio: the manifest and every clip are precached.
    expect(offline.clipCount).toBeGreaterThan(0);
    expect(offline.missingClips).toEqual([]);
    expect(offline.clipOk).toBe(true);
    expect(offline.clipType).toContain('audio/ogg');
    expect(offline.clipBytes).toBeGreaterThan(0);
    // The API is never cached: offline it fails like any network request.
    expect(offline.cachedApi).toEqual([]);
    expect(offline.api).toBe('network error');

    // An /api navigation (address bar) is never answered with the app shell: offline it fails.
    // (In its own tab: the failed load leaves that tab on the browser's error page.)
    // The same for the bare namespace with a query string.
    for (const address of ['/api/health', '/api?probe=1', '/api']) {
      const apiTab = await context.newPage();
      const apiNav = await apiTab.goto(address).then(
        (r) => `answered ${r?.status()} ${r?.fromServiceWorker() ? 'from the service worker' : ''}`,
        () => 'network error',
      );
      expect(apiNav, address).toBe('network error');
      await apiTab.close();
    }

    // The engine's item core (02 §6a) is in the precache: the app boots offline with it. Its
    // file is the one that carries the item-core marker.
    const itemCore = await page.evaluate(async (mark) => {
      const found: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          const { pathname } = new URL(req.url);
          if (!/^\/assets\/[^/]+\.js$/.test(pathname)) continue;
          const body = await (await cache.match(req))?.text();
          if (body?.includes(mark)) found.push(pathname);
        }
      }
      return found;
    }, 'number-island:item-core/generators');
    expect(itemCore).toHaveLength(1);

    // A deep link starts offline too: the service worker answers with the app shell.
    const deep = await page.goto('/play');
    expect(deep?.fromServiceWorker()).toBe(true);
    await expect(heading(page)).toBeVisible();

    // A page that loads on demand, never opened online, opens offline in a new tab: its own
    // file comes from the service worker too.
    const joinTab = await context.newPage();
    const scripts: { path: string; status: number; fromServiceWorker: boolean }[] = [];
    joinTab.on('response', (r) => {
      const { pathname } = new URL(r.url());
      if (/^\/assets\/JoinPage-[^/]+\.js$/.test(pathname)) {
        scripts.push({
          path: pathname,
          status: r.status(),
          fromServiceWorker: r.fromServiceWorker(),
        });
      }
    });
    const join = await joinTab.goto('/join');
    expect(join?.fromServiceWorker()).toBe(true);
    await expect(
      joinTab.getByRole('heading', { level: 1, name: 'Join your family’s island' }),
    ).toBeVisible();
    expect(scripts).toEqual([expect.objectContaining({ status: 200, fromServiceWorker: true })]);
    await joinTab.close();
  });
});
