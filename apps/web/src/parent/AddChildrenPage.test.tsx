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

async function renderParentArea(path: string, entries: string[] = [path]) {
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
    { initialEntries: entries, initialIndex: entries.lastIndexOf(path) },
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

  it('a save ending while the page is still on screen, but the router has left, stays put', async () => {
    const { app, router } = await renderParentArea('/parent/children/add');
    const release = holdWrites(app);
    await addMiaAndSave();
    await act(async () => {
      void router.navigate('/'); // the router takes the new location at once…
      expect(router.state.location.pathname).toBe('/');
      expect(screen.getByRole('heading', { name: 'Add your children' })).toBeTruthy(); // …the page is still shown
      release(); // and the save ends in that same moment
      await new Promise((r) => setTimeout(r, 50));
    });
    expect((await app.store.allProfiles()).map((p) => p.name)).toEqual(['Mia']);
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByText('island')).toBeTruthy();
  });

  it('after a jump to another Add children entry, a save still returns to the parent home', async () => {
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
      {
        initialEntries: ['/parent/children/add', '/parent', '/parent/children/add'],
        initialIndex: 2,
      },
    );
    render(
      <AppProviders services={app}>
        <ParentContextForTests api={api} gate={gate}>
          <RouterProvider router={router} />
        </ParentContextForTests>
      </AppProviders>,
    );
    await screen.findByRole('heading', { name: 'Add your children' });
    const before = router.state.location.key;
    await act(async () => {
      await router.navigate(-2); // the browser's history menu: the first Add children entry
    });
    expect(router.state.location.key).not.toBe(before);
    expect(router.state.location.pathname).toBe('/parent/children/add');
    await addMiaAndSave();
    expect(await screen.findByText('Mia plays on this island.')).toBeTruthy();
    expect((await app.store.allProfiles()).map((p) => p.name)).toEqual(['Mia']);
  });

  it('a jump to another Add children entry during the save: no redirect, and the form is free again', async () => {
    const entries = ['/parent/children/add', '/parent', '/parent/children/add'];
    const { app, router } = await renderParentArea('/parent/children/add', entries);
    const release = holdWrites(app);
    await addMiaAndSave();
    const startedOn = router.state.location.key;
    await act(async () => {
      await router.navigate(-2); // the history menu, while the save runs
    });
    const jumpedTo = router.state.location.key;
    expect(jumpedTo).not.toBe(startedOn);
    await act(async () => {
      release();
    });
    await waitFor(async () => expect((await app.store.allProfiles()).length).toBe(1));
    // Stays on the entry the parent chose, with the form released (not stuck on Saving…).
    expect(router.state.location.key).toBe(jumpedTo);
    expect(
      (await screen.findByRole('button', { name: 'Save children' })).matches(':disabled'),
    ).toBe(false);
  });

  it('Forward during the save (to the parent home) stays there', async () => {
    const entries = ['/parent/children/add', '/parent'];
    const { app, router } = await renderParentArea('/parent/children/add', entries);
    // renderParentArea opened the first entry; Forward leads to the parent home.
    const release = holdWrites(app);
    await addMiaAndSave();
    await act(async () => {
      await router.navigate(1);
    });
    await act(async () => {
      release();
    });
    expect(await screen.findByText('Mia plays on this island.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/parent');
    expect(router.state.historyAction).toBe('POP'); // it is the Forward, not a redirect (REPLACE)
  });

  it('needs at least one child before saving', async () => {
    const { app } = await renderParentArea('/parent/children/add');
    await screen.findByRole('heading', { name: 'Add your children' });
    fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
    expect(screen.getByText('Add at least one child to continue.')).toBeTruthy();
    expect(await app.store.allProfiles()).toEqual([]);
  });
});
