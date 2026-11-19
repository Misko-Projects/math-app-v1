import { stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectFitsArea,
  expectNumeralsAtLeast32,
  inArea,
} from '../../test-support/areaStory';
import {
  center,
  clearSpies,
  expectTargetSize,
  pointerDrag,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `measure-length` (03 §5.5): lay units end to end and count them, measure with two units, or
 * read a ruler. Configs are real generated items (mea.length; template and seed in each comment)
 * except the ruler ones (read is K02; hand-made configs the schema accepts).
 */

type Config = ConfigFor<'measure-length'>;

const base = {
  format: 'measure-length',
  tool: 'units',
  startOffset: 0,
  precision: 1,
  input: 'pad',
} as const;

/** MEA.02.t1 seed 4: a plank 7 shells long. */
const shells: Config = {
  ...base,
  object: { sprite: 'plank', length: 7 },
  unit: 'shell',
  mode: 'iterate',
};
/** MEA.02.t1 seed 2: a plank 3 cubes long. */
const cubes3: Config = {
  ...base,
  object: { sprite: 'plank', length: 3 },
  unit: 'cube',
  mode: 'iterate',
};
/** MEA.02.t1 seed 6: a vine 11 cubes long (the longest kind). */
const cubes11: Config = {
  ...base,
  object: { sprite: 'vine', length: 11 },
  unit: 'cube',
  mode: 'iterate',
};
/** MEA.22.t1 seed 4: a log 2 shells (4 cubes) long. */
const twoUnits: Config = {
  ...base,
  object: { sprite: 'log', length: 2 },
  unit: 'shell',
  altUnit: 'cube',
  mode: 'two-units',
};
/** MEA.22.t3 seed 2 (pictorial): a ribbon 3 sticks (6 shells) long. */
const twoPictorial: Config = {
  ...base,
  object: { sprite: 'ribbon', length: 3 },
  unit: 'stick',
  altUnit: 'shell',
  mode: 'two-units',
};
/** Read a ruler (MEA.03, K02): a plank from mark 2, 5 inches long. */
const ruler: Config = {
  ...base,
  object: { sprite: 'plank', length: 5 },
  tool: 'ruler',
  unit: 'in',
  startOffset: 2,
  mode: 'read',
};

const meta = {
  title: 'Widgets/Measure length',
  args: {
    config: shells as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-mlen';
const pile = (root: HTMLElement, u: string) =>
  root.querySelector(`.ni-mlen__pile[data-pile="${u}"]`) as HTMLElement;
const track = (root: HTMLElement, u: string) =>
  root.querySelector(`[data-track="${u}"]`) as HTMLElement;
const trackPad = (root: HTMLElement, _unit: string) =>
  root.querySelector('.ni-mlen__pad') as HTMLElement;
const laid = (root: HTMLElement, u: string) =>
  [...track(root, u).querySelectorAll<HTMLElement>('.ni-mlen__laid')].map((e) =>
    Number(e.dataset.at),
  );
const objectPx = (root: HTMLElement) =>
  (root.querySelector('.ni-mlen__object svg') as SVGElement).getBoundingClientRect().width;
/** The drawn length of one laid unit in a row (px). */
const unitPx = (root: HTMLElement, u: string) =>
  (track(root, u).querySelector('.ni-unit') as SVGElement).getBoundingClientRect().width;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const lastResponse = (spy: unknown) => {
  const calls = (spy as ReturnType<typeof fn>).mock.calls;
  return calls[calls.length - 1]?.[0] as ResponseValue;
};

/** A point over the track where a unit starting `at` unit lengths in has its centre. */
function spot(root: HTMLElement, u: string, at: number, px: number) {
  const r = track(root, u).getBoundingClientRect();
  return { x: r.left + (at + 0.5) * px, y: r.top + r.height / 2 };
}

/**
 * K (MEA.02.t1): lay shells along the plank by touch, by mouse (dropped a little off; it snaps
 * to the last shell), by tap-then-tap and by keyboard, take one back, then type 7. Every laid shell
 * sits exactly end to end, the plank is exactly 7 shells long, and the response passes
 * units.iterate.
 */
export const IterateShellsK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectTargetSize(pile(root, 'shell'), 'k');
    await expectTargetSize(within(root).getByRole('button', { name: 'Take one back' }), 'k');
    // Touch drag the first shell to the start.
    const firstPx = Number(root.style.getPropertyValue('--unit').replace('px', ''));
    await expect(objectPx(root)).toBeCloseTo(7 * firstPx, 0);
    await pointerDrag(pile(root, 'shell'), spot(root, 'shell', 0.1, firstPx), 'touch');
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0]));
    // Mouse drag, dropped 0.15 of a shell past the end of the first: it snaps to 1.
    await pointerDrag(pile(root, 'shell'), spot(root, 'shell', 1.15, firstPx), 'mouse');
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 1]));
    // Tap the pile (it says "shell"), then tap the track at the next spot.
    await userEvent.click(pile(root, 'shell'));
    await expect(audio.say).toHaveBeenCalledWith('unit.shell.one', undefined);
    const s = spot(root, 'shell', 2, firstPx);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: trackPad(root, 'shell'),
      coords: { clientX: s.x, clientY: s.y },
    });
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 1, 2]));
    // Keyboard: Enter on the pile, then Enter on the track lays the next one end to end.
    for (let i = 0; i < 5; i += 1) {
      pile(root, 'shell').focus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('{Enter}');
    }
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]));
    // One too many: take it back.
    await userEvent.click(within(root).getByRole('button', { name: 'Take one back' }));
    await expect(laid(root, 'shell')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Each shell is exactly one unit wide and starts where the last ended.
    for (const el of track(root, 'shell').querySelectorAll<HTMLElement>('.ni-mlen__laid')) {
      await expect(el.getBoundingClientRect().width).toBeCloseTo(firstPx, 0);
    }
    const left = track(root, 'shell').getBoundingClientRect().left;
    const lastUnit = [...track(root, 'shell').querySelectorAll('.ni-unit')].pop() as SVGElement;
    // The last shell ends exactly where the plank ends.
    await expect(lastUnit.getBoundingClientRect().right - left).toBeCloseTo(objectPx(root), 0);
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await userEvent.click(key(root, '7'));
    await expectNumeralsAtLeast32(root, '.ni-entry__text');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const r = lastResponse(args.onResponse);
    await expect(r).toEqual({ kind: 'state', value: { units: [0, 1, 2, 3, 4, 5, 6], value: 7 } });
    await expect(
      stateChecker('units.iterate')?.check(
        { length: 7, gapTolerance: 0.1 },
        (r as { value: Record<string, unknown> }).value,
      ),
    ).toBe(true);
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(
      expect.arrayContaining([
        'drag:pile-shell',
        'drop:track',
        'tap:pile-shell',
        'undo:shell-7',
        'tap:key-7',
      ]),
    );
    await expectTraceOrdered(trace);
  },
};

/** A unit dropped with a clear gap stays where it was put: the gap shows and the checker fails it. */
export const IterateGapShows: Story = {
  args: { config: cubes3 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const px = Number(root.style.getPropertyValue('--unit').replace('px', ''));
    await pointerDrag(pile(root, 'cube'), spot(root, 'cube', 0, px), 'mouse');
    await pointerDrag(pile(root, 'cube'), spot(root, 'cube', 1.5, px), 'mouse');
    await pointerDrag(pile(root, 'cube'), spot(root, 'cube', 2.5, px), 'mouse');
    await waitFor(() => expect(laid(root, 'cube')).toHaveLength(3));
    const starts = laid(root, 'cube');
    await expect(starts[0]).toBe(0);
    await expect(starts[1]).toBeGreaterThan(1.3);
    await userEvent.click(key(root, '3'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const r = lastResponse(args.onResponse) as { value: Record<string, unknown> };
    await expect(
      stateChecker('units.iterate')?.check({ length: 3, gapTolerance: 0.1 }, r.value),
    ).toBe(false);
  },
};

/**
 * MEA.22.t1 (concrete): measure the log with shells, then cubes. A shell is exactly two cubes
 * long; 2 shells and 4 cubes each end exactly at the log's end. Check answers [2, 4].
 */
export const TwoUnits: Story = {
  args: { config: twoUnits },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 2; i += 1) {
      pile(root, 'shell').focus();
      await userEvent.keyboard('{Enter}{Enter}');
    }
    const cpx = objectPx(root) / 4;
    await pointerDrag(pile(root, 'cube'), spot(root, 'cube', 0, cpx), 'touch');
    await userEvent.click(pile(root, 'cube'));
    const s1 = spot(root, 'cube', 1, cpx);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: trackPad(root, 'cube'),
      coords: { clientX: s1.x, clientY: s1.y },
    });
    for (let i = 0; i < 2; i += 1) {
      pile(root, 'cube').focus();
      await userEvent.keyboard('{Enter}{Enter}');
    }
    await waitFor(() => expect(laid(root, 'cube')).toHaveLength(4));
    const shellPx = unitPx(root, 'shell');
    const cubePx = unitPx(root, 'cube');
    await expect(shellPx).toBeCloseTo(2 * cubePx, 6);
    await expect(objectPx(root)).toBeCloseTo(4 * cubePx, 0);
    // Type 2 in the shells box, then 4 in the cubes box.
    await userEvent.click(key(root, '2'));
    await userEvent.click(root.querySelector('.ni-entry__box[data-box="1"]') as HTMLElement);
    await userEvent.click(key(root, '4'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [2, 4] });
  },
};

/**
 * MEA.22.t3 (pictorial): the units are drawn, laid end to end: 3 sticks above the ribbon and 6
 * shells below, each to scale. The child counts and types 3 and 6.
 */
export const TwoUnitsPictorial: Story = {
  args: { config: twoPictorial, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-mlen__pile')).toBeNull();
    await expect(laid(root, 'stick')).toEqual([0, 1, 2]);
    await expect(laid(root, 'shell')).toEqual([0, 1, 2, 3, 4, 5]);
    const stickPx = unitPx(root, 'stick');
    const shellPx = unitPx(root, 'shell');
    await expect(stickPx).toBeCloseTo(2 * shellPx, 6);
    await expect(objectPx(root)).toBeCloseTo(3 * stickPx, 0);
    await userEvent.click(key(root, '3'));
    await userEvent.click(root.querySelector('.ni-entry__box[data-box="1"]') as HTMLElement);
    await userEvent.click(key(root, '6'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [3, 6] });
  },
};

/** Tablet widget area, K: the 11-cube vine, the pile, the pad and Check fit with no scroll. */
export const IterateTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: cubes11 },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 11; i += 1) {
      pile(root, 'cube').focus();
      await userEvent.keyboard('{Enter}{Enter}');
    }
    await waitFor(() => expect(laid(root, 'cube')).toHaveLength(11));
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-mlen__pile, .ni-mlen__undo, .ni-pad__key, .ni-entry__box, .ni-mlen__laid',
      ),
      root.querySelector('.ni-mlen__object') as HTMLElement,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const k of root.querySelectorAll('.ni-pad__key')) await expectTargetSize(k, 'k');
  },
};

/** Smallest landscape area, K: the same fits with no scroll. */
export const IterateLandscapeMinK: Story = {
  ...IterateTabletK,
  render: inArea('landscapeMin'),
};

/** Smallest landscape area, K, two units (two piles, two rows, two boxes). */
export const TwoUnitsLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: twoUnits },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-mlen__pile, .ni-mlen__undo, .ni-pad__key, .ni-entry__box'),
      root.querySelector('.ni-mlen__object') as HTMLElement,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
  },
};

/**
 * Read a ruler (K02 shape): the plank starts at mark 2 and ends at mark 7; the ruler's numerals
 * are ≥ 32 px and sit on their whole-unit marks; the plank is exactly 5 units long.
 */
export const ReadRuler: Story = {
  args: { config: ruler, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectNumeralsAtLeast32(root, '.ni-ruler__numeral');
    const tick = (v: number) =>
      (
        root.querySelector(`.ni-ruler__tick[data-tick="${v}"]`) as SVGElement
      ).getBoundingClientRect().left;
    const u = tick(1) - tick(0);
    await expect(objectPx(root)).toBeCloseTo(5 * u, 0);
    const obj = (root.querySelector('.ni-mlen__object svg') as SVGElement).getBoundingClientRect();
    await expect(obj.left).toBeCloseTo(tick(2), 0);
    await expect(obj.right).toBeCloseTo(tick(7), 0);
    await userEvent.click(key(root, '5'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
  },
};

/** Tap-tick: tap the ruler at the plank's end; ←/→ move the mark (keyboard). A placement. */
export const ReadTapTick: Story = {
  args: { config: { ...ruler, input: 'tap-tick' }, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const t6 = (
      root.querySelector('.ni-ruler__tick[data-tick="6"]') as SVGElement
    ).getBoundingClientRect();
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: within(root).getByRole('slider', { name: 'Ruler' }),
      coords: { clientX: t6.left + 3, clientY: t6.top + 40 },
    });
    await waitFor(() =>
      expect(root.querySelector('.ni-ruler__mark[data-mark="6"]')).not.toBeNull(),
    );
    within(root).getByRole('slider', { name: 'Ruler' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(root.querySelector('.ni-ruler__mark[data-mark="7"]')).not.toBeNull();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 7 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:mark-6',
      'move:mark-7',
    ]);
  },
};

/** Concrete: drag the ruler so its 0 is under the plank's start; then the end reads 5. */
export const SlideRuler: Story = {
  args: { config: ruler },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = within(root).getByRole('slider', { name: 'Ruler' });
    const tick = (v: number) =>
      (
        root.querySelector(`.ni-ruler__tick[data-tick="${v}"]`) as SVGElement
      ).getBoundingClientRect().left;
    const u = tick(1) - tick(0);
    const c = center(r);
    await pointerDrag(r, { x: c.x + 2 * u + 4, y: c.y }, 'mouse');
    await waitFor(() => expect(r).toHaveAttribute('data-ruler-start', '0'));
    await new Promise((done) => setTimeout(done, 650));
    const obj = (root.querySelector('.ni-mlen__object svg') as SVGElement).getBoundingClientRect();
    await expect(obj.left).toBeCloseTo(tick(0), 0);
    await expect(obj.right).toBeCloseTo(tick(5), 0);
  },
};

/** Estimate (MEA.08, K02 shape): pick an option. */
export const EstimatePick: Story = {
  args: {
    config: { ...ruler, mode: 'estimate', input: 'pick', options: [2, 5, 9] },
    tier: 'pictorial',
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(within(root).getByRole('button', { name: '5' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-5' });
  },
};

/** `disabled`: nothing can be laid. */
export const Disabled: Story = {
  args: { disabled: true, config: cubes3 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(pile(root, 'cube'));
    await expect(pile(root, 'cube')).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoLay: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (the MEA.02.t1 solution): Pip lays three cubes end to end, counts them (1, 2, 3, the
 * running count shown), and types 3.
 */
export const DemoLayAndCount: Story = {
  args: { config: cubes3, disabled: true, demo: demoLay },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 3; i += 1) await demoLay.play({ op: 'lay-unit', args: { index: i } });
    await expect(laid(root, 'cube')).toEqual([0, 1, 2]);
    await demoLay.play({ op: 'count-units' });
    await expect(root.querySelector('.ni-mlen__count')).toHaveTextContent('3');
    await expectNumeralsAtLeast32(root, '.ni-mlen__count');
    await expect((audio.sayPhrases.mock.calls as unknown[][]).map((c) => c[0])).toEqual([
      [{ number: 1 }],
      [{ number: 2 }],
      [{ number: 3 }],
    ]);
    await demoLay.play({ op: 'answer', args: { value: 3 } });
    await expect(root.querySelector('.ni-entry__text')).toHaveTextContent('3');
    await expect(demoLay.play({ op: 'drag' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
  },
};

const demoRuler: WidgetDemo = createDemoController({ strict: true });

/** Demo (read): mark where the plank starts and ends on the ruler, then slide the ruler to 0. */
export const DemoRuler: Story = {
  args: { config: ruler, tier: 'pictorial', disabled: true, demo: demoRuler },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoRuler.play({ op: 'align-zero' });
    await demoRuler.play({ op: 'read-end' });
    await expect(root.querySelector('.ni-ruler__mark[data-mark="2"]')).not.toBeNull();
    await expect(root.querySelector('.ni-ruler__mark[data-mark="7"]')).not.toBeNull();
    await demoRuler.play({ op: 'slide-ruler', args: { to: 0 } });
    await expect(within(root).getByRole('slider', { name: 'Ruler' })).toHaveAttribute(
      'data-ruler-start',
      '0',
    );
  },
};

const inviteDemo: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the pile to take a unit from. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: cubes3, demo: inviteDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'lay-unit', args: { index: 0 } });
    await waitFor(() => expect(pile(root, 'cube')).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, pile(root, 'cube'), root);
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: laying and counting are instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: cubes3, disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    for (let i = 0; i < 3; i += 1) await reducedDemo.play({ op: 'lay-unit', args: { index: i } });
    await reducedDemo.play({ op: 'count-units' });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(laid(root, 'cube')).toEqual([0, 1, 2]);
  },
};
