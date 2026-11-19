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
import { startingAvatar } from './setup/family';

// A setup whose answer was lost: the server made the family, the parent joined it with the
// passphrase, and the wizard never saved its children. The parent area lets them be added. A save
// never navigates by itself: when done, the page shows what was added and a Done button.

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
});

const ADD = '/parent/children/add';

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
      { path: ADD, element: <AddChildrenPage /> },
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

/** Holds the profile write until `release()`. */
function holdWrites(app: AppServices) {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  const real = app.store.putProfiles.bind(app.store);
  vi.spyOn(app.store, 'putProfiles').mockImplementation(async (...args) => {
    await held;
    return real(...args);
  });
  return () => release();
}

async function addChild(name: string, first: boolean) {
  if (!first) fireEvent.click(screen.getByRole('button', { name: '+ Add another child' }));
  fireEvent.change(screen.getByLabelText('First name or nickname'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
}

async function draft(...names: string[]) {
  await screen.findByLabelText('First name or nickname'); // the form, once the roster has loaded
  for (const [i, name] of names.entries()) await addChild(name, i === 0);
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
  });
}

const names = async (app: AppServices) => (await app.store.allProfiles()).map((p) => p.name).sort();

describe('adding children from the parent area', () => {
  it('a family with no children is offered Add your children', async () => {
    const { router } = await renderParentArea('/parent');
    expect(await screen.findByText(/No children yet/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add your children' }));
    });
    expect(router.state.location.pathname).toBe(ADD);
  });

  it('saves the profiles in this family, says so, and leaves no saved child as a draft', async () => {
    const { app, router } = await renderParentArea(ADD);
    await draft('Mia', 'Leo');
    await save();
    expect(await screen.findByText('Mia and Leo can start playing now.')).toBeTruthy();
    // The saved children are not an editable draft any more.
    expect(screen.queryByRole('button', { name: 'Remove Mia' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save children' })).toBeNull();
    expect(router.state.location.pathname).toBe(ADD); // no navigation by itself
    expect(await names(app)).toEqual(['Leo', 'Mia']);
    expect((await app.store.allProfiles()).every((p) => p.familyId === SERVER_FAMILY)).toBe(true);
    expect((await app.store.allSettings()).some((s) => s.key === 'family')).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(await screen.findByText('Mia and Leo play on this island.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add your children' })).toBeNull();
  });

  it('a failed save writes nothing and keeps the draft; trying again saves each child once', async () => {
    const { app } = await renderParentArea(ADD);
    const real = app.store.putProfiles.bind(app.store);
    vi.spyOn(app.store, 'putProfiles')
      .mockRejectedValueOnce(new Error('QuotaExceededError'))
      .mockImplementation(real);
    await draft('Mia', 'Leo');
    await save();
    expect(
      await screen.findByText('Those children didn’t save on this device. Please try again.'),
    ).toBeTruthy();
    expect(await names(app)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Edit Mia' })).toBeTruthy(); // the draft is kept
    await save();
    expect(await screen.findByText('Mia and Leo can start playing now.')).toBeTruthy();
    expect(await names(app)).toEqual(['Leo', 'Mia']);
  });

  it('while saving, the draft can’t change: Edit, Remove and Add another child are disabled', async () => {
    const { app } = await renderParentArea(ADD);
    const release = holdWrites(app);
    await draft('Mia');
    await save();
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
    expect(await screen.findByText('Mia can start playing now.')).toBeTruthy();
  });

  // Every way a save can overlap navigation: the page never navigates after a save, so wherever
  // the parent went is where they stay.

  it('Back to the island during the save stays on the island', async () => {
    const { app, router } = await renderParentArea(ADD);
    const release = holdWrites(app);
    await draft('Mia');
    await save();
    await act(async () => {
      await router.navigate('/');
    });
    await act(async () => {
      release();
    });
    await waitFor(async () => expect(await names(app)).toEqual(['Mia']));
    expect(router.state.location.pathname).toBe('/');
  });

  it('a save ending while the page is still on screen, but the router has left, stays put', async () => {
    const { app, router } = await renderParentArea(ADD);
    const release = holdWrites(app);
    await draft('Mia');
    await save();
    await act(async () => {
      void router.navigate('/'); // the router takes the new location at once…
      expect(router.state.location.pathname).toBe('/');
      expect(screen.getByRole('heading', { name: 'Add your children' })).toBeTruthy(); // …still shown
      release(); // and the save ends in that same moment
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await names(app)).toEqual(['Mia']);
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByText('island')).toBeTruthy();
  });

  it('Save pressed on the still-shown form after the router left keeps the parent’s destination', async () => {
    const { app, router } = await renderParentArea(ADD);
    await draft('Mia');
    await act(async () => {
      void router.navigate('/'); // the browser's Back to the island…
      const island = router.state.location.key;
      // …and Save on the form that is still on screen, before the route change is drawn.
      fireEvent.click(screen.getByRole('button', { name: 'Save children' }));
      await new Promise((r) => setTimeout(r, 50));
      expect(router.state.location.key).toBe(island);
    });
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByText('island')).toBeTruthy();
    expect(await names(app)).toEqual(['Mia']);
  });

  it('a jump to another Add children entry during the save stays there, showing what was added', async () => {
    const { app, router } = await renderParentArea(ADD, [ADD, '/parent', ADD]);
    const release = holdWrites(app);
    await draft('Mia');
    await save();
    await act(async () => {
      await router.navigate(-2); // the history menu, while the save runs
    });
    const jumpedTo = router.state.location.key;
    await act(async () => {
      release();
    });
    expect(await screen.findByText('Mia can start playing now.')).toBeTruthy();
    expect(router.state.location.key).toBe(jumpedTo);
    expect(await names(app)).toEqual(['Mia']);
  });

  it('after a jump to another Add children entry, a save completes', async () => {
    const { app, router } = await renderParentArea(ADD, [ADD, '/parent', ADD]);
    await screen.findByRole('heading', { name: 'Add your children' });
    const before = router.state.location.key;
    await act(async () => {
      await router.navigate(-2);
    });
    expect(router.state.location.key).not.toBe(before);
    await draft('Mia');
    await save();
    expect(await screen.findByText('Mia can start playing now.')).toBeTruthy();
    expect(await names(app)).toEqual(['Mia']);
  });

  it('Forward during the save (to the parent home) stays there', async () => {
    const { app, router } = await renderParentArea(ADD, [ADD, '/parent']);
    const release = holdWrites(app);
    await draft('Mia');
    await save();
    await act(async () => {
      await router.navigate(1);
    });
    await act(async () => {
      release();
    });
    expect(await screen.findByText('Mia plays on this island.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/parent');
    expect(router.state.historyAction).toBe('POP');
  });

  it('Back after Done shows who plays here, not a form for a second first roster', async () => {
    const { app, router } = await renderParentArea('/parent');
    const add = await screen.findByRole('button', { name: 'Add your children' });
    await act(async () => {
      fireEvent.click(add);
    });
    await draft('Mia', 'Leo');
    await save();
    const done = await screen.findByRole('button', { name: 'Done' });
    await act(async () => {
      fireEvent.click(done);
    });
    await screen.findByText('Mia and Leo play on this island.');
    await act(async () => {
      await router.navigate(-1); // the browser's Back, to the Add children entry
    });
    expect(router.state.location.pathname).toBe(ADD);
    expect(await screen.findByText('Mia and Leo play on this island already.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save children' })).toBeNull();
    expect(screen.queryByLabelText('First name or nickname')).toBeNull();
    expect(await names(app)).toEqual(['Leo', 'Mia']);
  });

  it('a fresh visit (a reload) after the save shows who plays here, with no form', async () => {
    const { app } = await renderParentArea(ADD);
    await draft('Mia');
    await save();
    await screen.findByText('Mia can start playing now.');
    cleanup(); // the page goes away (a reload), the same device's store stays
    const router = createMemoryRouter(
      [
        { path: '/parent', element: <ParentHome /> },
        { path: ADD, element: <AddChildrenPage /> },
      ],
      { initialEntries: [ADD] },
    );
    const api = { logout: vi.fn(), pairStart: vi.fn() } as unknown as ParentApi;
    render(
      <AppProviders services={app}>
        <ParentContextForTests api={api} gate={createParentGate({ store: app.store, api })}>
          <RouterProvider router={router} />
        </ParentContextForTests>
      </AppProviders>,
    );
    expect(await screen.findByText('Mia plays on this island already.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save children' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back to the parent area' }));
    });
    expect(router.state.location.pathname).toBe('/parent');
  });

  it('children saved elsewhere during the save (another tab): this save is refused, nothing doubles', async () => {
    const { app } = await renderParentArea(ADD);
    const release = holdWrites(app);
    await draft('Mia');
    await save(); // held before its transaction starts
    // Another tab saves its first roster meanwhile (written past this page's held save).
    const merged = await app.store.mergeProfiles(
      [
        {
          id: '019a0000-0000-7000-8000-0000000ac0c3',
          familyId: SERVER_FAMILY,
          name: 'Ana',
          birthYear: 2019,
          grade: 'K',
          advanced: false,
          avatar: startingAvatar(app.content.store.gameData),
          picturePasswordHash: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      { source: 'server' },
    );
    expect(merged).toBe(1);
    await act(async () => {
      release();
    });
    expect(await screen.findByText('Ana plays on this island already.')).toBeTruthy();
    expect(await names(app)).toEqual(['Ana']);
  });

  it('needs at least one child before saving', async () => {
    const { app } = await renderParentArea(ADD);
    fireEvent.click(await screen.findByRole('button', { name: 'Save children' }));
    expect(screen.getByText('Add at least one child to continue.')).toBeTruthy();
    expect(await app.store.allProfiles()).toEqual([]);
  });
});
