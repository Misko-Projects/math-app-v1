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

// A family with no children: setup was interrupted after the server made the family and before
// the wizard saved its children, and the parent joined it. Children are added only in the Setup
// Wizard (06 §3), so the parent area explains how to run it again, with no other way to write
// profiles.

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

describe('<ParentHome> for a family with no children', () => {
  it('explains what happened and how to set up again, and offers no way to add children', async () => {
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
    expect(screen.getByText(/Setup was interrupted after your island was made/)).toBeTruthy();
    expect(screen.getByText('pnpm db:reset')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
    expect(await app.store.allProfiles()).toEqual([]);
  });

  it('the former Add children address is no page of its own: it falls to the redirect home', () => {
    const matched = matchRoutes(routes, '/parent/children/add');
    expect(matched?.at(-1)?.route.path).toBe('*');
  });
});
