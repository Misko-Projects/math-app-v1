import './island.test-support';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppServices';
import type { AppServices } from '@/app/boot/boot';
import { testDevice } from '@/app/boot/boot.test-support';
import type { SessionTimers } from '@/app/session/SessionController';
import { CHILD_G2, CHILD_K, profile } from '@/data/store.test-support';
import { remediationQueue } from '@/runner/remediationQueue';
import { practicePier } from '@/workshops/practice-pier';
import { WorkshopHost } from '@/workshops/WorkshopHost';
import { ChildHomePage } from './ChildHomePage';
import { FIRST_PROBLEM_BUDGET_MS, firstProblem } from './firstProblem';
import { PlayLayout } from './PlayLayout';

const booted: AppServices[] = [];
let restore = () => {};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  for (const s of booted.splice(0)) s.dispose();
  restore();
  localStorage.clear();
});

async function renderHome({
  startSession = true,
  child = CHILD_K,
  grade = 'K' as 'K' | '2',
  before = async (_app: AppServices) => {},
} = {}) {
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
  await app.store.putProfile(profile(child, grade, 'Mia'));
  await before(app);
  if (startSession) await app.session.start(child);
  const say = vi.spyOn(app.audio, 'say');
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>picker</p> },
      {
        path: '/play/:childId',
        Component: PlayLayout,
        children: [
          { index: true, Component: ChildHomePage },
          { path: 'workshop/:workshopId', Component: WorkshopHost },
        ],
      },
    ],
    { initialEntries: [`/play/${child}`] },
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
  return { app, router, say, tick, device };
}

const types = async (app: AppServices) => (await app.store.events()).map((e) => e.type);
const ended = async (app: AppServices) =>
  (await app.store.events()).filter((e) => e.type === 'session.ended');
/** The request bubbles, once the island has planned. */
const bubbles = async () =>
  within(await screen.findByTestId('requests')).getAllByRole('button', { name: /\?/ });
/** Lets pending work (the local database, lazy chunks) run, without moving any timer. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

describe('<ChildHomePage>: the island', () => {
  it('greets the child once, with a replay button and a Home button', async () => {
    const { say } = await renderHome();
    expect(await screen.findByTestId('child-home')).toBeTruthy();
    // Spoken from an effect once the session is ready: wait for it rather than racing it.
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('ui.island.hello', undefined));
    expect(say.mock.calls.filter(([key]) => key === 'ui.island.hello')).toHaveLength(1);
    say.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Hear it again' })[0] as HTMLElement);
    expect(say).toHaveBeenCalledWith('ui.island.hello', undefined);
    expect(screen.getByRole('button', { name: 'Go home' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('draws the map from the island fold: the sandbar, and no road stone before one is laid', async () => {
    await renderHome();
    const home = await screen.findByTestId('child-home');
    const scene = home.querySelector('[data-scene="island"]');
    expect(scene).toBeTruthy();
    expect(scene?.querySelectorAll('[data-hit="next"]')).toHaveLength(0);
    expect(scene?.querySelectorAll('[data-building]')).toHaveLength(0);
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

describe('requests on the island (05 §2, 04 §6.3)', () => {
  it('shows the plan as bubbles over residents: a picture of what each makes, the first one recommended', async () => {
    const { app } = await renderHome();
    const requests = await bubbles();
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.length).toBeLessThanOrEqual(3);
    // Only the first request is the recommended one (06 §2: it pulses).
    expect(requests.map((b) => b.getAttribute('data-recommended'))).toEqual([
      'true',
      ...requests.slice(1).map(() => null),
    ]);
    expect(requests[0]?.querySelector('.ni-bubble[data-recommended="true"]')).toBeTruthy();
    for (const bubble of requests) {
      // The name says who asks, the line, and the material; the picture shows one per unit.
      expect(bubble.getAttribute('aria-label')).toMatch(
        /^\S+ Can you help me make some things\? (road stones|light)$/,
      );
      expect(bubble.querySelectorAll('.ni-bubble svg').length).toBeGreaterThanOrEqual(1);
      // A resident stands under its bubble.
      expect(bubble.querySelectorAll(':scope > svg')).toHaveLength(1);
    }
    // Nothing is written by looking.
    expect(await types(app)).toEqual(['session.started']);
  });

  it('the speaker under a bubble says the request, then the material it is for', async () => {
    const { say } = await renderHome();
    const [first] = await bubbles();
    say.mockClear();
    const speaker = within(first?.closest('li') as HTMLElement).getByRole('button', {
      name: 'Hear it again',
    });
    fireEvent.click(speaker);
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(2));
    expect(say.mock.calls[0]?.[0]).toBe('req.help');
    expect(say.mock.calls[1]?.[0]).toMatch(/^game\.material\.(stone|light)$/);
  });

  it('fetches the workshop ahead, and the first problem is on screen within 10 s of the tap', async () => {
    const load = vi.spyOn(practicePier, 'load');
    const { app, router } = await renderHome();
    const [first] = await bubbles();
    // The request's workshop was fetched when its bubble appeared, before any tap.
    expect(load).toHaveBeenCalled();
    await settle();

    // From here time is the test's: it moves only when a timer on the way has to fire.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
    });
    const tappedAt = performance.now();
    fireEvent.click(first as HTMLElement);
    expect(router.state.location.pathname).toBe(`/play/${CHILD_K}/workshop/practice-pier`);
    const before = firstProblem.lastMs();
    let quiet = 0;
    while (firstProblem.lastMs() === before) {
      await settle();
      quiet += 1;
      if (quiet % 50 === 0) {
        // Nothing arrived by itself: the path is waiting on a timer, so time moves to it.
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        await act(async () => {
          await vi.advanceTimersToNextTimerAsync();
        });
      }
      expect(performance.now() - tappedAt).toBeLessThanOrEqual(FIRST_PROBLEM_BUDGET_MS);
    }
    expect(firstProblem.lastMs()).toBeLessThanOrEqual(FIRST_PROBLEM_BUDGET_MS);
    expect(firstProblem.lastMs()).toBe(performance.now() - tappedAt);
    vi.useRealTimers();
    // The request was accepted on the way in, once.
    await waitFor(async () =>
      expect(await types(app)).toEqual(['session.started', 'request.accepted']),
    );
  });

  it('a request the child leaves is recorded, and the island plans again on return', async () => {
    const { app, router, device } = await renderHome();
    const [first] = await bubbles();
    const firstId = first?.getAttribute('data-request');
    fireEvent.click(first as HTMLElement);
    await waitFor(async () =>
      expect(await types(app)).toEqual(['session.started', 'request.accepted']),
    );
    // The child leaves with the browser's back button, mid-request.
    device.clock.advance(30_000);
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(async () =>
      expect(await types(app)).toEqual([
        'session.started',
        'request.accepted',
        'request.completed',
      ]),
    );
    const completed = (await app.store.events()).at(-1);
    expect(completed?.payload).toMatchObject({ requestId: firstId, endedEarly: true, items: 0 });
    // Back on the island: nothing was made, so nothing arrives, and the bubbles are a new plan.
    await waitFor(async () => {
      const ids = (await bubbles()).map((b) => b.getAttribute('data-request'));
      expect(ids).not.toContain(firstId);
    });
    expect(screen.queryByTestId('arrived')).toBeNull();
    expect(await ended(app)).toHaveLength(0);
  });

  it('a wind-down that came during a request plays when the child is back on the island', async () => {
    const { app, router, tick } = await renderHome();
    const [first] = await bubbles();
    fireEvent.click(first as HTMLElement);
    await waitFor(async () => expect(await types(app)).toContain('request.accepted'));
    // The budget runs out in the workshop, which lets the current item finish and ends nothing.
    tick(10 * 60_000);
    expect(await ended(app)).toHaveLength(0);
    await act(async () => {
      await router.navigate(`/play/${CHILD_K}`, { replace: true });
    });
    expect(await screen.findByTestId('sunset')).toBeTruthy();
    await waitFor(async () => expect(await ended(app)).toHaveLength(1));
    expect((await ended(app))[0]?.payload).toMatchObject({ reason: 'wind-down' });
  });

  it('a queued remediation stays queued until the child picks its request', async () => {
    remediationQueue.add(CHILD_K, { skillId: 'CNT.03', misconceptionId: 'count-skip' });
    await renderHome();
    const requests = await bubbles();
    const idea = requests.find((b) =>
      /I know a fun new trick/.test(b.getAttribute('aria-label') ?? ''),
    );
    if (!idea) {
      // The plan could not offer it: it is dropped rather than asked for again on every plan.
      expect(remediationQueue.peek(CHILD_K)).toBeUndefined();
      return;
    }
    expect(remediationQueue.peek(CHILD_K)).toBeDefined();
    fireEvent.click(idea);
    expect(remediationQueue.peek(CHILD_K)).toBeUndefined();
  });
});

describe('the Storehouse (05 §3)', () => {
  const produce = (materials: Record<string, number>) => async (app: AppServices) => {
    await app.store.append(
      'material.produced',
      { sessionId: null, requestId: null, workshopId: 'practice-pier', materials },
      { childId: CHILD_K },
    );
  };

  it('kindergarten sees ten-frames: a full one for each ten and one for the rest', async () => {
    await renderHome({ before: produce({ stone: 13, light: 4 }) });
    await bubbles();
    fireEvent.click(screen.getByRole('button', { name: 'Storehouse' }));
    const piles = await screen.findByTestId('storehouse-piles');
    const stone = piles.querySelector('[data-material="stone"]') as HTMLElement;
    expect(stone.getAttribute('aria-label')).toBe('road stones: 13');
    expect(
      [...stone.querySelectorAll('[data-pile="ten-frame"]')].map((f) =>
        f.getAttribute('data-filled'),
      ),
    ).toEqual(['10', '3']);
    const light = piles.querySelector('[data-material="light"]') as HTMLElement;
    expect(
      [...light.querySelectorAll('[data-pile="ten-frame"]')].map((f) =>
        f.getAttribute('data-filled'),
      ),
    ).toEqual(['4']);
    // No bare number for K.
    expect(piles.textContent).toBe('');
  });

  it('from grade 1 the piles are base-ten: a bundle per ten, the ones loose, and the numeral', async () => {
    await renderHome({
      child: CHILD_G2,
      grade: '2',
      before: async (app) => {
        await app.store.append(
          'material.produced',
          {
            sessionId: null,
            requestId: null,
            workshopId: 'practice-pier',
            materials: { stone: 23 },
          },
          { childId: CHILD_G2 },
        );
      },
    });
    await bubbles();
    fireEvent.click(screen.getByRole('button', { name: 'Storehouse' }));
    const piles = await screen.findByTestId('storehouse-piles');
    const stone = piles.querySelector('[data-material="stone"]') as HTMLElement;
    expect(stone.querySelectorAll('[data-pile="ten"]')).toHaveLength(2);
    expect(stone.querySelector('[data-pile="ones"]')?.getAttribute('data-count')).toBe('3');
    expect(stone.textContent).toBe('23');
  });

  it('an empty Storehouse says so, with no piles', async () => {
    await renderHome();
    await bubbles();
    fireEvent.click(screen.getByRole('button', { name: 'Storehouse' }));
    expect(await screen.findByText(/The Storehouse is empty/)).toBeTruthy();
    expect(screen.queryByTestId('storehouse-piles')).toBeNull();
  });
});
