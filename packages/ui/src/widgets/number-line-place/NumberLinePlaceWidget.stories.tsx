import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
  waitForSettled,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  contentBox,
  expectFitsArea,
  expectHandClearOfOthers,
  expectInside,
  expectPointerOn,
  expectRingClear,
  expectTraceOrdered,
  findWidget,
  inArea,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import { numberLineViewScale } from '../kit';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `number-line-place` (03 §5.5, Treasure Beach): plant the flag where the number goes, read the
 * marked number, or pick the closer benchmark. Pictorial tier only. The fixtures mirror what the
 * K01 generators build (CMP.04, CMP.06, CMP.09: place on 0–20 and 0–100 lines, with and without
 * ticks, labels or benchmarks); read, closer, hundredths and the thermometer cover the rest.
 */

type Config = ConfigFor<'number-line-place'>;

/** CMP.04.t1: 0–20, a tick every 1, numerals every 5, snap to the ticks. */
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
/** CMP.09.t1: 0–100 with no ticks, only the ends printed (estimation). */
const estimate: Config = {
  ...place,
  max: 100,
  ticksEvery: null,
  labelsEvery: null,
  target: 37,
  snap: 'none',
};
/** CMP.04.t2: 0–100 by tens, free placement. */
const tens: Config = {
  ...place,
  max: 100,
  ticksEvery: 10,
  labelsEvery: 10,
  target: 37,
  snap: 'none',
};
/** CMP.06.t2: 0–20 ticks, only the ends and two benchmarks are numbered. */
const benchmarks: Config = {
  ...place,
  labelsEvery: null,
  target: 13,
  benchmarks: [6, 17],
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
  // No leftover focus ring (from a story's clicks) may read as an invite ring.
  afterEach: async () => {
    (document.activeElement as HTMLElement | null)?.blur();
  },
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-nlp';
const marker = (root: HTMLElement) => root.querySelector('.ni-nlp__marker') as HTMLElement;
const strip = (root: HTMLElement) => root.querySelector('.ni-nlp__strip') as HTMLElement;
const checkBtn = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const stageOf = (root: HTMLElement) => root.querySelector('.ni-nlp__stage') as HTMLElement;

/** The scale the widget drew its horizontal line with (its measured width and headroom). */
function scaleOf(root: HTMLElement, c: Config) {
  const stage = stageOf(root);
  return numberLineViewScale({
    min: c.min,
    max: c.max,
    width: Number(stage.dataset.lineWidth),
    format: (v) => String(c.valueScale === 100 ? v / 100 : v),
    headroom: Number(stage.dataset.headroom),
  });
}

/** Screen point of a value on a horizontal place line, `above` px over the line. */
function linePoint(root: HTMLElement, c: Config, v: number, above = 60) {
  const stage = stageOf(root).getBoundingClientRect();
  const s = scaleOf(root, c);
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

/**
 * Maths truth: every tick is evenly spaced, every printed numeral sits exactly on its tick, and a
 * planted flag's pin is drawn at the value it reports.
 */
async function expectTruthfulLine(root: HTMLElement, c: Config) {
  const ticks = [...root.querySelectorAll<SVGLineElement>('.ni-numberline__tick')].map((l) =>
    Number(l.getAttribute('x1')),
  );
  if (c.ticksEvery !== null) {
    const steps = ticks.slice(1).map((x, i) => x - (ticks[i] as number));
    for (const d of steps) await expect(Math.abs(d - (steps[0] as number))).toBeLessThan(0.01);
    const s = scaleOf(root, c);
    await expect(Math.abs((ticks[0] as number) - s.x(c.min))).toBeLessThan(0.01);
    await expect(Math.abs((ticks.at(-1) as number) - s.x(c.max))).toBeLessThan(0.01);
  }
  const s = scaleOf(root, c);
  for (const text of root.querySelectorAll<SVGTextElement>('.ni-numberline__numeral')) {
    const shown = Number((text.textContent ?? '').replace('−', '-'));
    const value = c.valueScale === 100 ? Math.round(shown * 100) : shown;
    await expect(
      Math.abs(Number(text.getAttribute('x')) - s.x(value)),
      `${shown} on its tick`,
    ).toBeLessThan(0.01);
  }
  const anchor = root.querySelector<HTMLElement>('.ni-nlp__anchor[data-placed="true"]');
  if (anchor) {
    const pin = (anchor.querySelector('.ni-nlp__pin') as HTMLElement).getBoundingClientRect();
    const stage = stageOf(root).getBoundingClientRect();
    await waitForSettled(anchor);
    await expect(
      Math.abs(pin.left + pin.width / 2 - (stage.left + s.x(placedValue(root)))),
    ).toBeLessThan(1.5);
    await expect(Math.abs(pin.bottom - (stage.top + s.lineY))).toBeLessThan(1.5);
  }
}

/** The start of an item: the flag waits in its dock; nothing to check yet. */
export const Place: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(
      root.querySelector('.ni-nlp__anchor[data-docked="true"] .ni-nlp__marker'),
    ).not.toBeNull();
    await expect(checkBtn(root)).toBeDisabled();
    await expect(within(root).getByRole('button', { name: 'Number line' })).toBeVisible();
    await expectTruthfulLine(root, place);
  },
};

/** Mouse drag: the flag leaves its dock and lands on 13 (snapped to the tick), pin on 13. */
export const PlaceDragMouse: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const check = checkBtn(root);
    await expect(check).toBeDisabled();
    await pointerDrag(marker(root), linePoint(root, place, 13.3), 'mouse');
    await waitFor(() => expect(placedValue(root)).toBe(13));
    await expectTruthfulLine(root, place);
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
    const check = checkBtn(root);
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

/**
 * Tap-to-place: tap the line straight away, or pick up the flag (it speaks; an ink outline, not
 * the teal invite ring; the line stays quiet) and then tap.
 */
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
    await expect(marker(root)).toHaveAttribute('data-selected', 'true');
    await expect(getComputedStyle(marker(root)).outlineStyle).toBe('solid');
    await expect(marker(root)).not.toHaveClass('ni-invite');
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(0);
    await expect(getComputedStyle(strip(root)).outlineColor).toBe('rgba(0, 0, 0, 0)');
    tapAt(strip(root), linePoint(root, place, 13.4));
    await waitFor(() => expect(placedValue(root)).toBe(13));
    await userEvent.click(checkBtn(root));
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
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'placement', value: 13 });
    await expect(traceOf(args.onInteract).at(-1)).toMatchObject({ t: 'tap', target: 'line' });
  },
};

/** Estimation (CMP.09): no ticks, only the ends printed. A free placement keeps its spot. */
export const Estimate: Story = {
  args: { config: estimate },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-numberline__tick')).toHaveLength(2);
    await pointerDrag(marker(root), linePoint(root, estimate, 41), 'mouse');
    await waitFor(() => expect(placedValue(root)).toBeGreaterThan(0));
    await expect(Math.abs(placedValue(root) - 41)).toBeLessThanOrEqual(1);
    await expectTruthfulLine(root, estimate);
    await userEvent.click(checkBtn(root));
    const [[response]] = (args.onResponse as ReturnType<typeof fn>).mock.calls as [
      [{ kind: string; value: number }],
    ];
    await expect(response.kind).toBe('placement');
    await expect(Math.abs(response.value - 41)).toBeLessThanOrEqual(1);
  },
};

/** CMP.06.t2: only the ends and the two benchmarks are numbered, each on its own tick. */
export const BenchmarksK: Story = {
  globals: { ageMode: 'k' },
  args: { config: benchmarks },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const shown = [...root.querySelectorAll('.ni-numberline__numeral')].map((t) => t.textContent);
    await expect(shown.sort()).toEqual(['0', '17', '20', '6']);
    await expectTruthfulLine(root, benchmarks);
    const s = scaleOf(root, benchmarks);
    for (const b of [6, 17]) {
      const g = [...root.querySelectorAll<SVGGElement>('.ni-nlp__benchmark')].find(
        (el) => el.dataset.at === String(b),
      ) as SVGGElement;
      await expect(Number(g.querySelector('line')?.getAttribute('x1'))).toBeCloseTo(s.x(b), 2);
    }
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
    await expectTruthfulLine(root, hundredths);
    await userEvent.click(checkBtn(root));
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
    await userEvent.click(checkBtn(root));
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
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'b1' });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['b1']);
  },
};

/** Vertical (thermometer): drag the flag up the tube to 15. */
export const Vertical: Story = {
  args: { config: thermometer },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const stage = stageOf(root);
    const tall = Number(stage.dataset.tall);
    const r = stage.getBoundingClientRect();
    const y = 40 + ((30 - 15) / 40) * (tall - 80);
    await pointerDrag(marker(root), { x: r.left + 80, y: r.top + y + 2 }, 'touch');
    await waitFor(() => expect(placedValue(root)).toBe(15));
    // Keyboard on an upright line: up arrow goes up.
    strip(root).focus();
    await userEvent.keyboard('{ArrowUp}{Enter}');
    await waitFor(() => expect(placedValue(root)).toBe(20));
    await userEvent.click(checkBtn(root));
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
    await userEvent.click(checkBtn(root));
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
    await expect(checkBtn(root)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode: show a tick, count ticks, zoom, fly the flag. Unsupported ops throw (strict). A
 * disabled widget shows no invite: the cue waits until the child can act.
 */
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
    await expectTruthfulLine(root, place);
    await expect(demoController.play({ op: 'hop', args: { by: 1 } })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'answer', args: { value: 13 } });
    await new Promise((r) => setTimeout(r, 100));
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

/** The ring and Pip's hand are on ONE control, the hand's fingertip on it, the ring clear. */
async function expectInviteOn(root: HTMLElement, el: HTMLElement, others: Element[]) {
  // A tapped control keeps its focus ring; the only ring on screen must be the invite.
  (document.activeElement as HTMLElement | null)?.blur();
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  await waitForSettled(el);
  await new Promise((r) => requestAnimationFrame(r));
  await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, el, root);
  await expectHandClearOfOthers(
    root.querySelector('.ni-hand') as HTMLElement,
    [...root.querySelectorAll('button, .ni-nlp__marker')].filter((t) => t !== el),
  );
  await expectRingClear(
    el,
    others.filter((o) => o !== el),
  );
}

/** An invite ring stays ≥ 12 px inside the panel holding its control (the flag's dock). */
async function expectRingInsidePanel(el: HTMLElement, panel: HTMLElement) {
  const cs = getComputedStyle(el);
  const reach = Math.max(
    0,
    Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth),
  );
  const r = el.getBoundingClientRect();
  const ring = {
    left: r.left - reach,
    top: r.top - reach,
    right: r.right + reach,
    bottom: r.bottom + reach,
  };
  const p = panel.getBoundingClientRect();
  const border = Number.parseFloat(getComputedStyle(panel).borderTopWidth);
  const inner = {
    left: p.left + border,
    top: p.top + border,
    right: p.right - border,
    bottom: p.bottom - border,
  };
  await expectInside(ring, inner, 12, 'invite ring in its panel');
}

const placeInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn, K: `answer {value: 13}` rings the flag in its dock (Pip's hand on it); a
 * flag planted on 6 is still invited; once it stands on 13 the cue moves to Check.
 */
export const InvitePlaceK: Story = {
  globals: { ageMode: 'k' },
  args: { demo: placeInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    placeInvite.invite({ op: 'answer', args: { value: 13 } });
    await expectInviteOn(root, marker(root), [strip(root), checkBtn(root)]);
    await expectRingInsidePanel(marker(root), root.querySelector('.ni-nlp__dock') as HTMLElement);
    tapAt(strip(root), linePoint(root, place, 6));
    await waitFor(() => expect(placedValue(root)).toBe(6));
    await expectInviteOn(root, marker(root), [checkBtn(root)]);
    await pointerDrag(marker(root), linePoint(root, place, 13), 'touch');
    await waitFor(() => expect(placedValue(root)).toBe(13));
    // It ends on the invite: one ring, on Check, and Pip's hand.
    await expectInviteOn(root, checkBtn(root), [marker(root), strip(root)]);
  },
};

const readInvite: WidgetDemo = createDemoController({ strict: true });

/** Read, G1: the invite rings the next digit of 13 (1, then 3), then Check. */
export const InviteRead: Story = {
  args: { config: read, demo: readInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const key = (k: string) => root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
    const keys = () => [...root.querySelectorAll('.ni-pad__key')];
    readInvite.invite({ op: 'answer', args: { value: 13 } });
    await expectInviteOn(root, key('1'), keys());
    await userEvent.click(key('1'));
    await expectInviteOn(root, key('3'), keys());
    await userEvent.click(key('5'));
    await expectInviteOn(root, key('back'), keys());
    await userEvent.click(key('back'));
    await userEvent.click(key('3'));
    await expectInviteOn(root, checkBtn(root), keys());
  },
};

const closerInvite: WidgetDemo = createDemoController({ strict: true });

/** Closer, K: the invite rings the benchmark card, then Check. */
export const InviteCloserK: Story = {
  globals: { ageMode: 'k' },
  args: { config: closer, demo: closerInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const b1 = within(root).getByRole('button', { name: '40' });
    const b0 = within(root).getByRole('button', { name: '30' });
    closerInvite.invite({ op: 'answer', args: { id: 'b1' } });
    await expectInviteOn(root, b1, [b0, checkBtn(root)]);
    await userEvent.click(b1);
    await expectInviteOn(root, checkBtn(root), [b0, b1]);
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
  },
};

// ---------- the workshop's widget area (06 §1, §2) ----------

/** Every target the widget shows right now (the planted flag overlaps the line: left out). */
function targets(root: HTMLElement): HTMLElement[] {
  const docked = root.querySelector<HTMLElement>(
    '.ni-nlp__anchor[data-docked="true"] .ni-nlp__marker',
  );
  return [
    docked,
    root.querySelector<HTMLElement>('.ni-nlp__strip'),
    root.querySelector<HTMLElement>('.ni-nlp__checkslot .ni-btn'),
    root.querySelector<HTMLElement>('.ni-nlp__sign-toggle'),
    ...root.querySelectorAll<HTMLElement>('.ni-pad__key'),
    ...root.querySelectorAll<HTMLElement>('.ni-nlp__choices .ni-pick'),
  ].filter((el): el is HTMLElement => el !== null);
}

/**
 * The widget uses the area (the #89 bar): the bounding box of its parts covers at least 60 % of
 * the area card's inner box.
 */
async function expectFill(canvasElement: HTMLElement, parts: Element[], min = 0.6) {
  const inner = contentBox(areaBox(canvasElement));
  const rects = parts.map((p) => p.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const fill =
    ((right - left) * (bottom - top)) / ((inner.right - inner.left) * (inner.bottom - inner.top));
  await expect(fill, `widget fill ${(fill * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(min);
}

/** The widget fits the area: no scroll, every part inside, every target full size and spaced. */
async function expectPlaceFits(canvasElement: HTMLElement, root: HTMLElement, age: 'k' | 'g1-up') {
  await waitForSettled(root);
  const parts = [
    ...root.querySelectorAll('.ni-nlp__stage, .ni-nlp__dock, .ni-nlp__checkslot'),
    ...root.querySelectorAll('.ni-nlp__readout, .ni-nlp__padcell, .ni-nlp__choices'),
  ];
  await expectFitsArea(areaBox(canvasElement), parts, targets(root), age);
  await expectFill(canvasElement, parts);
}

/** The line uses the room: at least `min` px wide. */
async function expectLineAtLeast(root: HTMLElement, min: number) {
  await expect(Number(stageOf(root).dataset.lineWidth)).toBeGreaterThanOrEqual(min);
}

/**
 * K at the 960 × 600 minimum (852 × 319 inside the area): the dock and Check stand beside the
 * line, which takes the rest of the width. Drag onto 13; the invite then fits too.
 */
export const PlaceKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { demo: createDemoController({ strict: true }) },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-layout', 'side');
    await expectPlaceFits(canvasElement, root, 'k');
    await expectLineAtLeast(root, 500);
    await expectTruthfulLine(root, place);
    (args.demo as WidgetDemo).invite({ op: 'drop', args: { at: 13 } });
    await expectInviteOn(root, marker(root), [strip(root), checkBtn(root)]);
    await expectPlaceFits(canvasElement, root, 'k');
    await pointerDrag(marker(root), linePoint(root, place, 13), 'touch');
    await waitFor(() => expect(placedValue(root)).toBe(13));
    await expectTruthfulLine(root, place);
    await expectPlaceFits(canvasElement, root, 'k');
  },
};

/** G1 at the minimum: the same side layout; estimation 0–100 (CMP.09). */
export const EstimateG1MinLandscape: Story = {
  args: { config: estimate },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-layout', 'side');
    await expectPlaceFits(canvasElement, root, 'g1-up');
    // G1's Check shows its word, so the line is a little shorter than in K.
    await expectLineAtLeast(root, 460);
  },
};

/** CMP.04.t2 by tens, K, at the minimum. */
export const TensKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: tens },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'k');
    await expectTruthfulLine(root, tens);
  },
};

/** CMP.06.t2 benchmarks, G1, at the minimum. */
export const BenchmarksG1MinLandscape: Story = {
  args: { config: benchmarks },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'g1-up');
    await expectTruthfulLine(root, benchmarks);
  },
};

/** Read, G1, at the minimum: the 3 × 4 pad beside the line and its readout. */
export const ReadG1MinLandscape: Story = {
  args: { config: read },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-layout', 'side');
    await expectPlaceFits(canvasElement, root, 'g1-up');
  },
};

/** Read, K, at the minimum: four rows of K keys do not fit 319 px, so the pad is 4 × 3. */
export const ReadKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: read },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-pad-shape', '4x3');
    await expectPlaceFits(canvasElement, root, 'k');
  },
};

/** Closer, K, at the minimum. */
export const CloserKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: closer },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'k');
  },
};

/** The thermometer at the minimum: the tube shortens to the room's height. */
export const VerticalG1MinLandscape: Story = {
  args: { config: thermometer },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'g1-up');
  },
};

/** Portrait (746 × 812), K: the line across the top, dock and Check under it. */
export const PlaceKPortrait: Story = {
  globals: { ageMode: 'k' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-layout', 'stack');
    await expectPlaceFits(canvasElement, root, 'k');
    await expectLineAtLeast(root, 600);
  },
};

/** Portrait, G1 read: the pad under the readout. */
export const ReadG1Portrait: Story = {
  args: { config: read },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'g1-up');
  },
};

/** Tablet (1226 × 493), K. */
export const PlaceKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: benchmarks },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'k');
    await expectLineAtLeast(root, 800);
  },
};

/** Tablet, K read: the big 3 × 4 pad beside the line. */
export const ReadKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: read },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-pad-shape', '3x4');
    await expectPlaceFits(canvasElement, root, 'k');
  },
};

/** Tablet, G1 estimation 0–100. */
export const EstimateG1Tablet: Story = {
  args: { config: estimate },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPlaceFits(canvasElement, root, 'g1-up');
  },
};
