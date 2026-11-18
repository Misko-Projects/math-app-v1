import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import { numberLineViewScale } from '../kit';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `number-line-place` (03 §5.5, Treasure Beach): plant the flag where the number goes, read the
 * marked number, or pick the closer benchmark. Pictorial tier only.
 */

type Config = ConfigFor<'number-line-place'>;

const place: Config = {
  format: 'number-line-place',
  min: 0,
  max: 20,
  ticksEvery: 1,
  labelsEvery: 5,
  target: 13,
  mode: 'place',
  snap: 'tick',
  vertical: false,
  valueScale: 1,
};
const estimate: Config = {
  ...place,
  max: 100,
  ticksEvery: null,
  labelsEvery: null,
  target: 37,
  snap: 'none',
};
const read: Config = { ...place, mode: 'read' };
const closer: Config = {
  ...place,
  min: 30,
  max: 40,
  labelsEvery: 10,
  target: 37,
  mode: 'closer',
  benchmarks: [30, 40],
};
const thermometer: Config = {
  ...place,
  min: -10,
  max: 30,
  ticksEvery: 5,
  labelsEvery: 10,
  target: 15,
  vertical: true,
};
const hundredths: Config = {
  ...place,
  max: 100,
  ticksEvery: 10,
  labelsEvery: 50,
  target: 47,
  snap: 'none',
  valueScale: 100,
};

const meta = {
  title: 'Widgets/Number line place',
  args: {
    config: place as WidgetConfig,
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

const ROOT = '.ni-nlp';
const marker = (root: HTMLElement) => root.querySelector('.ni-nlp__marker') as HTMLElement;
const strip = (root: HTMLElement) => root.querySelector('.ni-nlp__strip') as HTMLElement;

/** Screen point of a value on a horizontal place line (the widget draws 1040 px, headroom 136). */
function linePoint(root: HTMLElement, c: Config, v: number, above = 60) {
  const stage = (root.querySelector('.ni-nlp__stage') as HTMLElement).getBoundingClientRect();
  const s = numberLineViewScale({ min: c.min, max: c.max, width: 1040, headroom: 136 });
  return { x: stage.left + s.x(v), y: stage.top + s.lineY - above };
}

/** Clicks the line strip at a screen point (a pointer click, detail 1). */
function tapAt(el: HTMLElement, p: { x: number; y: number }) {
  el.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: p.x,
      clientY: p.y,
      detail: 1,
    }),
  );
}

const placedValue = (root: HTMLElement) =>
  Number(root.querySelector('.ni-nlp__anchor[data-placed="true"]')?.getAttribute('data-value'));

/** The start of an item: the flag waits in its dock; nothing to check yet. */
export const Place: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(
      root.querySelector('.ni-nlp__anchor[data-docked="true"] .ni-nlp__marker'),
    ).not.toBeNull();
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(within(root).getByRole('button', { name: 'Number line' })).toBeVisible();
  },
};

/** Mouse drag: the flag leaves its dock and lands on 13 (snapped to the tick). */
export const PlaceDragMouse: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    const to = linePoint(root, place, 13.3);
    await pointerDrag(marker(root), to, 'mouse');
    await waitFor(() => expect(placedValue(root)).toBe(13));
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 13 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['drag:marker', 'drop:line']);
    // G1 sizes: the flag and check are ≥ 64 px.
    await expectTargetSize(marker(root), 'g1-up');
    await expectTargetSize(check, 'g1-up');
  },
};

/** Touch drag in K mode; then drag the planted flag again to move it. A mis-drop glides home. */
export const PlaceDragTouchK: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTargetSize(marker(root), 'k');
    await pointerDrag(marker(root), linePoint(root, place, 6), 'touch');
    await waitFor(() => expect(placedValue(root)).toBe(6));
    // Move it from 6 to 13.
    await pointerDrag(marker(root), linePoint(root, place, 12.8), 'touch');
    await waitFor(() => expect(placedValue(root)).toBe(13));
    // A drop far from the line (the top of the page) changes nothing.
    await pointerDrag(marker(root), { x: 20, y: 4 }, 'touch');
    await expect(placedValue(root)).toBe(13);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expectTargetSize(check, 'k');
    await expectTargetGaps([marker(root), check]);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 13 });
    const trace = traceOf(args.onInteract);
    await expect(trace.filter((e) => e.t === 'drop').map((e) => e.target)).toEqual([
      'line',
      'line',
      'none',
    ]);
  },
};

/** Tap-to-place: tap the line straight away, or pick up the flag (it speaks) and then tap. */
export const PlaceTapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    tapAt(strip(root), linePoint(root, place, 4.2));
    await waitFor(() => expect(placedValue(root)).toBe(4));
    // Pick the flag up: it says its number (06 §5), then tap 13 on the line.
    await userEvent.click(marker(root));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 13 }]);
    tapAt(strip(root), linePoint(root, place, 13.4));
    await waitFor(() => expect(placedValue(root)).toBe(13));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 13 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:line',
      'tap:marker',
      'tap:line',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Keyboard: Enter on the flag moves focus to the line; arrows move a ghost pin; Enter plants. */
export const PlaceKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    marker(root).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(strip(root)));
    for (let i = 0; i < 14; i++) await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(root.querySelector('.ni-nlp__cursor')).not.toBeNull();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(placedValue(root)).toBe(13));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 13 });
    await expect(traceOf(args.onInteract).at(-1)).toMatchObject({ t: 'tap', target: 'line' });
  },
};

/** Estimation: no ticks, only the ends printed. A free placement keeps its spot (no snapping). */
export const Estimate: Story = {
  args: { config: estimate },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-numberline__tick')).toHaveLength(2);
    await pointerDrag(marker(root), linePoint(root, estimate, 41), 'mouse');
    await waitFor(() => expect(placedValue(root)).toBeGreaterThan(0));
    await expect(Math.abs(placedValue(root) - 41)).toBeLessThanOrEqual(1);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const [[response]] = (args.onResponse as ReturnType<typeof fn>).mock.calls as [
      [{ kind: string; value: number }],
    ];
    await expect(response.kind).toBe('placement');
    await expect(Math.abs(response.value - 41)).toBeLessThanOrEqual(1);
  },
};

/** Hundredths (DEC.03): labels read 0, 0.5 and 1; the response stays in hundredths. */
export const Hundredths: Story = {
  args: { config: hundredths },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('button', { name: 'Flag 0.47' })).toBeVisible();
    await expect(within(root).getByText('0.5')).toBeInTheDocument();
    await pointerDrag(marker(root), linePoint(root, hundredths, 47), 'mouse');
    await waitFor(() => expect(placedValue(root)).toBe(47));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 47 });
  },
};

/** Read: an arrow points at 13; type it. A double Enter and Check inside 400 ms submit once. */
export const Read: Story = {
  args: { config: read },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-nlp__marker')).toBeNull();
    // Enter on an unfinished answer sends nothing and doesn't swallow the real Enter later.
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.click(root.querySelector('.ni-pad__key[data-key="1"]') as HTMLElement);
    await userEvent.keyboard('3');
    await expect(within(root).getByText('13')).toBeVisible();
    // Desktop keys with nothing focused (Enter on a focused pad key presses that key).
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 13 });
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** Closer to which? 37 sits between 30 and 40: pick a benchmark (it speaks) → choice b0 | b1. */
export const CloserK: Story = {
  args: { config: closer },
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const b0 = within(root).getByRole('button', { name: '30' });
    const b1 = within(root).getByRole('button', { name: '40' });
    await expectTargetSize(b0, 'k');
    await expectTargetGaps([b0, b1]);
    await userEvent.click(b1);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 40 }]);
    await expect(b1).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'b1' });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['b1']);
  },
};

/** Vertical (thermometer): drag the flag up the tube to 15. */
export const Vertical: Story = {
  args: { config: thermometer },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const stage = (root.querySelector('.ni-nlp__stage') as HTMLElement).getBoundingClientRect();
    const y = 40 + ((30 - 15) / 40) * 390;
    await pointerDrag(marker(root), { x: stage.left + 80, y: stage.top + y + 2 }, 'touch');
    await waitFor(() => expect(placedValue(root)).toBe(15));
    // Keyboard on an upright line: up arrow goes up.
    strip(root).focus();
    await userEvent.keyboard('{ArrowUp}{Enter}');
    await waitFor(() => expect(placedValue(root)).toBe(20));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 20 });
  },
};

/** Vertical read below zero: the minus key makes the typed number negative. */
export const VerticalReadNegative: Story = {
  args: { config: { ...thermometer, mode: 'read', target: -5 } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(within(root).getByRole('button', { name: 'Minus' }));
    await userEvent.keyboard('5');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: -5 });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    tapAt(strip(root), linePoint(root, place, 4));
    await pointerDrag(marker(root), linePoint(root, place, 8), 'mouse');
    await expect(root.querySelector('.ni-nlp__anchor[data-placed="true"]')).toBeNull();
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode: show a tick, count ticks, zoom, fly the flag; then invite the child's drop. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'show-tick', args: { at: 10 } });
    await expect(root.querySelector('.ni-nlp__shown')).not.toBeNull();
    const counting = demoController.play({ op: 'count-ticks', args: { from: 10, to: 13 } });
    // Numbered bubbles count the hops between ticks out loud…
    await waitFor(() => expect(root.querySelectorAll('.ni-nlp__count')).toHaveLength(3), {
      timeout: 4000,
    });
    await counting;
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 3 }]);
    // …then go, leaving the counted stretch marked.
    await waitFor(() => expect(root.querySelectorAll('.ni-nlp__count')).toHaveLength(0));
    await expect(root.querySelector('.ni-nlp__counted')).not.toBeNull();
    await demoController.play({ op: 'zoom', args: { from: 10, to: 15 } });
    await expect(root.querySelector('.ni-nlp__zoom')).not.toBeNull();
    await demoController.play({ op: 'drop', args: { at: 13 } });
    await expect(placedValue(root)).toBe(13);
    await expect(demoController.play({ op: 'hop', args: { by: 1 } })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'drop', args: { at: 13 } });
    await waitFor(() => expect(root.querySelector('.ni-nlp__marker.ni-invite')).not.toBeNull());
    // The flag stays planted where it is (the pulse doesn't move it off the line).
    await expect(placedValue(root)).toBe(13);
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: ops are instant state changes; `answer` plants the flag at once. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'count-ticks', args: { from: 0, to: 5 } });
    await reducedController.play({ op: 'answer', args: { value: 13 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(placedValue(root)).toBe(13);
  },
};

const readDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo in read and closer modes: `answer` types the value or picks the benchmark. */
export const DemoRead: Story = {
  args: { config: read, disabled: true, demo: readDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await readDemo.play({ op: 'answer', args: { value: 13 } });
    await expect(within(root).getByText('13')).toBeVisible();
    readDemo.invite({ op: 'answer', args: { value: 13 } });
    await waitFor(() => expect(root.querySelector('.ni-invite')).not.toBeNull());
  },
};
