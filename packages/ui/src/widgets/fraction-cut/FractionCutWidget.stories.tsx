import { stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectEqualShares,
  expectFitsArea,
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
      [...quarters, fill(root), check(root)],
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
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [...knives(root), check(root)]);
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
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [...knives(root), check(root)]);
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
    await expectFitsArea(root, areaBox(canvasElement), 'k', [...knives(root), check(root)]);
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
    await expectFitsArea(root, areaBox(canvasElement), 'k', [...knives(root), check(root)]);
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
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [check(root)]);
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
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: cuts and fills are instant (no blade run). */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: rectHalves, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'cut', args: { line: 0 } });
    await reducedController.play({ op: 'shade', args: { part: 0 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(partEls(root)).toHaveLength(2);
    await expectFilled(root, 1);
  },
};
