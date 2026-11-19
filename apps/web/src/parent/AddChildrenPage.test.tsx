import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { SERVER_DEVICE, SERVER_FAMILY, TOKEN, testDevice } from '@/app/boot/boot.test-support';
import { AddChildrenPage } from './AddChildrenPage';
import type { ParentApi } from './api';
import { createParentGate } from './gate';
import { ParentContextForTests } from './ParentContext';
import { ParentHome } from './ParentHome';

// A setup whose answer was lost: the server made the family, the parent joined it with the
// passphrase, and the wizard never saved its children. The parent area lets them be added.

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

async function renderParentArea(path: string) {
  const device = testDevice();
  restore = device.enableLiveQueries();
  const app = await device.boot();
  booted.push(app);
  await app.sync.adopt({ familyId: SERVER_FAMILY, deviceId: SERVER_DEVICE, deviceToken: TOKEN });
  const api = { logout: vi.fn(), pairStart: vi.fn() } as unknown as ParentApi;
  const gate = createParentGate({ store: app.store, api });
  const router = createMemoryRouter(
    [
      { path: '/parent', element: <ParentHome /> },
      { path: '/parent/children/add', element: <AddChildrenPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <AppProviders services={app}>
      <ParentContextForTests api={api} gate={gate}>
        <RouterProvider router={router} />
      </ParentContextForTests>
    </AppProviders>,
  );
  return { app, router };
}

describe('adding children from the parent area', () => {
  it('a family with no children is offered Add your children', async () => {
    const { router } = await renderParentArea('/parent');
    expect(await screen.findByText(/No children yet/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add your children' }));
    });
    expect(router.state.location.pathname).toBe('/parent/children/add');
  });

  it('saves the children’s profiles in this family, and leaves the family settings alone', async () => {
    const { app, router } = await renderParentArea('/parent/children/add');
    await screen.findByRole('heading', { name: 'Add your children' });
    fireEvent.change(screen.getByLabelText('First name or nickname'), {
      target: { value: 'Mia' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
    });
    // Back on the parent home, which now lists the child.
    expect(await screen.findByText('Mia plays on this island.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/parent');
    expect(screen.queryByRole('button', { name: 'Add your children' })).toBeNull();
    const profiles = await app.store.allProfiles();
    expect(profiles.map((p) => [p.name, p.familyId])).toEqual([['Mia', SERVER_FAMILY]]);
    expect((await app.store.allSettings()).some((s) => s.key === 'family')).toBe(false);
  });

  it('needs at least one child before saving', async () => {
    const { app } = await renderParentArea('/parent/children/add');
    await screen.findByRole('heading', { name: 'Add your children' });
    fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
    expect(screen.getByText('Add at least one child to continue.')).toBeTruthy();
    expect(await app.store.allProfiles()).toEqual([]);
  });
});
