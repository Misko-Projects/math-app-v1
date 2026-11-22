import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { testDevice } from '@/app/boot/boot.test-support';
import type { SessionTimers } from '@/app/session/SessionController';
import { CHILD_K, profile } from '@/data/store.test-support';
import { ChildHomePage } from './ChildHomePage';
import { PlayLayout } from './PlayLayout';

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
  localStorage.clear();
});

async function renderHome({ startSession = true } = {}) {
  const device = testDevice();
  restore = device.enableLiveQueries();
  const handlers = new Map<number, () => void>();
  let n = 0;
  const timers: SessionTimers = {
    setInterval: (fn) => {
      handlers.set(++n, fn);
      return n;
    },
    clearInterval: (h) => void handlers.delete(h as number),
  };
  const app = await device.boot({
    session: { timers, visibility: { visible: () => true, subscribe: () => () => {} } },
  });
  booted.push(app);
  await app.store.putProfile(profile(CHILD_K, 'K', 'Mia'));
  if (startSession) await app.session.start(CHILD_K);
  const say = vi.spyOn(app.audio, 'say');
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>picker</p> },
      {
        path: '/play/:childId',
        Component: PlayLayout,
        children: [
          { index: true, Component: ChildHomePage },
          { path: 'pier', element: <p>pier</p> },
        ],
      },
    ],
    { initialEntries: [`/play/${CHILD_K}`] },
  );
  render(
    <AppProviders services={app}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  const tick = (ms: number) =>
    act(() => {
      device.clock.advance(ms);
      for (const fn of handlers.values()) fn();
    });
  return { app, router, say, tick };
}

const ended = async (app: AppServices) =>
  (await app.store.events()).filter((e) => e.type === 'session.ended');

describe('<ChildHomePage>', () => {
  it('greets the child once, with a replay button and a Home button', async () => {
    const { say } = await renderHome();
    expect(await screen.findByTestId('child-home')).toBeTruthy();
    // Spoken from an effect once the session is ready: wait for it rather than racing it.
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('ui.home.hello', undefined));
    say.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Hear it again' }));
    expect(say).toHaveBeenCalledWith('ui.home.hello', undefined);
    expect(screen.getByRole('button', { name: 'Go home' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('goes back to the picker without a running session (a reload or a typed URL)', async () => {
    const { router } = await renderHome({ startSession: false });
    await screen.findByText('picker');
    expect(router.state.location.pathname).toBe('/');
  });

  it('at the budget, ends the session as wind-down and shows the calm sunset', async () => {
    const { app, say, tick, router } = await renderHome();
    await screen.findByTestId('child-home');
    tick(9 * 60_000);
    expect(screen.queryByTestId('sunset')).toBeNull();
    tick(60_000); // K budget: 10 minutes (04 §6.1)
    expect(await screen.findByTestId('sunset')).toBeTruthy();
    expect(screen.getByText('Great playing! See you next time!')).toBeTruthy();
    expect(say).toHaveBeenCalledWith('ui.winddown.done', undefined);
    await waitFor(async () => expect(await ended(app)).toHaveLength(1));
    expect((await ended(app))[0]?.payload).toMatchObject({
      reason: 'wind-down',
      activeMs: 10 * 60_000,
    });
    // Okay (or the timer) returns to the picker.
    fireEvent.click(screen.getByRole('button', { name: 'Okay!' }));
    await screen.findByText('picker');
    expect(router.state.location.pathname).toBe('/');
    expect(await ended(app)).toHaveLength(1);
  });

  it('opens the Practice Pier without ending the session; a wind-down that came there plays on return', async () => {
    const { app, router, tick } = await renderHome();
    await screen.findByTestId('child-home');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Let's play!" }));
    });
    await screen.findByText('pier');
    expect(router.state.location.pathname).toBe(`/play/${CHILD_K}/pier`);
    // The budget runs out at the pier, which lets the current item finish and ends nothing itself.
    tick(10 * 60_000);
    expect(await ended(app)).toHaveLength(0);
    await act(async () => {
      await router.navigate(`/play/${CHILD_K}`, { replace: true });
    });
    expect(await screen.findByTestId('sunset')).toBeTruthy();
    await waitFor(async () => expect(await ended(app)).toHaveLength(1));
    expect((await ended(app))[0]?.payload).toMatchObject({ reason: 'wind-down' });
  });

  it('Home ends the session as a child exit', async () => {
    const { app, router } = await renderHome();
    await screen.findByTestId('child-home');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Go home' }));
    });
    await screen.findByText('picker');
    expect(router.state.location.pathname).toBe('/');
    expect((await ended(app))[0]?.payload).toMatchObject({ reason: 'child-exit' });
  });

  it('leaving another way (the back button) also ends the session', async () => {
    const { app, router } = await renderHome();
    await screen.findByTestId('child-home');
    await act(async () => {
      await router.navigate('/');
    });
    await waitFor(async () => expect(await ended(app)).toHaveLength(1));
    expect((await ended(app))[0]?.payload).toMatchObject({ reason: 'child-exit' });
  });
});
