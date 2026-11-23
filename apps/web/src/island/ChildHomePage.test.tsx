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
import { CHILD_G2, CHILD_K, profile, testEnv } from '@/data/store.test-support';
import { remediationQueue } from '@/runner/remediationQueue';
import { WORKSHOPS } from '@/workshops/registry';
import { WorkshopHost } from '@/workshops/WorkshopHost';
import { buildClock, CONSTRUCTION_MS, COUNT_STEP_MS, manualClock } from './building/clock';
import { ChildHomePage } from './ChildHomePage';
import { FIRST_PROBLEM_BUDGET_MS, firstProblem } from './firstProblem';
import { PlayLayout } from './PlayLayout';
import { type IslandPlan, planIslandRequests } from './planRequests';
import { displacedFor } from './shared/family';

// The island's planner, called through: the tests can see when the island plans and with what.
vi.mock('./planRequests', async (original) => {
  const actual = await original<typeof import('./planRequests')>();
  return { ...actual, planIslandRequests: vi.fn(actual.planIslandRequests) };
});

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
  before = async (_app: AppServices, _device: ReturnType<typeof testDevice>) => {},
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
  await before(app, device);
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

/**
 * The log's event types, without the steps of a lesson: a new child's first request starts with
 * the plan's warmup, the lesson of its first skill, which logs its demo steps as they play.
 */
const types = async (app: AppServices) =>
  (await app.store.events()).map((e) => e.type).filter((type) => type !== 'lesson.step');
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
    // Nothing was made or built: the goodbye alone, once the log has been read.
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('ui.winddown.done', undefined));
    expect(screen.queryByTestId('recap')).toBeNull();
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
    // The greeting comes once the island is read: it is over before the speakers are tried.
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('ui.island.hello', undefined));
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
    // While the request is still being written (what it made, a road stone its workshop is
    // laying), nothing can be bought: not a building, not the road's next stone.
    const disabled = (testId: string) => (screen.getByTestId(testId) as HTMLButtonElement).disabled;
    await screen.findByTestId('road-next');
    expect(disabled('build-open')).toBe(true);
    expect(disabled('road-next')).toBe(true);
    fireEvent.pointerUp(document.querySelector('[data-hit="next"]') as Element);
    await settle();
    expect(await types(app)).toEqual(['session.started', 'request.accepted']);
    release();
    await waitFor(async () => expect(await types(app)).toContain('request.completed'));
    await bubbles();
    await settle();
    expect(await types(app)).toEqual(['session.started', 'request.accepted', 'request.completed']);
    expect(disabled('build-open')).toBe(false);
    expect(disabled('road-next')).toBe(false);
  });

  it('fetches the workshop ahead, and the first problem is on screen within 10 s of the tap', async () => {
    const loads = new Map(WORKSHOPS.map((w) => [w.id, vi.spyOn(w, 'load')]));
    const { app, router } = await renderHome();
    const [first] = await bubbles();
    await settle();
    // Which workshops were fetched when the bubbles appeared, before any tap.
    const fetched = [...loads].filter(([, load]) => load.mock.calls.length > 0).map(([id]) => id);

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
    // The request's workshop (Road Crew or the Practice Pier) was one of them.
    const workshop = router.state.location.pathname.split('/').pop();
    expect(router.state.location.pathname).toBe(`/play/${CHILD_K}/workshop/${workshop}`);
    expect(fetched).toContain(workshop);
    const before = firstProblem.lastMs();
    for (let quiet = 1; firstProblem.lastMs() === before; quiet += 1) {
      await wait();
      // Measured while waiting (the first widget mounted): the clock must not move after it.
      if (firstProblem.lastMs() !== before) break;
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
    // The request started with the plan's warmup (04 §6.1): one task more than the planned ones.
    const planner = vi.mocked(planIslandRequests);
    const planned = planner.mock.results[0]?.value as IslandPlan;
    expect(planned.warmup).not.toBeNull();
    const accepted = (await app.store.events()).find((e) => e.type === 'request.accepted');
    expect(accepted?.payload).toMatchObject({
      requestId: firstId,
      taskCount: (planned.requests[0]?.tasks.length ?? 0) + 1,
    });
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
    // The pile is tagged with who made some of it (05 §3), as a badge and in its name.
    expect(stone.getAttribute('aria-label')).toBe('road stones: 13 (Mia)');
    expect(stone.querySelectorAll(`[data-testid="makers"] [data-badge="${CHILD_K}"]`)).toHaveLength(
      1,
    );
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
    // (the only text is the letter on a maker's avatar badge)
    expect(piles.textContent).toBe('MM');
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
    expect(stone.querySelector('.font-display')?.textContent).toBe('23');
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
    fireEvent.click(screen.getByRole('button', { name: 'Go on' }));
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
    await act(async () => clock.advance(COUNT_STEP_MS));
    expect(counted()).toEqual([1, 2]);
    await act(async () => clock.advance(COUNT_STEP_MS));
    expect(counted()).toEqual([1, 2, 3]);
    expect(home.querySelector('[data-stone="3"][data-state="counting"]')).toBeTruthy();
    await act(async () => clock.advance(COUNT_STEP_MS));
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

  it('a number still being said holds the walk on its stone, however long it takes', async () => {
    const clock = manualClock();
    const real = buildClock.current;
    buildClock.current = clock;
    const prev = restore;
    restore = () => {
      buildClock.current = real;
      prev();
    };
    const { app } = await renderHome({
      before: async (a) => {
        await a.store.append(
          'material.produced',
          {
            sessionId: 's0',
            requestId: 'r0',
            workshopId: 'practice-pier',
            materials: { stone: 1 },
          },
          { childId: CHILD_K },
        );
        await a.store.append('road.extended', { to: 1 }, { childId: CHILD_K });
      },
    });
    // Each number's line ends only when the test says so (a long number: "one hundred ten").
    const lines: (() => void)[] = [];
    const phrases = vi
      .spyOn(app.audio, 'sayPhrases')
      .mockImplementation(() => new Promise<void>((resolve) => lines.push(resolve)));
    const cancel = vi.spyOn(app.audio, 'cancelSpeech');
    await bubbles();
    const home = screen.getByTestId('child-home');
    const lay = await screen.findByRole('button', { name: 'Lay the next stone' });
    await act(async () => {
      fireEvent.click(lay);
    });
    await waitFor(() => expect(phrases).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledTimes(1);
    // The clock runs far past the step: the first number is still being said, so the walk waits
    // and nothing cuts the line off.
    await act(async () => clock.advance(10 * COUNT_STEP_MS));
    expect(phrases).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(home.querySelector('[data-stone="1"][data-state="counting"]')).toBeTruthy();
    // The line ends: the walk moves on to the new stone, and ends when that one is said.
    await act(async () => lines[0]?.());
    expect(phrases).toHaveBeenCalledTimes(2);
    expect(home.querySelector('[data-stone="2"][data-state="counting"]')).toBeTruthy();
    await act(async () => lines[1]?.());
    expect(home.querySelector('[data-stone="2"][data-state="counting"]')).toBeTruthy();
    await act(async () => clock.advance(COUNT_STEP_MS));
    expect(home.querySelector('[data-state="counting"]')).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('a road stone that brings a resident makes the island plan again, with them', async () => {
    const clock = manualClock();
    const real = buildClock.current;
    buildClock.current = clock;
    const prev = restore;
    restore = () => {
      buildClock.current = real;
      prev();
    };
    const { app } = await renderHome({
      before: async (a) => {
        await a.store.append(
          'material.produced',
          {
            sessionId: 's0',
            requestId: 'r0',
            workshopId: 'practice-pier',
            materials: { stone: 1 },
          },
          { childId: CHILD_K },
        );
        // The first shore is open (Hobb lives there) and the road is one stone short of 20.
        await a.store.append(
          'resident.arrived',
          { residentId: 'hobb', homeInstanceId: null, via: 'home' },
          { childId: CHILD_K },
        );
        await a.store.append('road.extended', { to: 19 }, { childId: CHILD_K });
      },
    });
    const planner = vi.mocked(planIslandRequests);
    await bubbles();
    const lay = await screen.findByRole('button', { name: 'Lay the next stone' });
    expect(lay.getAttribute('data-stone')).toBe('20');
    const residentsPlanned = () =>
      Object.keys(planner.mock.calls.at(-1)?.[1].island.residents ?? {}).sort();
    expect(residentsPlanned()).toEqual(['hobb']);
    const plans = planner.mock.calls.length;
    // Stone 20 brings Toma: without any other action, the island plans again and Toma is there.
    await act(async () => {
      fireEvent.click(lay);
    });
    await waitFor(async () =>
      expect(Object.keys((await app.store.island()).residents).sort()).toEqual(['hobb', 'toma']),
    );
    await waitFor(() => expect(planner.mock.calls.length).toBeGreaterThan(plans));
    expect(residentsPlanned()).toEqual(['hobb', 'toma']);
    // A stone that brings nobody does not plan again.
    await a11yStone(app);
    const after = planner.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId('road-next'));
    });
    await waitFor(async () => expect((await app.store.island()).roadLength).toBe(21));
    await settle();
    expect(planner.mock.calls.length).toBe(after);
  });
});

describe('the shared island (05 §3, §6; #22 part 3)', () => {
  const OTHER_DEVICE = '019a0000-0000-7000-8000-00000000d0b2';
  const T0 = Date.UTC(2026, 10, 18, 9);
  /** What each child did, each on their own tablet, `at` seconds after T0. */
  const log: { at: number; child: string; type: string; payload: Record<string, unknown> }[] = [
    { at: 0, child: CHILD_K, type: 'material.produced', payload: made({ stone: 9, light: 5 }) },
    { at: 1, child: CHILD_G2, type: 'material.produced', payload: made({ stone: 6, plank: 12 }) },
    {
      at: 10,
      child: CHILD_K,
      type: 'building.placed',
      payload: at('shell-cottage', 'shell-cottage', 3, 4),
    },
    {
      at: 11,
      child: CHILD_K,
      type: 'resident.arrived',
      payload: { residentId: 'hobb', homeInstanceId: 'shell-cottage', via: 'home' },
    },
    { at: 12, child: CHILD_K, type: 'road.extended', payload: { to: 3 } },
    {
      at: 13,
      child: CHILD_K,
      type: 'material.spent',
      payload: spent({ stone: 3 }, 'build', 'road'),
    },
    {
      at: 20,
      child: CHILD_G2,
      type: 'building.placed',
      payload: at('ten-boat-dock', 'ten-boat-dock', 1, 2),
    },
    { at: 22, child: CHILD_G2, type: 'road.extended', payload: { to: 5 } },
    {
      at: 23,
      child: CHILD_G2,
      type: 'material.spent',
      payload: spent({ stone: 2 }, 'build', 'road'),
    },
    // Both tablets offline: the grove covers [6,2]–[7,3], the Road Crew [7,3]–[8,3]. The grove
    // was placed first, and reaches this tablet last.
    {
      at: 25,
      child: CHILD_G2,
      type: 'building.placed',
      payload: at('lantern-grove', 'lantern-grove', 6, 2),
    },
    {
      at: 30,
      child: CHILD_K,
      type: 'building.placed',
      payload: at('road-crew', 'road-crew', 7, 3),
    },
    {
      at: 31,
      child: CHILD_K,
      type: 'material.spent',
      payload: spent({ stone: 2 }, 'build', 'road-crew'),
    },
    // A shared project: both children's materials went into it.
    {
      at: 39,
      child: CHILD_K,
      type: 'material.spent',
      payload: spent({ light: 3 }, 'project', 'lighthouse'),
    },
    {
      at: 40,
      child: CHILD_G2,
      type: 'material.spent',
      payload: spent({ plank: 8 }, 'project', 'lighthouse'),
    },
    {
      at: 41,
      child: CHILD_G2,
      type: 'building.placed',
      payload: at('lighthouse', 'lighthouse', 1, 4),
    },
  ];
  function made(materials: Record<string, number>) {
    return { sessionId: 's0', requestId: 'r0', workshopId: 'practice-pier', materials };
  }
  function at(instanceId: string, buildingId: string, x: number, y: number) {
    return { instanceId, buildingId, plot: [x, y] };
  }
  function spent(materials: Record<string, number>, kind: string, ref: string) {
    return { materials, purpose: { kind, ref } };
  }

  /** Mia's events are this tablet's own; Leo's come from the other one, newest first. */
  const seed = async (app: AppServices, device: ReturnType<typeof testDevice>) => {
    await app.store.putProfile({ ...profile(CHILD_G2, '2', 'Leo'), createdAt: 1 });
    const { familyId } = await app.store.device();
    for (const e of log.filter((l) => l.child === CHILD_K)) {
      device.clock.set(T0 + e.at * 1000);
      await app.store.append(e.type as 'road.extended', e.payload as { to: number }, {
        childId: CHILD_K,
      });
    }
    device.clock.set(T0 + 3_600_000);
    const theirs = log
      .filter((l) => l.child === CHILD_G2)
      .map((e, i) => ({
        id: `019b0000-00d2-7000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
        familyId,
        childId: CHILD_G2,
        deviceId: OTHER_DEVICE,
        ts: T0 + e.at * 1000,
        type: e.type,
        v: 1,
        payload: e.payload,
        contentVersion: 'test',
      }));
    const result = await app.store.ingest(theirs.reverse(), { source: 'server' });
    expect(result).toMatchObject({ invalid: 0, dropped: 0 });
    expect(result.added).toHaveLength(theirs.length);
  };

  it("two children's events from two tablets render on one island: the map, the road and the Storehouse", async () => {
    const { app, say } = await renderHome({ before: seed });
    const home = await screen.findByTestId('child-home');
    await bubbles();
    const scene = home.querySelector('[data-scene="island"]') as Element;
    // The map: what both children built, and of the two on the same plots only the first.
    const standing = () =>
      [...scene.querySelectorAll('[data-building]')].map((b) => b.getAttribute('data-building'));
    await waitFor(() =>
      expect(standing().sort()).toEqual([
        'lantern-grove',
        'lighthouse',
        'shell-cottage',
        'ten-boat-dock',
      ]),
    );
    expect(Object.keys((await app.store.island()).buildings).sort()).toEqual([
      'lantern-grove',
      'lighthouse',
      'shell-cottage',
      'ten-boat-dock',
    ]);
    // The road is the longer of the two (5 stones), and the next one waits.
    const laid = [...scene.querySelectorAll('[data-stone][data-state="laid"]')].map((s) =>
      Number(s.getAttribute('data-stone')),
    );
    expect([...new Set(laid)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(screen.getByTestId('road-next').getAttribute('data-stone')).toBe('6');

    // Who built what: a badge on each building, and both children's on the shared project.
    const badges = screen.getByTestId('building-badges');
    const builtBy = (instance: string) =>
      badges.querySelector(`[data-built-by="${instance}"]`)?.getAttribute('data-children');
    expect(builtBy('shell-cottage')).toBe(CHILD_K);
    expect(builtBy('ten-boat-dock')).toBe(CHILD_G2);
    expect(builtBy('lantern-grove')).toBe(CHILD_G2);
    expect(builtBy('lighthouse')).toBe(`${CHILD_K} ${CHILD_G2}`);
    expect(badges.querySelector('[data-built-by="lighthouse"]')?.getAttribute('aria-label')).toBe(
      'Mia, Leo',
    );
    expect(badges.querySelector('[data-built-by="road-crew"]')).toBeNull();
    // Both children stand on the island, the one who is playing marked.
    const family = screen.getByTestId('island-family');
    const avatars = [...family.querySelectorAll('[data-island-avatar]')].map((a) => [
      a.getAttribute('data-island-avatar'),
      a.getAttribute('aria-label'),
      a.getAttribute('data-playing'),
    ]);
    expect(avatars).toEqual([
      [CHILD_K, 'Mia', 'true'],
      [CHILD_G2, 'Leo', null],
    ]);
    // Nothing of it is a number or a score.
    expect(`${badges.textContent}${family.textContent}`).not.toMatch(/\d/);

    // The Storehouse is the family's: 15 stones made, 7 spent; each pile tagged by its makers.
    fireEvent.click(screen.getByRole('button', { name: 'Storehouse' }));
    const piles = await screen.findByTestId('storehouse-piles');
    const pile = (id: string) => piles.querySelector(`[data-material="${id}"]`) as HTMLElement;
    const makers = (id: string) =>
      [...pile(id).querySelectorAll('[data-badge]')].map((b) => b.getAttribute('data-badge'));
    expect(pile('stone').getAttribute('data-count')).toBe('8');
    expect(makers('stone')).toEqual([CHILD_K, CHILD_G2]);
    expect(pile('light').getAttribute('data-count')).toBe('2');
    expect(makers('light')).toEqual([CHILD_K]);
    expect(pile('plank').getAttribute('data-count')).toBe('4');
    expect(makers('plank')).toEqual([CHILD_G2]);
    expect(pile('plank').getAttribute('aria-label')).toBe('planks: 4 (Leo)');

    // Mia's Road Crew lost its plots to Leo's earlier grove: she is told, once.
    expect(say).toHaveBeenCalledWith('ui.island.displaced', undefined);
    expect(say.mock.calls.filter(([key]) => key === 'ui.island.hello')).toHaveLength(0);
    expect(screen.getByText('Someone was here first. Pick a new place to build!')).toBeTruthy();
    const island = await app.store.island();
    expect(displacedFor(island, CHILD_K)).toEqual([]);
    expect(displacedFor(island, CHILD_G2)).toEqual([]);
    localStorage.clear();
    expect(displacedFor(island, CHILD_K)).toEqual([`road-crew@${T0 + 30_000}`]);

    // The other tablet, which got the same events in another order, shows the same island.
    const other = await testEnv().open();
    await other.ingest([...(await app.store.events())].reverse(), { source: 'server' });
    expect(await other.island()).toEqual(await app.store.island());
    expect(await other.inventory()).toEqual(await app.store.inventory());
    other.close();
  });

  it('the child whose placement stood is greeted as ever, and a child alone has no sibling on the map', async () => {
    const { say } = await renderHome();
    const family = await screen.findByTestId('island-family');
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('ui.island.hello', undefined));
    expect(family.querySelectorAll('[data-island-avatar]')).toHaveLength(1);
    expect(screen.getByTestId('building-badges').querySelectorAll('[data-built-by]')).toHaveLength(
      0,
    );
  });

  it('opening the island on a home whose resident never arrived brings them, and the island plans again with them', async () => {
    // The arrival is held until the island has planned once, so the plan that follows it is
    // a second one whatever order the island's own work runs in.
    let arrive = () => {};
    const held = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const { app } = await renderHome({
      before: async (a) => {
        // A build that was interrupted after its placement: the home stands, nobody moved in.
        await a.store.append(
          'building.placed',
          { instanceId: 'cot-a', buildingId: 'shell-cottage', plot: [3, 4] },
          { childId: CHILD_K },
        );
        const append = a.store.append.bind(a.store);
        vi.spyOn(a.store, 'append').mockImplementation((async (
          ...args: Parameters<typeof append>
        ) => {
          if (args[0] === 'resident.arrived') await held;
          return append(...args);
        }) as typeof append);
      },
    });
    const planner = vi.mocked(planIslandRequests);
    const residentsPlanned = () =>
      Object.keys(planner.mock.calls.at(-1)?.[1].island.residents ?? {}).sort();
    await bubbles();
    expect(residentsPlanned()).toEqual([]);
    const plans = planner.mock.calls.length;
    arrive();
    await waitFor(async () =>
      expect(Object.keys((await app.store.island()).residents)).toEqual(['hobb']),
    );
    await waitFor(() => expect(planner.mock.calls.length).toBeGreaterThan(plans));
    expect(residentsPlanned()).toEqual(['hobb']);
  });
});

describe('decorate mode and its caps (05 §6, §8; 06 §2; #22 part 4)', () => {
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
  /** Into the recommended request, `ms` of the session there, and back to the island. */
  async function playFor(
    { app, router, tick }: Awaited<ReturnType<typeof renderHome>>,
    ms: number,
  ) {
    const [first] = await bubbles();
    fireEvent.click(first as HTMLElement);
    await waitFor(async () => expect(await types(app)).toContain('request.accepted'));
    tick(ms);
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(async () => expect(await types(app)).toContain('request.completed'));
    await bubbles();
  }
  const decorEvents = async (app: AppServices) =>
    (await app.store.events())
      .filter((e) => e.type.startsWith('decor.'))
      .map((e) => [e.type, e.payload]);

  it('is closed until a request has been played: the island says when it opens', async () => {
    const { app, say } = await renderHome();
    await bubbles();
    const open = screen.getByRole('button', { name: 'Decorate' });
    expect(open.getAttribute('data-capped')).toBe('false');
    fireEvent.click(open);
    expect(say).toHaveBeenCalledWith('ui.decor.closed', undefined);
    expect(screen.getByText('Decorating is open after you help a friend!')).toBeTruthy();
    expect(open.getAttribute('data-capped')).toBe('true');
    // Nothing opened: the requests stay, the recommended one first.
    expect(screen.queryByTestId('decor-tray')).toBeNull();
    expect((await bubbles())[0]?.getAttribute('data-recommended')).toBe('true');
    expect(await decorEvents(app)).toEqual([]);
  });

  it('after a request: pick a piece, tap a plot, put it away, and the time cap ends the mode', async () => {
    const clock = clockFor();
    const home = await renderHome();
    const { app, say, tick } = home;
    // Six minutes in the workshop earn two minutes on the island (a quarter of the session).
    await playFor(home, 6 * 60_000);
    fireEvent.click(screen.getByRole('button', { name: 'Decorate' }));
    const tray = await screen.findByTestId('decor-tray');
    expect(say).toHaveBeenCalledWith('ui.decor.pick', undefined);
    expect(screen.queryByTestId('requests')).toBeNull();
    // Every starter piece, each a button with a picture; none on the island yet.
    const pieces = within(tray).getAllByRole('button', { name: /^Thing \d+$/ });
    expect(pieces).toHaveLength(Number(tray.getAttribute('data-pieces')));
    expect(tray.getAttribute('data-spare')).toBe(tray.getAttribute('data-pieces'));
    expect(pieces[0]?.getAttribute('data-decor-item')).toBe('shell-bench-1');
    expect(pieces[0]?.querySelector('svg')).toBeTruthy();
    expect(screen.queryByTestId('plot-targets')).toBeNull();

    // In hand: the island offers the sandbar's one free plot.
    fireEvent.click(pieces[0] as HTMLElement);
    expect(say).toHaveBeenCalledWith('ui.decor.place', undefined);
    expect(pieces[0]?.getAttribute('aria-pressed')).toBe('true');
    const plots = within(await screen.findByTestId('plot-targets')).getAllByRole('button');
    expect(plots.map((b) => b.getAttribute('data-plot'))).toEqual(['3,4']);
    await act(async () => {
      fireEvent.click(plots[0] as HTMLElement);
    });
    await waitFor(async () =>
      expect(await decorEvents(app)).toEqual([
        ['decor.placed', { instanceId: 'shell-bench-1', decorId: 'shell-bench', pos: [3, 4] }],
      ]),
    );
    // It stands on the map, is marked in the tray, and is no longer in hand.
    const scene = screen.getByTestId('child-home').querySelector('[data-scene="island"]');
    await waitFor(() =>
      expect(scene?.querySelector('[data-decor-instance="shell-bench-1"]')).toBeTruthy(),
    );
    expect(scene?.querySelector('[data-decor="shell-bench"]')).toBeTruthy();
    await waitFor(() => expect(pieces[0]?.getAttribute('data-state')).toBe('placed'));
    expect(screen.queryByTestId('plot-targets')).toBeNull();
    // The plot is taken: the next piece has nowhere to go on the sandbar.
    fireEvent.click(pieces[1] as HTMLElement);
    expect(screen.queryByTestId('plot-targets')?.querySelectorAll('button')).toHaveLength(0);
    const away = screen.getByRole('button', { name: 'Put it away' }) as HTMLButtonElement;
    expect(away.disabled).toBe(true);

    // The piece on the island is put away again.
    fireEvent.click(pieces[0] as HTMLElement);
    expect(away.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(away);
    });
    await waitFor(async () =>
      expect((await decorEvents(app)).at(-1)).toEqual([
        'decor.removed',
        { instanceId: 'shell-bench-1' },
      ]),
    );
    await waitFor(() => expect(pieces[0]?.getAttribute('data-state')).toBe('spare'));

    // The cap: two minutes on the island are allowed. A second before, the mode is still open.
    tick(2 * 60_000 - 1000);
    act(() => clock.advance(2 * 60_000));
    expect(screen.queryByTestId('decor-tray')).toBeTruthy();
    say.mockClear();
    tick(1000);
    act(() => clock.advance(1000));
    expect(screen.queryByTestId('decor-tray')).toBeNull();
    expect(say).toHaveBeenCalledWith('ui.decor.closed', undefined);
    expect(screen.getByText('Decorating is open after you help a friend!')).toBeTruthy();
    expect((await bubbles())[0]?.getAttribute('data-recommended')).toBe('true');
    // Closed until the next request: another tap says so again and opens nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Decorate' }));
    expect(screen.queryByTestId('decor-tray')).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it('"Okay" leaves the mode, and the requests come back', async () => {
    clockFor();
    const home = await renderHome();
    await playFor(home, 6 * 60_000);
    fireEvent.click(screen.getByRole('button', { name: 'Decorate' }));
    const tray = await screen.findByTestId('decor-tray');
    fireEvent.click(within(tray).getByRole('button', { name: 'Okay!' }));
    expect(screen.queryByTestId('decor-tray')).toBeNull();
    expect((await bubbles()).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Decorate' }).getAttribute('data-capped')).toBe(
      'false',
    );
  });
});

describe("the island's name (05 §10 step 3; #22 part 4)", () => {
  it('the first child picks one of the spoken names in the game data: island.named, and the island says welcome', async () => {
    const { app, say } = await renderHome();
    await bubbles();
    expect(screen.queryByTestId('island-name')).toBeNull();
    // The sign shows once the island is read: it has no name yet.
    fireEvent.click(await screen.findByRole('button', { name: 'Name the island' }));
    const sheet = await screen.findByTestId('name-sheet');
    const names = Array.from(sheet.querySelectorAll('[data-island-name]'));
    // The game data's names (game/island.yaml), each shown as it is said.
    expect(names.map((b) => b.textContent)).toEqual([
      'Shell Island',
      'Lantern Island',
      'Stone Island',
      'Garden Island',
      'Lighthouse Island',
      'Boat Island',
    ]);
    // The sheet is a dialog: its controls are there once it has opened.
    const okay = (await within(sheet).findByRole('button', { name: 'Okay!' })) as HTMLButtonElement;
    expect(okay.disabled).toBe(true);
    fireEvent.click(names[2] as HTMLElement);
    expect(say).toHaveBeenCalledWith('game.island.name.stone', undefined);
    expect(names[2]?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.click(okay);
    });
    await waitFor(async () => expect((await app.store.island()).name).toBe('Stone'));
    expect((await app.store.events()).at(-1)).toMatchObject({
      type: 'island.named',
      childId: CHILD_K,
      payload: { name: 'Stone' },
    });
    await vi.waitFor(() =>
      expect(say).toHaveBeenCalledWith('game.island.welcome.stone', undefined),
    );
    // The name shows beside the child's, and the sign is gone: the island is named once.
    expect((await screen.findByTestId('island-name')).textContent).toBe('Stone Island');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Name the island' })).toBeNull(),
    );
  });

  it('a sibling is welcomed to the island by name, once on a device', async () => {
    const named = async (a: AppServices) => {
      await a.store.putProfile(profile(CHILD_G2, '2', 'Ben'));
      await a.store.append('island.named', { name: 'Garden' }, { childId: CHILD_G2 });
    };
    const first = await renderHome({ before: named });
    await vi.waitFor(() =>
      expect(first.say).toHaveBeenCalledWith('game.island.welcome.garden', undefined),
    );
    expect(screen.getByText('Welcome to Garden Island!')).toBeTruthy();
    expect(first.say).not.toHaveBeenCalledWith('ui.island.hello', undefined);
    expect(screen.getByTestId('island-name').textContent).toBe('Garden Island');
    expect(screen.queryByRole('button', { name: 'Name the island' })).toBeNull();
    cleanup();
    // The next visit on this device: the usual greeting.
    const again = await renderHome({ before: named });
    await vi.waitFor(() => expect(again.say).toHaveBeenCalledWith('ui.island.hello', undefined));
    expect(again.say).not.toHaveBeenCalledWith('game.island.welcome.garden', undefined);
  });
});

describe('the wind-down recap (06 §2; #22 part 4)', () => {
  it('shows and says what the child made and built in the session, then the goodbye', async () => {
    const { app, tick } = await renderHome();
    await bubbles();
    const phrases = vi.spyOn(app.audio, 'sayPhrases');
    const started = (await app.store.events()).find((e) => e.type === 'session.started');
    if (!started) throw new Error('no session was started');
    const sessionId = (started.payload as { sessionId: string }).sessionId;
    await act(async () => {
      await app.store.append(
        'material.produced',
        { sessionId, requestId: 'r1', workshopId: 'practice-pier', materials: { stone: 12 } },
        { childId: CHILD_K },
      );
      await app.store.append(
        'building.placed',
        { instanceId: 'shell-cottage', buildingId: 'shell-cottage', plot: [3, 4] },
        { childId: CHILD_K },
      );
      await app.store.append('road.extended', { to: 1 }, { childId: CHILD_K });
    });
    tick(10 * 60_000);
    expect(await screen.findByTestId('sunset')).toBeTruthy();
    const recap = await screen.findByTestId('recap');
    // Made: the Storehouse's piles (kindergarten: a full ten-frame and one with two).
    const pile = within(recap).getByTestId('recap-made').querySelector('li[data-material="stone"]');
    expect(pile?.getAttribute('data-count')).toBe('12');
    expect(pile?.querySelectorAll('[data-pile="ten-frame"]')).toHaveLength(2);
    // Built: the home's picture and the stone laid.
    const built = within(recap).getByTestId('recap-built');
    expect(within(built).getByRole('img', { name: 'Shell Cottage' })).toBeTruthy();
    expect(built.querySelector('[data-built="road"]')?.getAttribute('data-stones')).toBe('1');
    expect(phrases).toHaveBeenCalledWith([
      { id: 'ui.winddown.made' },
      { number: 12 },
      { id: 'game.material.stone' },
      { id: 'ui.winddown.built' },
      { id: 'game.building.shell-cottage' },
      { number: 1 },
      { id: 'game.material.stone' },
      { id: 'ui.winddown.done' },
    ]);
    expect(screen.getByText('Great playing! See you next time!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Okay!' })).toBeTruthy();
  });
});

/** One more stone in the Storehouse, and the road button showing it can be paid. */
async function a11yStone(app: AppServices) {
  await act(async () => {
    await app.store.append(
      'material.produced',
      { sessionId: 's0', requestId: 'r1', workshopId: 'practice-pier', materials: { stone: 1 } },
      { childId: CHILD_K },
    );
  });
  await waitFor(() =>
    expect(screen.getByTestId('road-next').getAttribute('data-affordable')).toBe('true'),
  );
}
