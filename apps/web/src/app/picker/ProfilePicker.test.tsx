import '@/island/island.test-support';
import { defaultChildSettings, settingsKey } from '@number-island/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHILD_G2, CHILD_K, profile } from '@/data/store.test-support';
import { ChildHomePage } from '@/island/ChildHomePage';
import { PlayLayout } from '@/island/PlayLayout';
import { AppProviders } from '../AppServices';
import type { AppServices } from '../boot/boot';
import { testDevice } from '../boot/boot.test-support';
import { RootLayout } from '../RootLayout';
import { StartGate } from '../StartGate';
import { initialOf } from './ChildAvatar';
import { ProfilePicker, pickerColumns } from './ProfilePicker';
import { hashPicturePassword } from './picturePassword';

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
  localStorage.clear();
});

async function renderPicker(
  opts: { leoPictures?: Parameters<typeof hashPicturePassword>[1]; quiet?: boolean } = {},
) {
  const device = testDevice();
  restore = device.enableLiveQueries();
  const app = await device.boot();
  booted.push(app);
  await app.store.putProfile({ ...profile(CHILD_K, 'K', 'Mia'), createdAt: 1 });
  await app.store.putProfile({
    ...profile(CHILD_G2, '2', 'Leo'),
    createdAt: 2,
    picturePasswordHash: opts.leoPictures
      ? await hashPicturePassword(CHILD_G2, opts.leoPictures, { iterations: 1000 })
      : null,
  });
  if (opts.quiet) {
    // Quiet all day long except one minute (the test clock is 09:00 in Chicago).
    await app.store.putSettings({
      key: settingsKey(CHILD_K),
      value: { ...defaultChildSettings('K'), quietHours: { start: '09:00', end: '08:59' } },
    });
  }
  const say = vi.spyOn(app.audio, 'say');
  const sayText = vi.spyOn(app.audio, 'sayText');
  const unlock = vi.spyOn(app.audio, 'unlock');
  const router = createMemoryRouter([
    {
      path: '/',
      element: <RootLayout />,
      children: [
        {
          index: true,
          element: (
            <StartGate>
              <ProfilePicker />
            </StartGate>
          ),
        },
        {
          path: 'play/:childId',
          Component: PlayLayout,
          children: [{ index: true, Component: ChildHomePage }],
        },
        { path: 'parent', element: <p>parent area</p> },
      ],
    },
  ]);
  render(
    <AppProviders services={app}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  // While audio is locked, Tap to start covers the picker (hidden from assistive tech too).
  await screen.findByRole('button', { name: 'Mia', hidden: true });
  return { app, router, say, sayText, unlock };
}

const sessionEvents = async (app: AppServices) =>
  (await app.store.events()).filter((e) => e.type.startsWith('session.'));

/** Taps through the Tap to start overlay (jsdom has no AudioContext: audio becomes unavailable). */
async function tapToStart() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('tap-to-start'));
  });
  await waitFor(() => expect(screen.queryByTestId('tap-to-start')).toBeNull());
}

describe('<ProfilePicker>', () => {
  it('shows every child as a big card, in created order, with no network status', async () => {
    await renderPicker();
    await tapToStart();
    const cards = screen.getAllByRole('button', { name: /^(Mia|Leo)$/ });
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Mia', 'Leo']);
    expect(screen.getByRole('heading', { level: 1, name: 'Who is playing?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hear it again' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Grown-ups: press and hold for 2 seconds' }),
    ).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('covers the picker with Tap to start while audio is locked; the tap unlocks and asks', async () => {
    const { say, unlock } = await renderPicker();
    expect(screen.getByTestId('tap-to-start').getAttribute('aria-label')).toBe('Tap to start!');
    // Nothing is spoken before the unlock.
    expect(say).not.toHaveBeenCalledWith('ui.profile.who-is-playing', undefined);
    await tapToStart();
    expect(unlock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(say).toHaveBeenCalledWith('ui.profile.who-is-playing', undefined));
    // The replay button asks again.
    say.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Hear it again' }));
    expect(say).toHaveBeenCalledWith('ui.profile.who-is-playing', undefined);
  });

  it('keeps the cards under Tap to start inert: a key press there starts nothing', async () => {
    const { app, sayText, unlock } = await renderPicker();
    const card = screen.getByRole('button', { name: 'Mia', hidden: true });
    expect(card.closest('main')?.hasAttribute('inert')).toBe(true);
    // jsdom doesn't enforce inert, so this also checks the picker's own guard.
    await act(async () => {
      fireEvent.click(card); // what Enter on a focused button dispatches
    });
    expect(sayText).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(await sessionEvents(app)).toEqual([]);
    expect(screen.getByTestId('tap-to-start')).toBeTruthy();
    await tapToStart();
    expect(screen.getByRole('button', { name: 'Mia' }).closest('main')?.hasAttribute('inert')).toBe(
      false,
    );
  });

  it('asks who is playing on entry when audio already runs (no overlay)', async () => {
    const device = testDevice();
    restore = device.enableLiveQueries();
    const app = await device.boot();
    booted.push(app);
    Object.defineProperty(app.audio, 'state', { get: () => 'running' });
    await app.store.putProfile(profile(CHILD_K, 'K', 'Mia'));
    const say = vi.spyOn(app.audio, 'say');
    const router = createMemoryRouter([{ path: '/', element: <ProfilePicker /> }]);
    render(
      <AppProviders services={app}>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    await screen.findByRole('button', { name: 'Mia' });
    expect(screen.queryByTestId('tap-to-start')).toBeNull();
    expect(say).toHaveBeenCalledWith('ui.profile.who-is-playing', undefined);
  });

  it('speaks the tapped child’s name, starts the session and opens the child home', async () => {
    const { app, router, sayText } = await renderPicker();
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    });
    expect(sayText).toHaveBeenCalledWith('Mia', { voice: 'narrator' });
    expect(await screen.findByTestId('child-home')).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/play/${CHILD_K}`);
    const events = await sessionEvents(app);
    expect(events.map((e) => e.type)).toEqual(['session.started']);
    expect(events[0]?.childId).toBe(CHILD_K);

    // Home ends the session (child-exit) and returns to the picker.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Go home' }));
    });
    await screen.findByRole('button', { name: 'Mia' });
    expect(router.state.location.pathname).toBe('/');
    await waitFor(async () =>
      expect((await sessionEvents(app)).map((e) => e.type)).toEqual([
        'session.started',
        'session.ended',
      ]),
    );
    const ended = (await sessionEvents(app))[1];
    expect(ended?.payload).toMatchObject({ reason: 'child-exit' });
  });

  it('tells the child (and the grown-up) when another window is playing', async () => {
    const { app, say } = await renderPicker();
    await tapToStart();
    vi.spyOn(app.session, 'start').mockResolvedValueOnce({ ok: false, reason: 'elsewhere' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    });
    const overlay = await screen.findByTestId('resting-overlay');
    expect(overlay.getAttribute('data-reason')).toBe('elsewhere');
    expect(
      screen.getByText(
        'Someone is playing in another window. Let\u2019s take turns!'.replace('\u2019', "'"),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/For grown-ups: Number Island is open in another tab or window/),
    ).toBeTruthy();
    // The overlay speaks from a mount effect, which can run just after its DOM appears.
    await waitFor(() => expect(say).toHaveBeenCalledWith('ui.rest.elsewhere', undefined));
    expect(await sessionEvents(app)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Okay!' }));
    await waitFor(() => expect(screen.queryByTestId('resting-overlay')).toBeNull());
  });

  it('shows the resting overlay, and starts nothing, during quiet hours', async () => {
    const { app, say } = await renderPicker({ quiet: true });
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mia' }));
    });
    const overlay = await screen.findByTestId('resting-overlay');
    expect(overlay.getAttribute('data-reason')).toBe('quiet-hours');
    // Quiet hours end at 08:59: the child hears when the island opens again.
    expect(
      screen.getByText('The island is resting. It opens again at 8:59 in the morning!'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(say).toHaveBeenCalledWith('ui.rest.quiet-hours.morning', { at: '8:59' }),
    );
    expect(await sessionEvents(app)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Okay!' }));
    await waitFor(() => expect(screen.queryByTestId('resting-overlay')).toBeNull());
  });
});

describe('picture password pad', () => {
  const tapPictures = async (...names: string[]) => {
    for (const n of names) fireEvent.click(screen.getByRole('button', { name: n }));
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
    });
  };

  it('opens for a child with a picture password; the right pictures let them in', async () => {
    const { app, say } = await renderPicker({ leoPictures: ['crab', 'kite', 'sun'] });
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    });
    const pad = await screen.findByTestId('picture-pad');
    expect(pad).toBeTruthy();
    await waitFor(() => expect(say).toHaveBeenCalledWith('ui.picture.prompt', undefined));
    // Tapping a picture speaks it and fills a slot; undo takes it back.
    fireEvent.click(screen.getByRole('button', { name: 'Crab' }));
    expect(say).toHaveBeenCalledWith('ui.picture.crab', undefined);
    expect(screen.getByTestId('password-slots').getAttribute('data-filled')).toBe('1');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take one back' }));
    expect(screen.getByTestId('password-slots').getAttribute('data-filled')).toBe('0');
    expect(await sessionEvents(app)).toEqual([]);

    await tapPictures('Crab', 'Kite', 'Sun');
    expect(await screen.findByTestId('child-home')).toBeTruthy();
    expect((await sessionEvents(app)).map((e) => e.childId)).toEqual([CHILD_G2]);
  });

  it('a wrong try is gentle and clears the slots; after three, ask a grown-up', async () => {
    const { app, say } = await renderPicker({ leoPictures: ['crab', 'kite', 'sun'] });
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    });
    await screen.findByTestId('picture-pad');

    await tapPictures('Sun', 'Kite', 'Crab');
    expect(await screen.findByText('Let’s try again!'.replace('’', "'"))).toBeTruthy();
    expect(say).toHaveBeenCalledWith('ui.picture.try-again', undefined);
    expect(screen.getByTestId('password-slots').getAttribute('data-filled')).toBe('0');
    // A repeat picture is ignored.
    fireEvent.click(screen.getByRole('button', { name: 'Fish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fish' }));
    expect(screen.getByTestId('password-slots').getAttribute('data-filled')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Take one back' }));

    await new Promise((r) => setTimeout(r, 420)); // the check button's 400 ms debounce
    await tapPictures('Fish', 'Boat', 'Tree');
    await new Promise((r) => setTimeout(r, 420));
    await tapPictures('Shell', 'Flower', 'Turtle');
    expect(await screen.findByText('Ask a grown-up to help you.')).toBeTruthy();
    expect(say).toHaveBeenCalledWith('ui.picture.ask-help', undefined);
    expect(screen.queryByTestId('child-home')).toBeNull();
    expect(await sessionEvents(app)).toEqual([]);

    // The pad still works: the right pictures let him in.
    await new Promise((r) => setTimeout(r, 420));
    await tapPictures('Crab', 'Kite', 'Sun');
    expect(await screen.findByTestId('child-home')).toBeTruthy();
  });

  it('a failed session start after the right pictures returns to the picker', async () => {
    const { app } = await renderPicker({ leoPictures: ['crab', 'kite', 'sun'] });
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    });
    await screen.findByTestId('picture-pad');
    const covered = screen.getByRole('button', { name: 'Leo', hidden: true }).closest('main');
    expect(covered?.hasAttribute('inert')).toBe(true);
    const start = vi.spyOn(app.session, 'start').mockRejectedValueOnce(new Error('disk full'));
    await tapPictures('Crab', 'Kite', 'Sun');
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('picture-pad')).toBeNull());
    expect(screen.queryByTestId('child-home')).toBeNull();
    // The picker works again: Leo can try once more.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    });
    expect(await screen.findByTestId('picture-pad')).toBeTruthy();
  });

  it('closing the pad while the start waits (another window playing) starts nothing', async () => {
    const { app, router } = await renderPicker({ leoPictures: ['crab', 'kite', 'sun'] });
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    });
    await screen.findByTestId('picture-pad');
    // The start waits, as it does while another window still holds the play lock.
    const real = app.session.start.bind(app.session);
    let release: () => void = () => {};
    const waiting = new Promise<void>((r) => {
      release = r;
    });
    const start = vi
      .spyOn(app.session, 'start')
      .mockImplementationOnce(async (childId, trigger, opts) => {
        await waiting;
        return real(childId, trigger, opts);
      });
    await tapPictures('Crab', 'Kite', 'Sun');
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByTestId('picture-pad')).toBeNull());
    await act(async () => {
      release();
      await waiting;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByTestId('child-home')).toBeNull();
    expect(await sessionEvents(app)).toEqual([]);
  });

  it('the back button returns to the picker', async () => {
    await renderPicker({ leoPictures: ['crab', 'kite', 'sun'] });
    await tapToStart();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leo' }));
    });
    await screen.findByTestId('picture-pad');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByTestId('picture-pad')).toBeNull());
  });
});

describe('picker helpers', () => {
  it('balances the rows', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(pickerColumns)).toEqual([1, 2, 3, 4, 3, 3, 4, 4]);
  });

  it('takes the first letter of the name', () => {
    expect(initialOf('mia')).toBe('M');
    expect(initialOf('  Émile')).toBe('É');
    expect(initialOf('')).toBe('');
  });
});
