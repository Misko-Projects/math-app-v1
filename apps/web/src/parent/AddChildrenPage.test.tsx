import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      { path: '/', element: <p>island</p> },
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

  /** Holds every profile write until `release()`. */
  function holdWrites(app: AppServices) {
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    const real = app.store.putProfile.bind(app.store);
    vi.spyOn(app.store, 'putProfile').mockImplementation(async (p) => {
      await held;
      return real(p);
    });
    return () => release();
  }

  async function addMiaAndSave() {
    await screen.findByRole('heading', { name: 'Add your children' });
    fireEvent.change(screen.getByLabelText('First name or nickname'), {
      target: { value: 'Mia' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
    });
  }

  it('while saving, the draft can’t change: Edit, Remove and Add another child are disabled', async () => {
    const { app } = await renderParentArea('/parent/children/add');
    const release = holdWrites(app);
    await addMiaAndSave();
    // Disabled through the step's fieldset (`:disabled` covers that; the `disabled` property doesn't).
    const disabled = (name: string) => screen.getByRole('button', { name }).matches(':disabled');
    expect(disabled('Edit Mia')).toBe(true);
    expect(disabled('Remove Mia')).toBe(true);
    expect(disabled('+ Add another child')).toBe(true);
    expect(disabled('Saving…')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mia' }));
    expect(screen.getByRole('button', { name: 'Edit Mia' })).toBeTruthy(); // still in the draft
    await act(async () => {
      release();
    });
    expect(await screen.findByText('Mia plays on this island.')).toBeTruthy();
  });

  it('a save that ends after the parent left never pulls them back', async () => {
    const { app, router } = await renderParentArea('/parent/children/add');
    const release = holdWrites(app);
    await addMiaAndSave();
    await act(async () => {
      await router.navigate('/'); // Back to the island while the save runs
    });
    await act(async () => {
      release();
    });
    await waitFor(async () => expect((await app.store.allProfiles()).length).toBe(1));
    expect(router.state.location.pathname).toBe('/');
  });

  it('needs at least one child before saving', async () => {
    const { app } = await renderParentArea('/parent/children/add');
    await screen.findByRole('heading', { name: 'Add your children' });
    fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
    expect(screen.getByText('Add at least one child to continue.')).toBeTruthy();
    expect(await app.store.allProfiles()).toEqual([]);
  });
});
