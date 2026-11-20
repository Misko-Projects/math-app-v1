import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from '@/app/boot/boot.test-support';
import { routes } from '@/app/router';
import type { ParentApi } from './api';
import { createParentGate } from './gate';
import { ParentContextForTests } from './ParentContext';
import { ParentHome } from './ParentHome';

// No children stored on this device. The device can't tell an empty family from children that
// haven't arrived yet (a failed first sync after pairing), so the parent area only says so and
// suggests the safe step, Sync now. It never suggests anything that erases data.

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

describe('<ParentHome> for a family with no children', () => {
  it('says so and suggests Sync now, with nothing destructive and no way to add children', async () => {
    const device = testDevice();
    restore = device.enableLiveQueries();
    const app = await device.boot();
    booted.push(app);
    await app.sync.adopt({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN });
    const api = { logout: vi.fn(), pairStart: vi.fn() } as unknown as ParentApi;
    const router = createMemoryRouter([{ path: '/parent', element: <ParentHome /> }], {
      initialEntries: ['/parent'],
    });
    render(
      <AppProviders services={app}>
        <ParentContextForTests api={api} gate={createParentGate({ store: app.store, api })}>
          <RouterProvider router={router} />
        </ParentContextForTests>
      </AppProviders>,
    );
    expect(await screen.findByText('No children on this island yet.')).toBeTruthy();
    // The hint and Sync now follow the device's paired state, a live query that can arrive just
    // after the empty roster does.
    expect(
      await screen.findByText(
        (_, el) =>
          el?.textContent === 'Just paired this device? Tap Sync now to fetch your family.',
      ),
    ).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/db:reset|erase|interrupted/i);
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
    expect(await app.store.allProfiles()).toEqual([]);
  });

  it('a signed-out device with no children gets no Sync hint (it has no Sync now button)', async () => {
    const device = testDevice();
    restore = device.enableLiveQueries();
    const app = await device.boot();
    booted.push(app);
    // Never paired: no device token, so This device offers joining instead of syncing.
    expect((await app.store.device()).deviceToken).toBeUndefined();
    const api = { logout: vi.fn(), pairStart: vi.fn() } as unknown as ParentApi;
    const router = createMemoryRouter([{ path: '/parent', element: <ParentHome /> }], {
      initialEntries: ['/parent'],
    });
    render(
      <AppProviders services={app}>
        <ParentContextForTests api={api} gate={createParentGate({ store: app.store, api })}>
          <RouterProvider router={router} />
        </ParentContextForTests>
      </AppProviders>,
    );
    expect(await screen.findByText('No children on this island yet.')).toBeTruthy();
    expect(screen.queryByText(/Just paired this device\?/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('no app screen recommends resetting the island server', () => {
    // Every source file of the app (tests aside): none may tell a parent to run the reset.
    // From the repo root (pnpm test) or from apps/web (vitest there).
    const src = [join(process.cwd(), 'apps/web/src'), join(process.cwd(), 'src')].find((d) =>
      existsSync(join(d, 'parent/ParentHome.tsx')),
    );
    if (!src) throw new Error('apps/web/src not found');
    // The app's own screens, and the children's narration (all spoken and shown child copy).
    const narration = join(src, '../../../packages/content/narration');
    const files = [src, narration].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(tsx?|ya?ml|json)$/.test(f) && !/\.test\.|test-support/.test(f))
        .map((f) => join(dir, f)),
    );
    expect(files.some((f) => f.endsWith('ParentHome.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('ui.yaml'))).toBe(true);
    const offending = files.filter((f) => readFileSync(f, 'utf8').includes('db:reset'));
    expect(offending).toEqual([]);
  });

  it('the former Add children address is no page of its own: it falls to the redirect home', () => {
    const matched = matchRoutes(routes, '/parent/children/add');
    expect(matched?.at(-1)?.route.path).toBe('*');
  });
});
