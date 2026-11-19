import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
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
 * `tap-count` (03 §5.5): count a set. Concrete: tap each object; a numbered pebble marks it and
 * the count is spoken; the numeral tray appears once all are counted. Pictorial: a picture and an
 * answer control only. Ordinal: tap the k-th object from the "start here" arrow.
 * Configs are real generated items (CNT.02, CNT.05, CNT.06, CNT.15).
 */

/** CNT.02.t1 seed 1: 7 leaves in a line, numeral tray, marks, count aloud. */
const leaves: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 7, sprite: 'leaf', layout: 'line', layoutSeed: 1459448649 },
  mode: 'how-many',
  input: 'auto',
  marks: true,
  countAloud: true,
};

/** CNT.05.t1: 18 crabs in a line (tray 0–20). */
const crabs: ConfigFor<'tap-count'> = {
  ...leaves,
  set: { count: 18, sprite: 'crab', layout: 'line', layoutSeed: 598165036 },
};

/** CNT.02.t3 seed 1: 6 scattered fish, a picture and the number pad. */
const fishPicture: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 6, sprite: 'fish', layout: 'scatter', layoutSeed: 2029170442 },
  mode: 'how-many',
  input: 'pad',
  marks: false,
  countAloud: false,
};

/** CNT.06.t2 seed 1: 15 crabs on a double ten-frame, number pad. */
const doubleFrame: ConfigFor<'tap-count'> = {
  ...fishPicture,
  set: { count: 15, sprite: 'crab', layout: 'double-ten-frame', layoutSeed: 559465306 },
};

/** CNT.15.t1 seed 1: 10 shells; start at the left, tap the seventh. */
const ordinalShells: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 10, sprite: 'shell', layout: 'line', layoutSeed: 160159383 },
  mode: 'ordinal',
  ordinal: { k: 7, from: 'left' },
  input: 'auto',
  marks: true,
  countAloud: true,
};

/** CNT.15.t2 (picture): stones, counted from the right. */
const ordinalStones: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 6, sprite: 'stone', layout: 'line', layoutSeed: 2036151695 },
  mode: 'ordinal',
  ordinal: { k: 3, from: 'right' },
  input: 'auto',
  marks: false,
  countAloud: false,
};

/** Shells mixed with crabs that must not be counted; pick from three numerals. */
const withDistractors: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: {
    count: 5,
    sprite: 'shell',
    layout: 'scatter',
    layoutSeed: 77,
    distractors: { sprite: 'crab', count: 3 },
  },
  mode: 'how-many',
  input: 'pick',
  pickOptions: [5, 8, 4],
  marks: true,
  countAloud: true,
};

/** CNT.13: an empty set; the tray is there from the start. */
const zero: ConfigFor<'tap-count'> = {
  ...leaves,
  set: { count: 0, sprite: 'fish', layout: 'line', layoutSeed: 3 },
};

const meta = {
  title: 'Widgets/Tap count',
  args: {
    config: leaves as WidgetConfig,
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

const ROOT = '.ni-tapc';
const objects = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('button.ni-tapc__obj[data-kind="object"]'),
];
const obj = (root: HTMLElement, i: number) =>
  root.querySelector(`[data-obj="obj-${i}"]`) as HTMLElement;
const marks = (root: HTMLElement) =>
  [...root.querySelectorAll('.ni-tapc__mark')].map((m) => Number(m.textContent));
const tray = (root: HTMLElement) => root.querySelector('.ni-tapc__tray') as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const hand = (root: HTMLElement) => root.querySelector('.ni-hand') as HTMLElement;

/** Waits for the one-shot animations (badge pop-in, tray rise) so boxes are at full size. */
async function settle(root: HTMLElement) {
  const once = root
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY);
  await Promise.all(once.map((a) => a.finished.catch(() => undefined)));
}

/**
 * Every count badge sits on its object's top-right corner, outside the drawing: above the top
 * edge, right of the centre line, and clear of the next object's drawing (the sprites start
 * 8/64 in from their box).
 */
async function expectBadgesOffObjects(root: HTMLElement) {
  await settle(root);
  const objs = objects(root);
  for (const [i, o] of objs.entries()) {
    const mark = o.querySelector('.ni-tapc__mark');
    if (!mark) continue;
    const m = mark.getBoundingClientRect();
    const b = o.getBoundingClientRect();
    await expect(m.bottom).toBeLessThanOrEqual(b.top + b.height * 0.1);
    await expect((m.left + m.right) / 2).toBeGreaterThanOrEqual(b.right - b.width * 0.15);
    const next = objs[i + 1]?.getBoundingClientRect();
    if (next && Math.abs(next.top - b.top) < 1) {
      await expect(m.right).toBeLessThanOrEqual(next.left + next.width * (8 / 64));
    }
  }
}

/**
 * Pip's teal invite ring around `invited` (a circle `outline-offset + outline-width` outside the
 * object, pulsing up to 5 % larger) stays at least 8 px clear of every count badge (pebbles:
 * capsules of the badge's height).
 */
async function expectRingClearOfBadges(root: HTMLElement, invited: HTMLElement) {
  await settle(root);
  const style = getComputedStyle(invited);
  const ring =
    (invited.offsetWidth / 2 +
      Number.parseFloat(style.outlineOffset) +
      Number.parseFloat(style.outlineWidth)) *
    1.05;
  const box = invited.getBoundingClientRect();
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const badges = [...root.querySelectorAll('.ni-tapc__mark')];
  await expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    const m = badge.getBoundingClientRect();
    const r = m.height / 2;
    const x = Math.min(Math.max(cx, m.left + r), m.right - r);
    const gap = Math.hypot(cx - x, cy - (m.top + r)) - r - ring;
    await expect(gap).toBeGreaterThanOrEqual(8);
  }
}

/**
 * The ordinal layout fits the widget area with room to spare: the row card and Check together
 * span at most 1080 px (the stage's inside is ~1146 px), and Check sits under or beside the row.
 */
async function expectOrdinalFits(root: HTMLElement) {
  const picture = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
  const check = within(root).getByRole('button', { name: 'Check' }).getBoundingClientRect();
  const left = Math.min(picture.left, check.left);
  const right = Math.max(picture.right, check.right);
  await expect(right - left).toBeLessThanOrEqual(1080);
  const set = root.querySelector('.ni-tapc__set') as HTMLElement;
  await expect(set.getBoundingClientRect().right).toBeLessThanOrEqual(picture.right);
}

/**
 * K, concrete (CNT.02.t1): tap the 7 leaves. Each gets a numbered pebble and the running count is
 * spoken; the numeral tray (0–10) appears only once every leaf is counted. Pick 7, check.
 */
export const CountK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(objects(root)).toHaveLength(7);
    // 06 §4: every leaf is a K target, ≥ 12 px from its neighbours.
    for (const o of objects(root)) await expectTargetSize(o, 'k');
    await expectTargetGaps(objects(root));
    await expect(tray(root)).toHaveAttribute('data-shown', 'false');
    await expect(canvas.queryByRole('button', { name: '7' })).toBeNull();
    for (let i = 0; i < 7; i++) {
      await userEvent.click(obj(root, i));
      await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: i + 1 }]);
    }
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect(canvas.getByRole('button', { name: 'Leaf, number 3' })).toBeVisible();
    // All counted: the tray appears.
    await waitFor(() => expect(tray(root)).toHaveAttribute('data-shown', 'true'));
    const cards = [...tray(root).querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards.map((c) => c.textContent)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '7' }));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 7 }]);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:obj-0',
      'tap:obj-1',
      'tap:obj-2',
      'tap:obj-3',
      'tap:obj-4',
      'tap:obj-5',
      'tap:obj-6',
      'tap:opt-7',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * G1, concrete (CNT.05.t1): 18 crabs in two rows, tray 0–20. Tapping a counted crab again speaks
 * its number, keeps its mark, and is traced (MC.recount-from-one reads the taps).
 */
export const CountTeenG1: Story = {
  args: { config: crabs },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    for (const o of objects(root)) await expectTargetSize(o, 'g1-up');
    await expectTargetGaps(objects(root));
    for (let i = 0; i < 18; i++) await userEvent.click(obj(root, i));
    await userEvent.click(obj(root, 2));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 3 }]);
    await expect(marks(root)).toHaveLength(18);
    await waitFor(() => expect(tray(root)).toHaveAttribute('data-shown', 'true'));
    await expect(tray(root).querySelectorAll('.ni-pick')).toHaveLength(21);
    await userEvent.click(within(root).getByRole('button', { name: '18' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 18 });
    const trace = traceOf(args.onInteract);
    await expect(trace.filter((e) => e.target === 'obj-2')).toHaveLength(2);
    // The badges sit above each crab's top-right corner: eyes and claws stay visible.
    await expectBadgesOffObjects(root);
  },
};

/**
 * Pictorial (CNT.02.t3): a static picture, answer only. The fish are not buttons; type 6 on the
 * pad and check.
 */
export const PicturePad: Story = {
  args: { config: fishPicture, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(objects(root)).toHaveLength(0);
    await expect(root.querySelectorAll('[data-sprite="fish"]')).toHaveLength(6);
    await expect(canvas.getByRole('group', { name: 'Look at the picture' })).toBeVisible();
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '6'));
    await expect(canvas.getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['key-6']);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** K, pictorial (CNT.06.t2): 15 on a double ten-frame. Keyboard: type 1, 5, then Enter. */
export const DoubleTenFrameKeyboard: Story = {
  globals: { ageMode: 'k' },
  args: { config: doubleFrame, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-objects__frame')).toHaveLength(2);
    // Enter on an empty answer sends nothing and doesn't start the debounce window.
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('1');
    await userEvent.keyboard('5');
    await expect(within(root).getByRole('button', { name: 'Your answer: 15' })).toBeVisible();
    // A double Enter plus Check inside 400 ms is one submission (06 §4).
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 15 });
    for (const k of root.querySelectorAll('.ni-pad__key')) await expectTargetSize(k, 'k');
  },
};

/**
 * Ordinal, concrete (CNT.15.t1): "start here" arrow on the left. Count along to the seventh shell;
 * the last one tapped is ringed. Check answers `choice obj-6`. Keyboard: the shells are buttons.
 */
export const OrdinalK: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(canvas.getByRole('img', { name: 'Start here' })).toBeVisible();
    await expect(root.querySelector('.ni-tapc__tray')).toBeNull();
    for (const o of objects(root)) await expectTargetSize(o, 'k');
    await expectTargetGaps(objects(root));
    for (let i = 0; i < 6; i++) await userEvent.click(obj(root, i));
    // The seventh by keyboard: focus it and press Space.
    obj(root, 6).focus();
    await userEvent.keyboard(' ');
    await expect(obj(root, 6)).toHaveAttribute('data-ringed', 'true');
    await expect(obj(root, 6)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(1);
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expectBadgesOffObjects(root);
    await expectOrdinalFits(root);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-6' });
  },
};

/** Ordinal, pictorial (CNT.15.t2), from the right: tap a stone to ring it; no counting marks. */
export const OrdinalPictureFromRight: Story = {
  args: { config: ordinalStones, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cue = within(root).getByRole('img', { name: 'Start here' });
    // The cue sits on the right of the row.
    await expect(cue.getBoundingClientRect().left).toBeGreaterThan(
      obj(root, 5).getBoundingClientRect().right,
    );
    await expectOrdinalFits(root);
    await userEvent.click(obj(root, 4));
    await userEvent.click(obj(root, 3));
    await expect(marks(root)).toEqual([]);
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(1);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-3' });
  },
};

/**
 * Distractors: the crabs can be tapped to hear their name, but are never counted or marked. Pick
 * input shows the options from the start.
 */
export const DistractorsPick: Story = {
  args: { config: withDistractors },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const crab = root.querySelector('[data-obj="distractor-0"]') as HTMLElement;
    await userEvent.click(crab);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.sprite.crab', undefined);
    await expect(marks(root)).toEqual([]);
    await userEvent.click(obj(root, 0));
    await expect(marks(root)).toEqual([1]);
    await expect(tray(root)).toHaveAttribute('data-shown', 'true');
    await expect(tray(root).querySelectorAll('.ni-pick')).toHaveLength(3);
    await userEvent.click(within(root).getByRole('button', { name: '5' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual([
      'distractor-0',
      'obj-0',
      'opt-5',
    ]);
  },
};

/**
 * CNT.13: nothing to count. The picture is an empty dish, centred above the answer; the tray is
 * there straight away; 0 is an answer.
 */
export const Zero: Story = {
  args: { config: zero },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-arrange', 'stack');
    const dish = within(root).getByRole('img', { name: 'Look at the picture' });
    await expect(dish).toHaveClass('ni-tapc__empty');
    const picture = (
      root.querySelector('.ni-tapc__picture') as HTMLElement
    ).getBoundingClientRect();
    const answer = (root.querySelector('.ni-tapc__answer') as HTMLElement).getBoundingClientRect();
    await expect(
      Math.abs((picture.left + picture.right) / 2 - (answer.left + answer.right) / 2),
    ).toBeLessThan(2);
    await expect(picture.bottom).toBeLessThan(answer.top);
    await expect(tray(root)).toHaveAttribute('data-shown', 'true');
    await userEvent.click(within(root).getByRole('button', { name: '0' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 0 });
  },
};

/** `disabled`: nothing responds and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(obj(root, 0)).toBeDisabled();
    await userEvent.click(obj(root, 0));
    await expect(marks(root)).toEqual([]);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), a faded CNT.02.t1 example: Pip counts the first four leaves aloud (each
 * marked in turn), then it is the child's turn: the teal ring and Pip's hand invite the next
 * uncounted leaf ("keep counting").
 */
export const DemoMode: Story = {
  globals: { ageMode: 'k' },
  args: { demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'tap', args: { index: 0 } });
    await expect(marks(root)).toEqual([1]);
    await demoController.play({ op: 'count-aloud', args: { upTo: 4 } });
    await expect(marks(root)).toEqual([1, 2, 3, 4]);
    await expect(tray(root)).toHaveAttribute('data-shown', 'false');
    await expect(demoController.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'count-aloud' });
    await waitFor(() => expect(obj(root, 4)).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(obj(root, 4)).not.toHaveAttribute('data-marked');
    await expect(obj(root, 4)).toBeEnabled();
    await expectPointerOn(hand(root), obj(root, 4), root);
    await expectRingClearOfBadges(root, obj(root, 4));
  },
};

const ordinalDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode, ordinal (a faded CNT.15.t1 example): Pip counts on from the "start here" arrow to
 * the sixth shell, then it is the child's turn: the teal ring and Pip's hand invite the seventh.
 * Nothing is picked yet.
 */
export const DemoOrdinal: Story = {
  args: { config: ordinalShells, demo: ordinalDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await ordinalDemo.play({ op: 'tap', args: { index: 0 } });
    await ordinalDemo.play({ op: 'count-aloud', args: { upTo: 6 } });
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6]);
    ordinalDemo.invite({ op: 'ring', args: { index: 6 } });
    await waitFor(() => expect(obj(root, 6)).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(0);
    await expect(obj(root, 6)).toHaveAttribute('aria-pressed', 'false');
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expectPointerOn(hand(root), obj(root, 6), root);
    await expectRingClearOfBadges(root, obj(root, 6));
    await expectOrdinalFits(root);
  },
};

const ordinalRingDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode, ordinal "show me" (CNT.15.t1 solution): Pip counts to seven and rings the seventh
 * shell. The generic `answer {id}` op rings an object too; there is one ring at a time, so the
 * later `ring` moves it.
 */
export const DemoOrdinalRing: Story = {
  args: { config: ordinalShells, disabled: true, demo: ordinalRingDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await ordinalRingDemo.play({ op: 'count-aloud', args: { upTo: 7 } });
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await ordinalRingDemo.play({ op: 'answer', args: { id: 'obj-5' } });
    await expect(obj(root, 5)).toHaveAttribute('data-ringed', 'true');
    await ordinalRingDemo.play({ op: 'ring', args: { index: 6 } });
    await expect(obj(root, 6)).toHaveAttribute('data-ringed', 'true');
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(1);
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expectOrdinalFits(root);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/**
 * Reduced motion: counting aloud and the generic `answer` op are instant. `say-total` enters the
 * number counted.
 */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fishPicture, tier: 'pictorial', disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'count-aloud', args: { upTo: 6 } });
    await reducedController.play({ op: 'answer', args: { value: 6 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6]);
    await expect(within(root).getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    // `answer` replaces the entry, it never appends (as the engine model does).
    await reducedController.play({ op: 'answer', args: { value: 4 } });
    await expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible();
    await reducedController.play({ op: 'say-total' });
    await expect(within(root).getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
  },
};
