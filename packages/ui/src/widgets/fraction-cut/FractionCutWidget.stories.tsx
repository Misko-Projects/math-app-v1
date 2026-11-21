import { stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectEqualShares,
  expectFitsArea,
  expectNumeralInk,
  expectSingleInvite,
  inArea,
  measuredShares,
  settle,
} from '../../test-support/fractionStoryArea';
import {
  center,
  clearSpies,
  expectTargetGaps,
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
 * `fraction-cut` (03 §5.5, concrete): cut the whole with the knives (tap, swipe, keyboard), then
 * fill parts (tap a part, or drag / tap-to-place the fill drop). Every response goes through the
 * real `fraction.cut` checker here too, and the drawn parts are measured: equal cuts are equal on
 * screen, and exactly the filled parts are filled.
 */

type Cut = ConfigFor<'fraction-cut'>;
const base = {
  format: 'fraction-cut',
  cutMode: 'guided',
  acceptNonCongruent: false,
  thenName: false,
} as const;

// FRA.01.t1 (frac.partition cut), seed 1: "Cut it into halves. Then fill one part." A rect.
const rectHalves: Cut = { ...base, shape: 'rect', parts: 2, shade: 1 };
// FRA.01.t1, seed 8: a circle in fourths, fill one.
const circleFourths: Cut = { ...base, shape: 'circle', parts: 4, shade: 1 };
// FRA.01.t2, seed 1: "Cut the strip into halves. Then fill one part."
const barHalves: Cut = { ...base, shape: 'bar', parts: 2, shade: 1 };
// FRA.07.t3, seed 1: "Cut it into 4 parts that are all the same size." A square, nothing to fill.
const squareFourths: Cut = { ...base, shape: 'square', parts: 4 };
// FRA.08.t2, seeds 14, 9 and 23: a rect in eighths, a circle in eighths, a circle in thirds.
const rectEighths: Cut = { ...base, shape: 'rect', parts: 8 };
const circleEighths: Cut = { ...base, shape: 'circle', parts: 8 };
const circleThirds: Cut = { ...base, shape: 'circle', parts: 3 };
// Authored (no K01 template uses free cuts, grids or naming yet): configs the model's schema accepts.
const freeThirds: Cut = { ...base, shape: 'rect', parts: 3, cutMode: 'free' };
const gridFourths: Cut = {
  ...base,
  shape: 'grid',
  gridSize: [4, 4],
  parts: 4,
  shade: 1,
  cutMode: 'free',
  acceptNonCongruent: true,
};
const loafThirds: Cut = { ...base, shape: 'loaf', parts: 3, shade: 2, thenName: true };

const meta = {
  title: 'Widgets/Fraction cut',
  args: {
    config: rectHalves as WidgetConfig,
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

const ROOT = '.ni-fcut';
const knives = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-fcut__knife[data-knife]'),
];
const knife = (root: HTMLElement, line: number) =>
  root.querySelector(`.ni-fcut__knife[data-knife="${line}"]`) as HTMLElement;
const partEls = (root: HTMLElement) =>
  [...root.querySelectorAll<SVGPathElement>('path.ni-fcut__part')].sort(
    (a, b) => Number(a.dataset.part) - Number(b.dataset.part),
  );
const part = (root: HTMLElement, i: number) =>
  root.querySelector(`path.ni-fcut__part[data-part="${i}"]`) as SVGPathElement;
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const fill = (root: HTMLElement) => within(root).getByRole('button', { name: 'Fill' });
const back = (root: HTMLElement) => within(root).getByRole('button', { name: 'Take back' });
const stage = (root: HTMLElement) => root.querySelector('.ni-fcut__stage') as HTMLElement;

/** The response passes the real checker for these parts and shading. */
async function expectCorrect(r: ResponseValue, parts: number, shade = 0, extra = {}) {
  await expect(r.kind).toBe('state');
  const ok = stateChecker('fraction.cut')?.check(
    { parts, shade, acceptNonCongruent: false, ...extra },
    (r as { value: Record<string, unknown> }).value,
  );
  await expect(ok).toBe(true);
}

const lastResponse = (onResponse: unknown) =>
  (onResponse as ReturnType<typeof fn>).mock.calls.at(-1)?.[0] as ResponseValue;

/** Exactly `n` parts are drawn filled, and they (and only they) have solid outlines. */
async function expectFilled(root: HTMLElement, n: number) {
  const filled = root.querySelectorAll<SVGPathElement>(
    'path.ni-fcut__part[data-fraction="filled"]',
  );
  await expect(filled).toHaveLength(n);
  for (const p of filled) await expect(getComputedStyle(p).strokeDasharray).toBe('none');
}

/** A design-unit point of the whole, in client px (the drawing scales uniformly). */
function at(root: HTMLElement, x: number, y: number) {
  const svg = root.querySelector('.ni-fcut__svg') as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return { x: r.left + (x / vb.width) * r.width, y: r.top + (y / vb.height) * r.height };
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** A finger swipe across the stage from one client point to another. */
async function swipe(
  from: { x: number; y: number },
  to: { x: number; y: number },
  pointerType: 'touch' | 'mouse' = 'touch',
) {
  const init = (p: { x: number; y: number }, buttons: number): PointerEventInit => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: pointerType === 'mouse' ? 1 : 77,
    pointerType,
    isPrimary: true,
    clientX: p.x,
    clientY: p.y,
    button: 0,
    buttons,
  });
  const start = document.elementFromPoint(from.x, from.y) as Element;
  start.dispatchEvent(new PointerEvent('pointerdown', init(from, 1)));
  for (let i = 1; i <= 8; i += 1) {
    const p = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
    window.dispatchEvent(new PointerEvent('pointermove', init(p, 1)));
    await nextFrame();
  }
  window.dispatchEvent(new PointerEvent('pointerup', init(to, 0)));
  await nextFrame();
}

/**
 * K, FRA.01.t1 seed 1: tap the knife, the rect falls into two halves that move apart (measured
 * equal on screen); tap a half to fill it (counted aloud: "one"); check. K-sized knife and parts.
 */
export const RectHalvesK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(knives(root)).toHaveLength(1);
    await expectTargetSize(knife(root, 0), 'k');
    await expect(check(root)).toBeDisabled();
    await expect(fill(root)).toBeDisabled();
    await userEvent.click(knife(root, 0));
    await expect(knives(root)).toHaveLength(0);
    await settle(root);
    await expectEqualShares(measuredShares(stage(root)), 2);
    const halves = partEls(root);
    for (const p of halves) await expectTargetSize(p, 'k');
    await expectTargetGaps(halves);
    await userEvent.click(part(root, 0));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 1 }]);
    await expectFilled(root, 1);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(lastResponse(args.onResponse)).toEqual({
      kind: 'state',
      value: { regions: [0.5, 0.5], shaded: [0] },
    });
    await expectCorrect(lastResponse(args.onResponse), 2, 1);
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:knife-0', 'tap:part-0']);
    // Emptying the part again is an undo in the trace, by pointer and by keyboard.
    (args.onInteract as ReturnType<typeof fn>).mockClear();
    await userEvent.click(part(root, 0));
    await expectFilled(root, 0);
    part(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await expectFilled(root, 1);
    await userEvent.keyboard('{Enter}');
    await expectFilled(root, 0);
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'undo:part-0',
      'tap:part-0',
      'undo:part-0',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Smallest landscape area, K, FRA.01.t1 seed 8 (a circle in fourths): a touch swipe down
 * through the middle cuts the first diameter, the second knife cuts the other; then the fill drop
 * is dragged (touch) onto a quarter. Everything fits with no scroll; the quarters measure equal.
 */
export const CircleFourthsLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: circleFourths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(root, areaBox(canvasElement), 'k', [
      ...knives(root),
      fill(root),
      check(root),
      back(root),
    ]);
    // Swipe from 12 o'clock to 6 o'clock: guided line 0.
    await swipe(at(root, 120, 20), at(root, 120, 220));
    await expect(root).toHaveAttribute('data-parts', '2');
    await userEvent.click(knife(root, 1));
    await expectEqualShares(measuredShares(stage(root)), 4);
    await settle(root);
    const quarters = partEls(root);
    await expectFitsArea(
      root,
      areaBox(canvasElement),
      'k',
      [...quarters, fill(root), check(root), back(root)],
      {
        gaps: false,
      },
    );
    for (const q of quarters) await expectTargetSize(q, 'k');
    await pointerDrag(fill(root), center(part(root, 2)), 'touch');
    await expectFilled(root, 1);
    await expect(part(root, 2)).toHaveAttribute('data-fraction', 'filled');
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 4, 1);
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:shape',
      'drop:line-0',
      'tap:knife-1',
      'drag:fill',
      'drop:part-2',
    ]);
  },
};

/**
 * Tablet area, FRA.07.t3 seed 1 (a square in fourths, nothing to fill): keyboard only (06 §7).
 * Tab to a knife, Enter; the other knife, Space; Tab to check, Enter. No fill drop is shown.
 */
export const SquareFourthsKeyboardTablet: Story = {
  args: { config: squareFourths },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).queryByRole('button', { name: 'Fill' })).toBeNull();
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [
      ...knives(root),
      check(root),
      back(root),
    ]);
    knife(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    knife(root, 1).focus();
    await userEvent.keyboard(' ');
    await expectEqualShares(measuredShares(stage(root)), 4);
    check(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(lastResponse(args.onResponse)).toEqual({
      kind: 'state',
      value: { regions: [0.25, 0.25, 0.25, 0.25], shaded: [] },
    });
    await expectCorrect(lastResponse(args.onResponse), 4, 0);
  },
};

/** FRA.01.t2 seed 1, tap-to-place: tap the fill drop, then the right half. */
export const BarHalvesTapToPlace: Story = {
  args: { config: barHalves },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(knife(root, 0));
    await userEvent.click(fill(root));
    await expect(fill(root)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(part(root, 1));
    await expectFilled(root, 1);
    await expect(part(root, 1)).toHaveAttribute('data-fraction', 'filled');
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({
      kind: 'state',
      value: { regions: [0.5, 0.5], shaded: [1] },
    });
  },
};

/**
 * Smallest landscape area, FRA.08.t2 seed 14 (a rect in eighths): seven knives, alternating above
 * and below so each keeps its size and gap; all inside the area. Cutting every line gives eight
 * parts that measure equal.
 */
export const RectEighthsLandscapeMin: Story = {
  args: { config: rectEighths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(knives(root)).toHaveLength(7);
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [
      ...knives(root),
      check(root),
      back(root),
    ]);
    for (let i = 0; i < 7; i += 1) await userEvent.click(knife(root, i));
    await expectEqualShares(measuredShares(stage(root)), 8);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 8, 0);
  },
};

/**
 * K at the smallest landscape area, FRA.08.t2 seed 9 (a circle in eighths): four K-sized knives
 * round a small circle would crowd, so one knife shows at a time, at the next line to cut;
 * tapping it four times cuts every diameter.
 */
export const CircleEighthsOneKnifeK: Story = {
  globals: { ageMode: 'k' },
  args: { config: circleEighths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(knives(root)).toHaveLength(1);
    await expectFitsArea(root, areaBox(canvasElement), 'k', [
      ...knives(root),
      check(root),
      back(root),
    ]);
    for (let i = 0; i < 4; i += 1) {
      await expect(knives(root)[0]).toHaveAttribute('data-knife', String(i));
      await userEvent.click(knives(root)[0] as HTMLElement);
    }
    await expect(knives(root)).toHaveLength(0);
    await expectEqualShares(measuredShares(stage(root)), 8);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 8, 0);
  },
};

/** Tablet area, K, FRA.08.t2 seed 9: a circle in eighths, four diameters, eight equal sectors. */
export const CircleEighthsTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: circleEighths },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(knives(root)).toHaveLength(4);
    await expectFitsArea(root, areaBox(canvasElement), 'k', [
      ...knives(root),
      check(root),
      back(root),
    ]);
    for (let i = 0; i < 4; i += 1) await userEvent.click(knife(root, i));
    await expectEqualShares(measuredShares(stage(root)), 8);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 8, 0);
  },
};

/**
 * FRA.08.t2 seed 23: a circle in thirds has three radii. One radius is only a slit (still one
 * part); a half-done cut answers two unequal parts, which the checker rejects.
 */
export const CircleThirdsPartial: Story = {
  args: { config: circleThirds },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(knife(root, 0));
    await expect(check(root)).toBeDisabled();
    await userEvent.click(knife(root, 1));
    await userEvent.click(check(root));
    const half = lastResponse(args.onResponse) as unknown as { value: { regions: number[] } };
    await expect(half.value.regions.map((x) => Math.round(x * 3))).toEqual([1, 2]);
    await expect(
      stateChecker('fraction.cut')?.check(
        { parts: 3, shade: 0, acceptNonCongruent: false },
        half.value,
      ),
    ).toBe(false);
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.click(knife(root, 2));
    await expectEqualShares(measuredShares(stage(root)), 3);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 3, 0);
  },
};

/** Take back undoes the last cut or fill (trace `undo`). */
export const TakeBack: Story = {
  args: { config: circleFourths },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const back = within(root).getByRole('button', { name: 'Take back' });
    await expect(back).toBeDisabled();
    await userEvent.click(knife(root, 0));
    await userEvent.click(knife(root, 1));
    await userEvent.click(part(root, 0));
    await expectFilled(root, 1);
    await userEvent.click(back);
    await expectFilled(root, 0);
    await userEvent.click(back);
    await expect(partEls(root)).toHaveLength(2);
    await expect(knives(root)).toHaveLength(1);
    await expect(traceOf(args.onInteract).filter((e) => e.t === 'undo')).toHaveLength(2);
  },
};

/**
 * Free cuts (authored, a rect in thirds): swipe down at a third and at two thirds (mouse), and the
 * three parts measure equal; a keyboard knife works too (arrows move its dotted line).
 */
export const FreeThirds: Story = {
  args: { config: freeThirds },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(knives(root)).toHaveLength(0);
    await settle(root);
    const x1 = 10 + 280 / 3;
    await swipe(at(root, x1, 12), at(root, x1, 180), 'mouse');
    const down = within(root).getByRole('button', { name: 'Cut up and down' });
    down.focus();
    await userEvent.keyboard('{Enter}');
    await expect(down).toHaveAttribute('aria-pressed', 'true');
    // From the middle (24/48) to two thirds (32/48): eight steps right.
    for (let i = 0; i < 8; i += 1) await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await expectEqualShares(measuredShares(stage(root)), 3);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 3, 0);
  },
};

/**
 * A 4 × 4 grid in fourths where equal parts need not look the same (acceptNonCongruent): a long
 * swipe cuts it in half; short swipes cut only the part under them: two 1 × 4 strips on the left,
 * two 2 × 2 squares on the right. Four equal areas, two shapes.
 */
export const GridNotCongruent: Story = {
  args: { config: gridFourths },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const g = 44;
    await swipe(at(root, 10 + 2 * g, 12), at(root, 10 + 2 * g, 10 + 4 * g - 2));
    await swipe(at(root, 10 + g, 20 + g), at(root, 10 + g, 10 + 3 * g));
    await swipe(at(root, 10 + 2.1 * g, 10 + 2 * g), at(root, 10 + 3.9 * g, 10 + 2 * g));
    await expect(partEls(root)).toHaveLength(4);
    await expectEqualShares(measuredShares(stage(root)), 4);
    await userEvent.click(part(root, 0));
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 4, 1, { acceptNonCongruent: true });
  },
};

/** thenName (authored loaf in thirds, fill two): cut, fill two slices, type 2 over 3, check. */
export const LoafNameTablet: Story = {
  args: { config: loafThirds },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(knife(root, 0));
    await userEvent.click(knife(root, 1));
    await expectEqualShares(measuredShares(stage(root)), 3);
    await userEvent.click(part(root, 0));
    await userEvent.click(part(root, 2));
    await expectFilled(root, 2);
    await expect(check(root)).toBeDisabled();
    await userEvent.click(within(root).getByRole('button', { name: 'Top number' }));
    await userEvent.click(within(root).getByRole('button', { name: '2' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Bottom number' }));
    await userEvent.click(within(root).getByRole('button', { name: '3' }));
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [check(root), back(root)]);
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toMatchObject({
      kind: 'state',
      value: { shaded: [0, 2], name: [2, 3] },
    });
    await expectCorrect(lastResponse(args.onResponse), 3, 2, { thenName: true });
  },
};

/** `disabled`: no knives, no input. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(knife(root, 0)).toBeDisabled();
    await swipe(at(root, 150, 12), at(root, 150, 190));
    await expect(partEls(root)).toHaveLength(1);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), FRA.01.t1 seed 8's solution: Pip cuts line 0 and line 1 (a blade runs
 * along each), fills part 0, pulls the parts apart, then stacks them (they cover each other
 * exactly). Ops the format does not have throw.
 */
export const DemoMode: Story = {
  args: { config: circleFourths, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cutting = demoController.play({ op: 'cut', args: { line: 0 } });
    await waitFor(() => expect(root.querySelector('.ni-fcut__blade')).not.toBeNull());
    await cutting;
    await demoController.play({ op: 'cut', args: { line: 1 } });
    await demoController.play({ op: 'shade', args: { part: 0 } });
    await expectFilled(root, 1);
    await expectEqualShares(measuredShares(stage(root)), 4);
    await demoController.play({ op: 'separate' });
    await expect(stage(root)).toHaveAttribute('data-view', 'separated');
    await demoController.play({ op: 'stack-parts' });
    await expect(stage(root)).toHaveAttribute('data-view', 'stacked');
    await expect(demoController.play({ op: 'highlight' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the knife to tap, then at the part to fill. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'cut', args: { line: 0 } });
    await waitFor(() => expect(root.querySelector('.ni-fcut__knife.ni-invite')).not.toBeNull());
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, knife(root, 0), root);
    await expectSingleInvite(root);
    await userEvent.click(knife(root, 0));
    inviteController.invite({ op: 'shade', args: { part: 1 } });
    await waitFor(() => expect(part(root, 1)).toHaveAttribute('data-invite', 'true'));
    await settle(root);
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    // The hand is measured where the part comes to rest (parts move apart once cut).
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      part(root, 1) as unknown as HTMLElement,
      root,
    );
    await expectSingleInvite(root);
    // The story ends in the invited state: the part's ring and Pip's hand stay visible.
    await expect(part(root, 1)).toHaveAttribute('data-invite', 'true');
    await expect(root.querySelector('.ni-hand') as HTMLElement).toBeVisible();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: cuts and fills are instant (no blade run). */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: rectHalves, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // The blade never runs: watch for it while the cut plays.
    let blades = 0;
    const seen = new MutationObserver(() => {
      if (root.querySelector('.ni-fcut__blade')) blades += 1;
    });
    seen.observe(root, { childList: true, subtree: true });
    await reducedController.play({ op: 'cut', args: { line: 0 } });
    await reducedController.play({ op: 'shade', args: { part: 0 } });
    seen.disconnect();
    await expect(blades).toBe(0);
    // Instant is checked by the effect, never by the clock: once the op resolves, the result is
    // drawn and nothing is still moving.
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running'),
    ).toHaveLength(0);
    await expect(partEls(root)).toHaveLength(2);
    await expectFilled(root, 1);
  },
};

// ---------- evidence audit: stress (twelfths) and K tap sizes ----------

// Authored stress configs (K01 cuts up to eighths): a rect and a circle in twelfths.
const rectTwelfths: Cut = { ...base, shape: 'rect', parts: 12 };
const circleTwelfths: Cut = { ...base, shape: 'circle', parts: 12 };

async function cutAllAndCheck(canvasElement: HTMLElement, parts: number, ageMode: 'k' | 'g1-up') {
  const root = await findWidget(canvasElement, ROOT);
  await expectFitsArea(root, areaBox(canvasElement), ageMode, [
    ...knives(root),
    check(root),
    back(root),
  ]);
  // Every line cut through whichever knife shows (one per line, or one at a time).
  for (let i = 0; i < 12 && knives(root).length > 0; i += 1) {
    await userEvent.click(knives(root)[0] as HTMLElement);
  }
  await expect(knives(root)).toHaveLength(0);
  await settle(root);
  await expectEqualShares(measuredShares(stage(root)), parts);
  // Cut apart, the parts still fit the area with no scroll.
  await expectFitsArea(root, areaBox(canvasElement), ageMode, [check(root), back(root)]);
  await userEvent.click(check(root));
  return root;
}

/** Stress: a rect in twelfths (eleven lines) at the tablet area. */
export const RectTwelfthsTablet: Story = {
  args: { config: rectTwelfths },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    await cutAllAndCheck(canvasElement, 12, 'g1-up');
    await expectCorrect(lastResponse(args.onResponse), 12, 0);
  },
};

/** Stress: a rect in twelfths at the smallest landscape area. */
export const RectTwelfthsLandscapeMin: Story = {
  args: { config: rectTwelfths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    await cutAllAndCheck(canvasElement, 12, 'g1-up');
    await expectCorrect(lastResponse(args.onResponse), 12, 0);
  },
};

/** Stress: a circle in twelfths (six diameters), K, at the tablet area. */
export const CircleTwelfthsTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: circleTwelfths },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    await cutAllAndCheck(canvasElement, 12, 'k');
    await expectCorrect(lastResponse(args.onResponse), 12, 0);
  },
};

/** Stress: a circle in twelfths, K, at the smallest landscape area (one knife at a time). */
export const CircleTwelfthsLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: circleTwelfths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    await cutAllAndCheck(canvasElement, 12, 'k');
    await expectCorrect(lastResponse(args.onResponse), 12, 0);
  },
};

/**
 * K at the smallest landscape area, a strip in fourths to fill one (FRA.01.t2 with den 4): every
 * part the child taps is K-sized, 12 px apart, and clear of the tools.
 */
export const BarFourthsTapSizesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...barHalves, parts: 4 } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 3; i += 1) await userEvent.click(knife(root, i));
    await settle(root);
    await expectFitsArea(root, areaBox(canvasElement), 'k', [
      ...partEls(root),
      fill(root),
      check(root),
      back(root),
    ]);
  },
};

// ---------- thenName at the smallest landscape area: two steps ----------

const nameIt = (root: HTMLElement) => within(root).getByRole('button', { name: 'Name it' });
const keysOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-fentry__key')];

/**
 * thenName at the 960 × 600 area (G1: naming fractions with numerals is grade 3), authored loaf in
 * thirds, fill two. Step 1 has the whole room: knives, then K-or-G1-sized parts to fill, Fill, Take
 * back and Name it. Step 2 ("Name it") shows the finished picture beside the stacked boxes and the
 * pad, with Back and an icon-only Check under the boxes. Nothing scrolls in either step.
 */
export const ThenNameLandscapeMin: Story = {
  args: { config: loafThirds },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const area = areaBox(canvasElement);
    await expect(root.querySelector('.ni-fentry')).toBeNull();
    await expectFitsArea(root, area, 'g1-up', [
      ...knives(root),
      fill(root),
      back(root),
      nameIt(root),
    ]);
    await expect(nameIt(root)).toBeDisabled();
    await userEvent.click(knife(root, 0));
    await userEvent.click(knife(root, 1));
    await settle(root);
    await expectEqualShares(measuredShares(stage(root)), 3);
    // Every part the child fills is G1-sized and 12 px from the others and the tools.
    await expectFitsArea(root, area, 'g1-up', [
      ...partEls(root),
      fill(root),
      back(root),
      nameIt(root),
    ]);
    await userEvent.click(part(root, 0));
    await userEvent.click(part(root, 2));
    await expectFilled(root, 2);
    await userEvent.click(nameIt(root));
    // Step 2: the picture stays (filled parts and all), no longer tappable; the pad beside it.
    await expectFilled(root, 2);
    await expect(root.querySelectorAll('path.ni-fcut__part[role="button"]')).toHaveLength(0);
    const top = within(root).getByRole('button', { name: 'Top number' });
    const bottom = within(root).getByRole('button', { name: 'Bottom number' });
    const toCut = within(root).getByRole('button', { name: 'Back' });
    await expectFitsArea(root, area, 'g1-up', [top, bottom, ...keysOf(root), check(root), toCut]);
    await expectNumeralInk(root.querySelectorAll('.ni-fentry__digit'));
    await userEvent.click(top);
    await userEvent.click(within(root).getByRole('button', { name: '2' }));
    await userEvent.click(bottom);
    await userEvent.click(within(root).getByRole('button', { name: '3' }));
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toMatchObject({
      kind: 'state',
      value: { shaded: [0, 2], name: [2, 3] },
    });
    await expectCorrect(lastResponse(args.onResponse), 3, 2, { thenName: true });
    // Back returns to cutting and filling, with everything as it was.
    await userEvent.click(toCut);
    await expect(root.querySelector('.ni-fentry')).toBeNull();
    await expectFilled(root, 2);
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(
      expect.arrayContaining(['name-it', 'back-to-cut', 'top', 'key-2', 'bottom', 'key-3']),
    );
  },
};

const nameInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Pip invites the naming at the 960 × 600 area: in the naming step, one ring on the top box,
 * 12 px clear of everything else, and Pip's hand under it (the story ends invited).
 */
export const ThenNameInviteLandscapeMin: Story = {
  args: { config: loafThirds, demo: nameInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(knife(root, 0));
    await userEvent.click(knife(root, 1));
    await userEvent.click(part(root, 0));
    // Still cutting: the answer starts with "Name it", so that is what Pip points at.
    nameInvite.invite({ op: 'answer', args: { values: [1, 3] } });
    await waitFor(() => expect(nameIt(root)).toHaveClass('ni-invite'));
    await expectSingleInvite(root);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, nameIt(root), root);
    await userEvent.click(nameIt(root));
    nameInvite.invite({ op: 'answer', args: { values: [1, 3] } });
    await waitFor(() => expect(root.querySelector('.ni-fentry__box.ni-invite')).not.toBeNull());
    const box = root.querySelector('.ni-fentry__box.ni-invite') as HTMLElement;
    await expect(box).toHaveAttribute('data-slot', '0');
    await expectSingleInvite(root);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, box, root);
    await expect(root.querySelector('.ni-hand') as HTMLElement).toBeVisible();
  },
};

/** Stress: thenName with a rect in sixths at the 960 × 600 area: six G1-sized parts to fill. */
export const ThenNameSixthsLandscapeMin: Story = {
  args: { config: { ...base, shape: 'rect', parts: 6, shade: 5, thenName: true } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const area = areaBox(canvasElement);
    for (let i = 0; i < 5 && knives(root).length > 0; i += 1) {
      await userEvent.click(knives(root)[0] as HTMLElement);
    }
    await settle(root);
    await expectEqualShares(measuredShares(stage(root)), 6);
    await expectFitsArea(root, area, 'g1-up', [
      ...partEls(root),
      fill(root),
      back(root),
      nameIt(root),
    ]);
    for (let i = 0; i < 5; i += 1) await userEvent.click(part(root, i));
    await userEvent.click(nameIt(root));
    await userEvent.click(within(root).getByRole('button', { name: 'Top number' }));
    await userEvent.keyboard('5');
    await userEvent.click(within(root).getByRole('button', { name: 'Bottom number' }));
    await userEvent.keyboard('6');
    const toCut = within(root).getByRole('button', { name: 'Back' });
    await expectFitsArea(root, area, 'g1-up', [...keysOf(root), check(root), toCut]);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 6, 5, { thenName: true });
  },
};

// ---------- taking one cut back where it is (the seam between two parts) ----------

const seams = (root: HTMLElement) => [...root.querySelectorAll<SVGPathElement>('.ni-fcut__seam')];

/**
 * K: a cut is taken back by tapping it. The seam is a full K target wide here (the halves leave
 * room), the knife for that line comes back, and Enter on the seam does the same.
 */
export const SeamTakesCutBackK: Story = {
  globals: { ageMode: 'k' },
  args: { config: rectHalves },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(seams(root)).toHaveLength(0);
    await userEvent.click(knife(root, 0));
    await expect(root).toHaveAttribute('data-parts', '2');
    await expect(seams(root)).toHaveLength(1);
    const seam = seams(root)[0] as SVGPathElement;
    await expect(Number(seam.getAttribute('data-band'))).toBeGreaterThanOrEqual(80);
    // Fill a part, then take the cut back: the whole is whole again and nothing is filled.
    await userEvent.click(part(root, 0));
    await expectFilled(root, 1);
    await userEvent.click(seam);
    await expect(root).toHaveAttribute('data-parts', '1');
    await expectFilled(root, 0);
    await expect(check(root)).toBeDisabled();
    // The knife is back; cut again and take it back from the keyboard.
    await userEvent.click(knife(root, 0));
    await expect(root).toHaveAttribute('data-parts', '2');
    const again = seams(root)[0] as SVGPathElement;
    again.focus();
    await expect(again).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(root).toHaveAttribute('data-parts', '1');
    await expect(
      traceOf(args.onInteract)
        .map((e) => `${e.t}:${e.target}`)
        .filter((e) => e.startsWith('undo')),
    ).toEqual(['undo:cut-line-0', 'undo:cut-line-0']);
    // Take back (the button) undoes the mend itself.
    await userEvent.click(back(root));
    await expect(root).toHaveAttribute('data-parts', '2');
  },
};

/** A circle in fourths: taking one diameter back leaves the other, as two halves. */
export const SeamOnACircle: Story = {
  args: { config: circleFourths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(knife(root, 0));
    await userEvent.click(knife(root, 1));
    await expect(root).toHaveAttribute('data-parts', '4');
    // One seam for each cut line (a diameter is one cut, two radii).
    await expect(seams(root).map((el) => el.getAttribute('data-seam'))).toEqual([
      'cut-line-0',
      'cut-line-1',
    ]);
    await userEvent.click(seams(root)[1] as SVGPathElement);
    await expect(root).toHaveAttribute('data-parts', '2');
    await expectEqualShares(measuredShares(root), 2);
    await userEvent.click(part(root, 0));
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({
      kind: 'state',
      value: { regions: [0.5, 0.5], shaded: [0] },
    });
  },
};

/**
 * Twelfths at the smallest landscape area: every seam is there, none is wider than two fifths of
 * a part, and the middle of every part still belongs to the part (a tap there fills it).
 */
export const SeamsLeaveNarrowPartsTheirMiddle: Story = {
  args: { config: { ...rectTwelfths, shade: 1 } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 11; i += 1) {
      await waitFor(() => expect(knives(root).length).toBeGreaterThan(0));
      await userEvent.click(knives(root)[0] as HTMLElement);
    }
    await expect(root).toHaveAttribute('data-parts', '12');
    await settle(root);
    await expect(seams(root)).toHaveLength(11);
    const partWidth = Math.min(...partEls(root).map((el) => el.getBoundingClientRect().width));
    for (const seam of seams(root)) {
      await expect(Number(seam.getAttribute('data-band'))).toBeLessThanOrEqual(partWidth * 0.4 + 1);
    }
    for (const el of partEls(root)) {
      const c = center(el);
      await expect(document.elementFromPoint(c.x, c.y)).toBe(el);
    }
    // Emptying a filled part is said aloud too (the count of filled parts).
    await userEvent.click(part(root, 3));
    await expectFilled(root, 1);
    await userEvent.click(part(root, 3));
    await expectFilled(root, 0);
  },
};

// ---------- PR #100 review round 1 (s_1319069ce1c7) ----------

const freeCircleHalves: Cut = { ...base, shape: 'circle', parts: 2, cutMode: 'free' };
const freeSquareHalves: Cut = { ...base, shape: 'square', parts: 2, cutMode: 'free' };

/**
 * A free circle: a swipe through the middle cuts a diameter; tapping one of its seams takes the
 * whole cut back (no radius is left behind unseen), so a second swipe across makes two halves.
 */
export const FreeDiameterTakenBack: Story = {
  args: { config: freeCircleHalves },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const svg = root.querySelector('.ni-fcut__svg') as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    const mid = { x: vb.width / 2, y: vb.height / 2 };
    const reach = Math.min(vb.width, vb.height) * 0.42;
    await swipe(at(root, mid.x, mid.y - reach), at(root, mid.x, mid.y + reach));
    await expect(root).toHaveAttribute('data-parts', '2');
    await expect(seams(root)).toHaveLength(2);
    await userEvent.click(seams(root)[0] as SVGPathElement);
    await expect(root).toHaveAttribute('data-parts', '1');
    await expect(seams(root)).toHaveLength(0);
    await swipe(at(root, mid.x - reach, mid.y), at(root, mid.x + reach, mid.y));
    await expect(root).toHaveAttribute('data-parts', '2');
    await expectEqualShares(measuredShares(stage(root)), 2);
    await userEvent.click(check(root));
    await expectCorrect(lastResponse(args.onResponse), 2, 0);
  },
};

/** A guided circle in thirds: the first radius is only a slit, and it has a seam to take it back. */
export const SlitHasASeam: Story = {
  args: { config: circleThirds },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(knife(root, 0));
    await expect(root).toHaveAttribute('data-parts', '1');
    await expect(seams(root)).toHaveLength(1);
    await userEvent.click(seams(root)[0] as SVGPathElement);
    await expect(seams(root)).toHaveLength(0);
    // The knife for that line is back.
    await expect(knife(root, 0)).toBeVisible();
  },
};

/**
 * Smallest landscape area, a free square that asks for halves: the child cuts it into twelve
 * strips anyway (the side-to-side knife and its keyboard cursor, a twelfth apart). Every strip
 * stays inside the card and nothing scrolls: the room is planned for the parts on screen.
 */
export const FreeCutsStayInsideLandscapeMin: Story = {
  args: { config: freeSquareHalves },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const sideKnife = within(root).getByRole('button', { name: 'Cut side to side' });
    for (let k = 1; k <= 11; k += 1) {
      // Pick the knife up (its line starts in the middle), move it, press it again to cut.
      await userEvent.click(sideKnife);
      sideKnife.focus();
      const steps = 4 * k - 24;
      for (let i = 0; i < Math.abs(steps); i += 1) {
        await userEvent.keyboard(steps < 0 ? '{ArrowUp}' : '{ArrowDown}');
      }
      await userEvent.keyboard('{Enter}');
      await expect(root).toHaveAttribute('data-parts', String(k + 1));
    }
    await settle(root);
    const card = areaBox(canvasElement);
    const box = card.getBoundingClientRect();
    for (const el of partEls(root)) {
      const r = el.getBoundingClientRect();
      await expect(r.top).toBeGreaterThanOrEqual(box.top);
      await expect(r.bottom).toBeLessThanOrEqual(box.bottom);
      await expect(r.left).toBeGreaterThanOrEqual(box.left);
      await expect(r.right).toBeLessThanOrEqual(box.right);
    }
    await expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
    await expectEqualShares(measuredShares(stage(root)), 12);
  },
};
