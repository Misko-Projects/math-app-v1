import './island.test-support';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
import { buildClock, CONSTRUCTION_MS, COUNT_STEP_MS, manualClock } from './build/clock';
import { ChildHomePage } from './ChildHomePage';
import { FIRST_PROBLEM_BUDGET_MS, firstProblem } from './firstProblem';
import { PlayLayout } from './PlayLayout';

// Entering a workshop loads its code and writes to the local database: under a full test run that
// can take longer than the library's one second, so the waits here are given room.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });

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

  it('draws the map from the island fold: the sandbar, no stone laid, and the first one to lay', async () => {
    await renderHome();
    const home = await screen.findByTestId('child-home');
    const scene = home.querySelector('[data-scene="island"]');
    expect(scene).toBeTruthy();
    await waitFor(() => expect(scene?.querySelectorAll('[data-hit="next"]')).toHaveLength(1));
    expect(scene?.querySelectorAll('[data-state="laid"]')).toHaveLength(0);
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
    // The session is idle (and the picker back) before its end is written: wait for the write.
    await waitFor(async () => expect(await ended(app)).toHaveLength(1));
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

  it('the speaker beside a resident says the request and the material as one line that a new one replaces', async () => {
    const { app, say } = await renderHome();
    const phrases = vi.spyOn(app.audio, 'sayPhrases');
    const [first, second] = await bubbles();
    say.mockClear();
    const speaker = (bubble: HTMLElement | undefined) =>
      within(bubble?.closest('li') as HTMLElement).getByRole('button', { name: 'Hear it again' });
    fireEvent.click(speaker(first));
    // One call for the whole line: speech that comes after it (another speaker, the Storehouse's
    // name) replaces all of it, and nothing of it is said later.
    expect(phrases).toHaveBeenCalledTimes(1);
    expect(phrases.mock.calls[0]?.[0]).toEqual([
      { id: 'req.help' },
      { id: expect.stringMatching(/^game\.material\.(stone|light)$/) },
    ]);
    // Phrases wait their turn behind speech in progress, so each replay cancels that first.
    const cancel = vi.spyOn(app.audio, 'cancelSpeech');
    fireEvent.click(speaker(second));
    await settle();
    expect(phrases).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalled();
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      phrases.mock.invocationCallOrder[1] as number,
    );
    expect(say).not.toHaveBeenCalled();
  });

  it('Back and then Forward while the request is still being written does not start it again', async () => {
    const { app, router } = await renderHome();
    const [first] = await bubbles();
    fireEvent.click(first as HTMLElement);
    await waitFor(async () => expect(await types(app)).toContain('request.accepted'));
    // The completion is slow to write: the child is back on the island before it lands.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = app.store.append.bind(app.store);
    vi.spyOn(app.store, 'append').mockImplementation(async (type, payload, opts) => {
      if (type === 'request.completed') await held;
      return append(type, payload, opts);
    });
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(router.state.location.pathname).toBe(`/play/${CHILD_K}`);
    await act(async () => {
      await router.navigate(1);
    });
    // The Forward entry is no way back into a request the child has left: the island stays.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/play/${CHILD_K}`));
    await settle();
    expect(await types(app)).toEqual(['session.started', 'request.accepted']);
    release();
    await waitFor(async () => expect(await types(app)).toContain('request.completed'));
    await bubbles();
    await settle();
    expect(await types(app)).toEqual(['session.started', 'request.accepted', 'request.completed']);
  });

  it('fetches the workshop ahead, and the first problem is on screen within 10 s of the tap', async () => {
    const load = vi.spyOn(practicePier, 'load');
    const { app, router } = await renderHome();
    const [first] = await bubbles();
    // The request's workshop was fetched when its bubble appeared, before any tap.
    expect(load).toHaveBeenCalled();
    await settle();

    // From here time is the test's: it moves only when a timer on the way has to fire. Real
    // waiting (the local database, the chunk) is not on that clock: how long this machine takes
    // is not what is measured.
    const realTimeout = globalThis.setTimeout;
    const wait = () =>
      act(async () => {
        await new Promise((resolve) => realTimeout(resolve, 5));
      });
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
    });
    const tappedAt = performance.now();
    fireEvent.click(first as HTMLElement);
    expect(router.state.location.pathname).toBe(`/play/${CHILD_K}/workshop/practice-pier`);
    const before = firstProblem.lastMs();
    for (let quiet = 1; firstProblem.lastMs() === before; quiet += 1) {
      await wait();
      // Nothing arrived by itself for a while and a timer is pending: time moves to it.
      if (quiet % 100 === 0 && vi.getTimerCount() > 0) {
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

describe('building on the island (05 §6, 06 §2 Build; #22 part 2)', () => {
  const produce = (app: AppServices, materials: Record<string, number>) =>
    app.store.append(
      'material.produced',
      { sessionId: 's0', requestId: 'r0', workshopId: 'practice-pier', materials },
      { childId: CHILD_K },
    );
  const clockFor = () => {
    const clock = manualClock();
    const real = buildClock.current;
    buildClock.current = clock;
    const prev = restore;
    restore = () => {
      buildClock.current = real;
      prev();
    };
    return clock;
  };
  const openSheet = async () => {
    await bubbles();
    const open = screen.getByRole('button', { name: 'Build' }) as HTMLButtonElement;
    // Enabled once the island and the Storehouse are read.
    await waitFor(() => expect(open.disabled).toBe(false));
    fireEvent.click(open);
    return screen.findByTestId('build-sheet');
  };
  /** The card of a building, paging forward through the sheet until it shows. */
  const cardOf = (sheet: HTMLElement, id: string) => {
    const seen: string[] = [];
    for (let p = Number(sheet.getAttribute('data-pages')); p > 0; p -= 1) {
      const card = sheet.querySelector<HTMLElement>(`[data-card="${id}"]`);
      if (card) return card;
      for (const c of sheet.querySelectorAll('[data-card]'))
        seen.push(`${c.getAttribute('data-card')}:${c.getAttribute('data-state')}`);
      if (p > 1) fireEvent.click(screen.getByTestId('build-next'));
    }
    throw new Error(`no card for ${id} among ${seen.join(', ')}`);
  };

  it('a recipe the family cannot pay shows what is missing as pictures, and cannot be started', async () => {
    const { app } = await renderHome({
      before: async (a) => void (await produce(a, { stone: 3 })),
    });
    const sheet = await openSheet();
    // Two cards a page; the first home is the first thing a new family can work towards.
    expect(sheet.querySelectorAll('[data-card]')).toHaveLength(2);
    const cottage = cardOf(sheet, 'shell-cottage');
    expect(cottage.getAttribute('data-state')).toBe('short');
    const stone = cottage.querySelector('[data-material="stone"]') as HTMLElement;
    expect(stone.getAttribute('aria-label')).toBe('road stones: 3 / 5');
    expect(stone.querySelectorAll('[data-unit="have"]')).toHaveLength(3);
    expect(stone.querySelectorAll('[data-unit="missing"]')).toHaveLength(2);
    // Kindergarten: one ten-frame, no numeral.
    expect(stone.querySelectorAll('[data-pile="ten-frame"]')).toHaveLength(1);
    expect(stone.textContent).toBe('');
    const light = cottage.querySelector('[data-material="light"]') as HTMLElement;
    expect(light.querySelectorAll('[data-unit="missing"]')).toHaveLength(3);
    expect(within(cottage).queryByRole('button', { name: 'Build it' })).toBeNull();
    expect((await types(app)).filter((t) => t === 'building.placed')).toHaveLength(0);
  });

  it('from grade 1 a recipe is base-ten with its numeral', async () => {
    await renderHome({
      child: CHILD_G2,
      grade: '2',
      before: async (a) => void (await produce(a, { stone: 5, light: 3 })),
    });
    const sheet = await openSheet();
    const stone = cardOf(sheet, 'shell-cottage').querySelector(
      '[data-material="stone"]',
    ) as HTMLElement;
    expect(stone.querySelector('[data-pile="ones"]')?.children).toHaveLength(5);
    expect(stone.textContent).toBe('5');
  });

  it('a locked building shows what unlocks it, and the sheet pages instead of scrolling', async () => {
    const { say } = await renderHome();
    const sheet = await openSheet();
    const pages = Number(sheet.getAttribute('data-pages'));
    expect(pages).toBeGreaterThan(1);
    const dock = cardOf(sheet, 'ten-boat-dock');
    expect(dock.getAttribute('data-state')).toBe('locked');
    // The picture of the home that unlocks it, and the line that says so.
    expect(
      within(dock).getByTestId('card-why').querySelector('[data-building="shell-cottage"]'),
    ).toBeTruthy();
    say.mockClear();
    fireEvent.click(within(dock).getByRole('button', { name: 'Hear it again' }));
    expect(say).toHaveBeenCalledWith('ui.build.locked.building', undefined);
    expect(within(dock).queryByRole('button', { name: 'Build it' })).toBeNull();
  });

  it('build: choose the card, tap a highlighted plot, the construction step, then the island again', async () => {
    const clock = clockFor();
    const { app, say } = await renderHome({
      before: async (a) => void (await produce(a, { stone: 5, light: 3 })),
    });
    const sheet = await openSheet();
    const cottage = cardOf(sheet, 'shell-cottage');
    expect(cottage.getAttribute('data-state')).toBe('ready');
    expect(cottage.querySelectorAll('[data-unit="missing"]')).toHaveLength(0);
    fireEvent.click(within(cottage).getByRole('button', { name: 'Build it' }));
    // The sheet closes and the island asks for a plot: the one free plot of the sandbar.
    const targets = await screen.findByTestId('plot-targets');
    expect(screen.queryByTestId('build-sheet')).toBeNull();
    expect(screen.queryByTestId('requests')).toBeNull();
    expect(say).toHaveBeenCalledWith('ui.build.place', undefined);
    const plots = within(targets).getAllByRole('button');
    expect(plots.map((b) => b.getAttribute('data-plot'))).toEqual(['3,4']);
    const home = screen.getByTestId('child-home');
    expect(home.querySelectorAll('[data-plot-marker]')).toHaveLength(1);
    expect(home.querySelectorAll('[data-hit="next"]')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(plots[0] as HTMLElement);
    });
    // Written at once: the building, its exact cost, and the resident who moves in.
    const step = await screen.findByTestId('construction');
    expect(step.getAttribute('data-instance')).toBe('shell-cottage');
    expect((await types(app)).slice(-3)).toEqual([
      'building.placed',
      'material.spent',
      'resident.arrived',
    ]);
    expect((await app.store.inventory()).materials).toMatchObject({ stone: 0, light: 0 });
    await waitFor(() =>
      expect(home.querySelector('[data-building="shell-cottage"][data-stage="1"]')).toBeTruthy(),
    );
    expect(screen.queryByTestId('plot-targets')).toBeNull();
    // The step ends on the clock (or with Skip), and the island plans again.
    act(() => clock.advance(CONSTRUCTION_MS - 1));
    expect(screen.queryByTestId('construction')).toBeTruthy();
    act(() => clock.advance(1));
    expect(screen.queryByTestId('construction')).toBeNull();
    expect(say).toHaveBeenCalledWith('ui.build.done', undefined);
    expect((await bubbles()).length).toBeGreaterThan(0);
  });

  it('the construction step can be skipped, and choosing a plot can be called off', async () => {
    const clock = clockFor();
    const { app } = await renderHome({
      before: async (a) => void (await produce(a, { stone: 5, light: 3 })),
    });
    let sheet = await openSheet();
    fireEvent.click(
      within(cardOf(sheet, 'shell-cottage')).getByRole('button', { name: 'Build it' }),
    );
    await screen.findByTestId('plot-targets');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.queryByTestId('plot-targets')).toBeNull();
    expect((await types(app)).filter((t) => t === 'building.placed')).toHaveLength(0);
    sheet = await openSheet();
    fireEvent.click(
      within(cardOf(sheet, 'shell-cottage')).getByRole('button', { name: 'Build it' }),
    );
    await act(async () => {
      fireEvent.click(
        within(await screen.findByTestId('plot-targets')).getAllByRole('button')[0] as HTMLElement,
      );
    });
    await screen.findByTestId('construction');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByTestId('construction')).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it('an upgrade is bought from the sheet and the building stands a level higher', async () => {
    clockFor();
    const { app } = await renderHome({
      before: async (a) => {
        await produce(a, { stone: 8, light: 5 });
        await a.store.append(
          'building.placed',
          { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
          { childId: CHILD_K },
        );
      },
    });
    const sheet = await openSheet();
    const cottage = cardOf(sheet, 'shell-cottage');
    expect(cottage.getAttribute('data-level')).toBe('2');
    await act(async () => {
      fireEvent.click(within(cottage).getByRole('button', { name: 'Make it bigger' }));
    });
    await screen.findByTestId('construction');
    expect((await types(app)).slice(-3)).toEqual([
      'building.upgraded',
      'material.spent',
      'resident.arrived',
    ]);
    await waitFor(() =>
      expect(
        screen
          .getByTestId('child-home')
          .querySelector('[data-building="shell-cottage"][data-stage="2"]'),
      ).toBeTruthy(),
    );
  });
});

describe('the Numbered Road (05 §3; #22 part 2)', () => {
  it('lays the next stone for one stone and counts on to it aloud, a stone at a time', async () => {
    const clock = manualClock();
    const real = buildClock.current;
    buildClock.current = clock;
    const prev = restore;
    restore = () => {
      buildClock.current = real;
      prev();
    };
    const { app, say } = await renderHome({
      before: async (a) => {
        await a.store.append(
          'material.produced',
          {
            sessionId: 's0',
            requestId: 'r0',
            workshopId: 'practice-pier',
            materials: { stone: 2 },
          },
          { childId: CHILD_K },
        );
        await a.store.append('road.extended', { to: 2 }, { childId: CHILD_K });
      },
    });
    const phrases = vi.spyOn(app.audio, 'sayPhrases');
    await bubbles();
    const home = screen.getByTestId('child-home');
    const next = await screen.findByRole('button', { name: 'Lay the next stone' });
    expect(next.getAttribute('data-stone')).toBe('3');
    expect(next.getAttribute('data-affordable')).toBe('true');
    expect(home.querySelectorAll('[data-hit="next"]')).toHaveLength(1);
    await act(async () => {
      fireEvent.click(next);
    });
    await waitFor(async () => expect((await app.store.island()).roadLength).toBe(3));
    expect((await types(app)).slice(-2)).toEqual(['road.extended', 'material.spent']);
    // The walk: 1, 2, 3, each said as it is counted, on the build clock.
    const counted = () =>
      phrases.mock.calls.map(([parts]) => (parts[0] as { number?: number }).number);
    await waitFor(() => expect(counted()).toEqual([1]));
    expect(home.querySelector('[data-stone="1"][data-state="counting"]')).toBeTruthy();
    act(() => clock.advance(COUNT_STEP_MS));
    expect(counted()).toEqual([1, 2]);
    act(() => clock.advance(COUNT_STEP_MS));
    expect(counted()).toEqual([1, 2, 3]);
    expect(home.querySelector('[data-stone="3"][data-state="counting"]')).toBeTruthy();
    act(() => clock.advance(COUNT_STEP_MS));
    expect(home.querySelector('[data-state="counting"]')).toBeNull();
    expect(clock.pending()).toBe(0);
    // A tap on the stone itself lays the next one with the last stone the family has.
    await waitFor(() =>
      expect(screen.getByTestId('road-next').getAttribute('data-stone')).toBe('4'),
    );
    await act(async () => {
      fireEvent.pointerUp(home.querySelector('[data-hit="next"]') as Element);
    });
    await waitFor(async () => expect((await app.store.island()).roadLength).toBe(4));
    // No stone left: the next stone says what it needs and nothing is written.
    await waitFor(() =>
      expect(screen.getByTestId('road-next').getAttribute('data-affordable')).toBe('false'),
    );
    const before = await types(app);
    say.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId('road-next'));
    });
    await waitFor(() => expect(say).toHaveBeenCalledWith('ui.road.short', undefined));
    expect(await types(app)).toEqual(before);
  });
});
