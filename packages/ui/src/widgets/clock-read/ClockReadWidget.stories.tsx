import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectHandsLeaveNumerals, expectNumeralsSolid } from '../../test-support/clockChecks';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { expectFitsArea, inArea } from '../../test-support/widgetArea';
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
 * `clock-read` (03 §5.5, pictorial): what time does the clock show? Configs are real generated
 * items (`generateItem(template, seed)` on the compiled #84 TIM templates), except the a.m. / p.m.
 * item: TIM.05 is K02's, so that one is hand-made and spec-valid.
 */

/** TIM.09.t2 seed 1: 3:30 on a face with no numbers, typed on the pad. */
const halfPast: ConfigFor<'clock-read'> = {
  format: 'clock-read',
  time: { h: 3, m: 30 },
  numerals: false,
  input: 'digital-pad',
};

/** TIM.04.t3 seed 2: 5:30 with numbers. */
const fiveThirty: ConfigFor<'clock-read'> = {
  format: 'clock-read',
  time: { h: 5, m: 30 },
  numerals: true,
  input: 'digital-pad',
};

/** TIM.09.t3 seed 1: which hour is it after? 8:10, hours to pick (MC distractors). */
const hourPick: ConfigFor<'clock-read'> = {
  format: 'clock-read',
  time: { h: 8, m: 10 },
  numerals: false,
  input: 'pick',
  options: [
    { id: 'opt-8', label: '8' },
    { id: 'opt-7', label: '7' },
    { id: 'opt-9', label: '9' },
    { id: 'opt-2', label: '2' },
  ],
};

/** Hand-made TIM.05-style: morning or evening? */
const amPm: ConfigFor<'clock-read'> = {
  format: 'clock-read',
  time: { h: 7, m: 0 },
  numerals: true,
  input: 'pick',
  ampm: { scene: 'beach', isPm: false },
};

const meta = {
  title: 'Widgets/Clock read',
  args: {
    config: halfPast as WidgetConfig,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-cread';
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const hand = (root: HTMLElement, h: 'hour' | 'minute') =>
  root.querySelector(`.ni-clock__hand[data-hand="${h}"]`) as SVGGElement;

/**
 * Maths truth: both hands come from the one time: the minute hand at 6° a minute, the hour hand at
 * 30° an hour plus 0.5° a minute (at 3:30 halfway between 3 and 4: 105°); 60 ticks, 12 of them
 * long; numbers 1–12 where the long ticks are.
 */
async function expectGeared(root: HTMLElement, h: number, m: number) {
  const face = root.querySelector('.ni-clock') as SVGSVGElement;
  await expect(face.getAttribute('data-time')).toBe(`${h}:${String(m).padStart(2, '0')}`);
  await expect(Number(hand(root, 'hour').dataset.angle)).toBeCloseTo((h % 12) * 30 + m * 0.5, 2);
  await expect(Number(hand(root, 'minute').dataset.angle)).toBeCloseTo(m * 6, 2);
  await expect(face.querySelectorAll('[data-tick]')).toHaveLength(60);
  await expect(face.querySelectorAll('[data-tick="five"]')).toHaveLength(12);
}

/**
 * Digital pad: 3:30. Type 3, tap the minutes box, type 3 and 0. Check waits for both minute
 * digits. Sizes: keys ≥ 64 px, ≥ 12 px apart.
 */
export const DigitalPad: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectGeared(root, 3, 30);
    await expect(Number(hand(root, 'hour').dataset.angle)).toBe(105);
    await expect(root.querySelectorAll('[data-numeral]')).toHaveLength(0);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    await userEvent.click(key(root, '3'));
    await userEvent.click(canvas.getByRole('button', { name: 'Minutes:' }));
    await userEvent.click(key(root, '3'));
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '0'));
    await expect(canvas.getByRole('button', { name: 'Hours: 3' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Minutes: 30' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [3, 30] });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:key-3',
      'tap:box-minutes',
      'tap:key-3',
      'tap:key-0',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Numbers on the face: they sit at their long ticks, 1 at 30°, 12 at the top. */
export const WithNumerals: Story = {
  args: { config: fiveThirty },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectGeared(root, 5, 30);
    const nums = [...root.querySelectorAll<SVGTextElement>('[data-numeral]')];
    await expect(nums.map((n) => n.textContent)).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i + 1)),
    );
    // Each number is in the direction of its hour: x = sin(30°·n), y = −cos(30°·n).
    for (const n of nums) {
      const k = Number(n.dataset.numeral);
      const x = Number(n.getAttribute('x'));
      const y = Number(n.getAttribute('y')) - 8;
      const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      const off = Math.abs(deg - ((k * 30) % 360));
      await expect(Math.min(off, 360 - off)).toBeLessThan(0.5);
    }
    // Every number the same ink at full opacity, nothing pale over it (the 11 once sat under the
    // face's glass shine), and the hands leave every number readable.
    const face = root.querySelector('.ni-clock') as SVGSVGElement;
    await expectNumeralsSolid(face);
    await expectHandsLeaveNumerals(face);
    // Numerals ≥ 32 px.
    await expect((nums[0] as SVGTextElement).getBoundingClientRect().height).toBeGreaterThanOrEqual(
      32,
    );
    // Keyboard: digits typed; Enter checks.
    await userEvent.keyboard('5');
    await userEvent.click(within(root).getByRole('button', { name: 'Minutes:' }));
    await userEvent.keyboard('30');
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [5, 30] });
  },
};

/** Hour pick: tapping an hour says it; check sends its id. */
export const HourPick: Story = {
  args: { config: hourPick },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectGeared(root, 8, 10);
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-cread__options .ni-pick')];
    await expect(cards.map((c) => c.dataset.id)).toEqual(['opt-8', 'opt-7', 'opt-9', 'opt-2']);
    for (const c of cards) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(cards);
    await userEvent.click(cards[1] as HTMLElement);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 7 }]);
    await userEvent.click(cards[0] as HTMLElement);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-8' });
  },
};

/** a.m. or p.m. (TIM.05-style): two cards. */
export const AmPm: Story = {
  args: { config: amPm },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-cread__options .ni-pick')];
    await expect(cards.map((c) => c.dataset.id)).toEqual(['am', 'pm']);
    await userEvent.click(cards[0] as HTMLElement);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.clock.am', undefined);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'am' });
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '3')).toBeDisabled();
    await userEvent.keyboard('3');
    await expect(within(root).getByRole('button', { name: 'Hours:' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo: Pip points at the short hand (it lights up, the hand pointer rests on it), counts the long
 * hand round by fives (5, 10, … 30, a dot on each five-minute mark) and types 3:30.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'point-hour' });
    await expect(hand(root, 'hour')).toHaveAttribute('data-lit', 'true');
    await expectPointerOn(
      root.querySelector('.ni-cread__hand') as HTMLElement,
      root.querySelector('.ni-cread__face') as HTMLElement,
      root,
    );
    await demoController.play({ op: 'point-minute' });
    await expect(hand(root, 'minute')).toHaveAttribute('data-lit', 'true');
    await demoController.play({ op: 'count-fives', args: { to: 30 } });
    await expect(root.querySelectorAll('.ni-clock__five')).toHaveLength(6);
    const counted = (audio.sayPhrases.mock.calls as unknown as [{ number: number }[]][]).map(
      ([p]) => p[0]?.number,
    );
    await expect(counted).toEqual([5, 10, 15, 20, 25, 30]);
    await demoController.play({ op: 'answer', args: { values: [3, 30] } });
    await expect(within(root).getByRole('button', { name: 'Minutes: 30' })).toBeVisible();
    await expectGeared(root, 3, 30);
    await expect(demoController.play({ op: 'drag-minute' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'answer', args: { values: [3, 30] } });
    await waitFor(() => expect(root.querySelector('.ni-padbox.ni-invite')).not.toBeNull());
  },
};

const pickDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo on the hour pick: point at the short hand, then pick 8; reduced motion: instant. */
export const DemoPickReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: hourPick, disabled: true, demo: pickDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await pickDemo.play({ op: 'point-hour' });
    await pickDemo.play({ op: 'count-fives', args: { to: 10 } });
    await pickDemo.play({ op: 'answer', args: { id: 'opt-8' } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(root.querySelector('.ni-pick[data-id="opt-8"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    pickDemo.invite({ op: 'answer', args: { id: 'opt-8' } });
    await waitFor(() => expect(root.querySelector('.ni-pick.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-invite-hand') as HTMLElement,
      root.querySelector('.ni-pick.ni-invite') as HTMLElement,
      root,
    );
  },
};

export const TabletArea: Story = {
  args: { config: fiveThirty },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
  },
};

export const LandscapeMinArea: Story = {
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
    await expectGeared(root, 3, 30);
  },
};

export const PickLandscapeMin: Story = {
  args: { config: hourPick },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
  },
};
