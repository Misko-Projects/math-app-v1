import { ML_OPTION_MAX, stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectFitsArea,
  expectHandStays,
  expectNumeralsAtLeast32,
  expectRulerUnitClear,
  inArea,
} from '../../test-support/areaStory';
import {
  boxGap,
  expectControls,
  expectHandTouchesOnlyInvited,
  expectNumeralInk,
  expectOneInviteRing,
  expectRenderedNumerals,
  fillPercent,
  keyRectsAfterEach,
  recordEvidence,
  visibleBox,
} from '../../test-support/evidence';
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
import { WidgetHost, type WidgetHostProps } from '../WidgetHost';

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
  // Evidence: every story leaves its key rects in the area's `data-evidence`.
  afterEach: keyRectsAfterEach('.ni-mlen'),
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
    await expectNumeralsAtLeast32(root, '.ni-boxentry__text');
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
    await expectDropZone(root);
    // Each answer box shows its unit's whole picture, centred in its square (evidence review: a
    // shell read as a clipped dome).
    for (const icon of root.querySelectorAll<HTMLElement>('[data-unit-icon]')) {
      const box = icon.getBoundingClientRect();
      const art = (icon.querySelector('svg') as SVGSVGElement).getBoundingClientRect();
      const entry = (icon.closest('.ni-boxentry__box') as HTMLElement).getBoundingClientRect();
      for (const r of [box, entry]) {
        await expect(art.left).toBeGreaterThanOrEqual(r.left - 0.5);
        await expect(art.right).toBeLessThanOrEqual(r.right + 0.5);
        await expect(art.top).toBeGreaterThanOrEqual(r.top - 0.5);
        await expect(art.bottom).toBeLessThanOrEqual(r.bottom + 0.5);
      }
      await expect(
        Math.abs((art.top + art.bottom) / 2 - (box.top + box.bottom) / 2),
        'unit picture centred',
      ).toBeLessThanOrEqual(1);
    }
    // Type 2 in the shells box, then 4 in the cubes box.
    await userEvent.click(key(root, '2'));
    await userEvent.click(root.querySelector('.ni-boxentry__box[data-box="1"]') as HTMLElement);
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
    await userEvent.click(root.querySelector('.ni-boxentry__box[data-box="1"]') as HTMLElement);
    await userEvent.click(key(root, '6'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [3, 6] });
  },
};

/**
 * Evidence review, laying layouts: every control target-size and 12 px apart (piles, undo, the
 * drop zone, keys, answer boxes, Check; logged), the drop zone 12 px from the keypad, each pile's
 * two units inside the pile, and the content centred in the area.
 */
async function expectLayingLayout(
  story: string,
  canvasElement: HTMLElement,
  root: HTMLElement,
  ageMode: 'k' | 'g1-up',
) {
  const check = within(root).getByRole('button', { name: 'Check' });
  // The drop zone's visible frame (with its focus ring, and its ring while a unit is carried)
  // stays at least 12 px from the keys, the piles, undo and Check (evidence review).
  const pad = root.querySelector('.ni-mlen__pad') as HTMLElement | null;
  if (pad) {
    const others = [
      ...root.querySelectorAll('.ni-pad__key, .ni-boxentry__box, .ni-mlen__pile, .ni-mlen__undo'),
      check,
    ];
    const clear = async (state: string) => {
      await new Promise((r) => setTimeout(r, 250));
      for (const o of others) {
        await expect(
          boxGap(visibleBox(pad), visibleBox(o)),
          `drop zone (${state}) to ${o.className}`,
        ).toBeGreaterThanOrEqual(11.5);
      }
    };
    pad.focus();
    await clear('focused');
    const firstPile = root.querySelector('.ni-mlen__pile') as HTMLElement;
    await userEvent.click(firstPile);
    await waitFor(() => expect(pad).toHaveAttribute('data-armed', 'true'));
    await clear('armed');
    await userEvent.click(firstPile);
    await waitFor(() => expect(pad).not.toHaveAttribute('data-armed', 'true'));
  }
  // The settled picture: no focus ring left on any control.
  (document.activeElement as HTMLElement | null)?.blur();
  await new Promise((r) => setTimeout(r, 250));
  await expectControls(story, ageMode, {
    piles: [...root.querySelectorAll('.ni-mlen__pile')],
    undo: [...root.querySelectorAll('.ni-mlen__undo')],
    'drop zone': [...root.querySelectorAll('.ni-mlen__pad')],
    keys: [...root.querySelectorAll('.ni-pad__key')],
    boxes: [...root.querySelectorAll('.ni-boxentry__box')],
    check: [check],
  });
  for (const p of root.querySelectorAll('.ni-mlen__pile')) {
    const box = p.getBoundingClientRect();
    for (const u of p.querySelectorAll('.ni-unit')) {
      const r = u.getBoundingClientRect();
      await expect(r.top, 'pile stack inside its box').toBeGreaterThanOrEqual(box.top);
      await expect(r.bottom, 'pile stack inside its box').toBeLessThanOrEqual(box.bottom);
      await expect(r.left).toBeGreaterThanOrEqual(box.left);
      await expect(r.right).toBeLessThanOrEqual(box.right);
    }
  }
  await expectContentCentred(canvasElement, root);
}

/**
 * Nothing along the measured object repeats (evidence review: a leaf per cube let a child count
 * leaves instead of laying cubes): no kind of mark appears at three or more places along it.
 * Records the most places any one mark appears.
 */
async function expectNoRepeatingMarks(root: HTMLElement) {
  const art = root.querySelector('.ni-mlen__object svg') as SVGSVGElement;
  const byKind = new Map<string, Set<number>>();
  for (const el of art.querySelectorAll('*')) {
    const kind = el.getAttribute('class') ?? el.tagName;
    const r = el.getBoundingClientRect();
    const xs = byKind.get(kind) ?? new Set<number>();
    xs.add(Math.round((r.left + r.right) / 2));
    byKind.set(kind, xs);
  }
  const most = Math.max(...[...byKind.values()].map((xs) => xs.size));
  await expect(most, 'no mark repeats along the object').toBeLessThanOrEqual(2);
  await expect(art.querySelector('[data-mark-period]')).toBeNull();
  recordEvidence(root, { marks_along_span: most });
}

/**
 * A ruler's ticks (evidence review): every `precision` from 0 to the ruler's end, which is its
 * last numeral (no ticks past it), and tiered: every fifth whole unit longer than the whole
 * units, whole units longer than halves, halves longer than quarters. Records the tick count,
 * the end and each tier's length.
 */
async function expectRulerTicks(root: HTMLElement, precision: number) {
  const ticks = [...root.querySelectorAll<SVGLineElement>('svg.ni-ruler .ni-ruler__tick')];
  const values = ticks.map((t) => Number(t.dataset.tick));
  const nums = [...root.querySelectorAll('svg.ni-ruler .ni-ruler__numeral')].map((n) =>
    Number(n.getAttribute('data-label')),
  );
  const end = Math.max(...values);
  await expect(end, 'the ticks end on the last numeral').toBe(Math.max(...nums));
  await expect(ticks, 'a tick every step from 0 to the end').toHaveLength(
    Math.round(end / precision) + 1,
  );
  const len = (tier: string) => {
    const t = root.querySelector<SVGLineElement>(`.ni-ruler__tick--${tier}`);
    return t ? Math.abs(t.y2.baseVal.value - t.y1.baseVal.value) : null;
  };
  const tiers = ['five', 'whole', 'half', 'quarter'].map((k) => [k, len(k)] as const);
  const shown = tiers.filter(([, l]) => l !== null) as [string, number][];
  for (let i = 1; i < shown.length; i += 1) {
    await expect(
      (shown[i - 1] as [string, number])[1],
      `${(shown[i - 1] as [string, number])[0]} ticks longer than ${(shown[i] as [string, number])[0]}`,
    ).toBeGreaterThan((shown[i] as [string, number])[1] + 5);
  }
  recordEvidence(root, {
    ticks: values.length,
    ruler_end: end,
    tick_px: Object.fromEntries(shown),
  });
  console.info(
    `[ticks] ${values.length} ticks, 0 to ${end}; ${JSON.stringify(Object.fromEntries(shown))}`,
  );
}

/**
 * Every ruler has inner padding (evidence review): at least 12 px of ruler left of the "0" and
 * 8 px below the digits' ink.
 */
async function expectRulerPadding(scope: Element) {
  for (const ruler of scope.querySelectorAll<SVGSVGElement>('svg.ni-ruler')) {
    const body = (ruler.querySelector('.ni-ruler__body') as SVGRectElement).getBoundingClientRect();
    const zero = ruler.querySelector('.ni-ruler__numeral[data-label="0"]') as SVGTextElement;
    await expect(
      zero.getBoundingClientRect().left - body.left,
      '"0" in from the left edge',
    ).toBeGreaterThanOrEqual(12);
    const svgTop = ruler.getBoundingClientRect().top;
    for (const n of ruler.querySelectorAll<SVGTextElement>('.ni-ruler__numeral')) {
      // Digits sit on their baseline (no descenders): the ink ends about 1 px below it.
      const baseline = svgTop + n.y.baseVal.getItem(0).value;
      await expect(
        body.bottom - (baseline + 1),
        'digits up from the bottom edge',
      ).toBeGreaterThanOrEqual(8);
    }
  }
}

/** The widget's stage and answer row are centred across the area (evidence review). */
async function expectContentCentred(canvasElement: HTMLElement, root: HTMLElement) {
  const parts = [...root.querySelectorAll('.ni-mlen__stage, .ni-mlen__answer')].map((e) =>
    e.getBoundingClientRect(),
  );
  const left = Math.min(...parts.map((r) => r.left));
  const right = Math.max(...parts.map((r) => r.right));
  const a = areaBox(canvasElement);
  const r = a.getBoundingClientRect();
  const cs = getComputedStyle(a);
  const inset =
    (Number.parseFloat(cs.borderLeftWidth) || 0) + (Number.parseFloat(cs.paddingLeft) || 0);
  await expect(
    Math.abs(left - (r.left + inset) - (r.right - inset - right)),
    'centred',
  ).toBeLessThanOrEqual(4);
}

/**
 * The drop zone (evidence review): 12+ px of zone inside its border round the rows and the object,
 * and the start line wholly inside it, 6+ px from the border on every side. Returns the zone.
 */
async function expectDropZone(root: HTMLElement) {
  const pad = root.querySelector('.ni-mlen__pad') as HTMLElement;
  const p = pad.getBoundingClientRect();
  const bw = Number.parseFloat(getComputedStyle(pad).borderTopWidth) || 0;
  const inner = { left: p.left + bw, top: p.top + bw, right: p.right - bw, bottom: p.bottom - bw };
  const rows = [...root.querySelectorAll('.ni-mlen__row, .ni-mlen__object')].map((e) =>
    e.getBoundingClientRect(),
  );
  const padding = Math.min(
    Math.min(...rows.map((r) => r.left)) - inner.left,
    Math.min(...rows.map((r) => r.top)) - inner.top,
    inner.right - Math.max(...rows.map((r) => r.right)),
    inner.bottom - Math.max(...rows.map((r) => r.bottom)),
  );
  await expect(padding, 'zone padding round the rows').toBeGreaterThanOrEqual(12);
  const line = (root.querySelector('.ni-mlen__start') as HTMLElement).getBoundingClientRect();
  const lineIn = Math.min(
    line.left - inner.left,
    line.top - inner.top,
    inner.right - line.right,
    inner.bottom - line.bottom,
  );
  await expect(lineIn, 'start line 12 px inside the zone').toBeGreaterThanOrEqual(11.5);
  // The line sits on the object's start.
  const obj = (root.querySelector('.ni-mlen__object svg') as SVGElement).getBoundingClientRect();
  await expect((line.left + line.right) / 2).toBeCloseTo(obj.left, 0);
  recordEvidence(root, {
    zone: `${Math.round(p.width)}x${Math.round(p.height)}`,
    zone_padding: Math.round(padding),
    start_line_in_zone: Math.round(lineIn),
  });
  console.info(
    `[zone] ${Math.round(p.width)}×${Math.round(p.height)}; rows ${Math.round(padding)} px inside; start line ${Math.round(lineIn)} px inside`,
  );
  return pad;
}

/**
 * The keypad at full size (evidence review measured keys of about 61 px): every key is the age
 * mode's target size, and the pad is as wide as its columns of keys (the layout never squeezes it).
 */
async function expectFullKeys(root: HTMLElement, ageMode: 'k' | 'g1-up') {
  const keys = [...root.querySelectorAll('.ni-pad__key')];
  for (const k of keys) await expectTargetSize(k, ageMode);
  const padEl = root.querySelector('.ni-pad') as HTMLElement;
  await expect(padEl.scrollWidth, 'keypad not squeezed').toBeLessThanOrEqual(padEl.clientWidth + 1);
  const r = (keys[0] as Element).getBoundingClientRect();
  recordEvidence(root, { key: `${Math.round(r.width)}x${Math.round(r.height)}` });
}

const iteratePlay =
  (story: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 11; i += 1) {
      pile(root, 'cube').focus();
      await userEvent.keyboard('{Enter}{Enter}');
    }
    await waitFor(() => expect(laid(root, 'cube')).toHaveLength(11));
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-mlen__pile, .ni-mlen__undo, .ni-pad__key, .ni-boxentry__box, .ni-mlen__laid',
      ),
      root.querySelector('.ni-mlen__object') as HTMLElement,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const k of root.querySelectorAll('.ni-pad__key')) await expectTargetSize(k, 'k');
    await expectLayingLayout(story, canvasElement, root, 'k');
    await expectNoRepeatingMarks(root);
    await expectDropZone(root);
  };

/** Tablet widget area, K: the 11-cube vine, the pile, the pad and Check fit with no scroll. */
export const IterateTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: cubes11 },
  render: inArea('tablet'),
  play: iteratePlay('measure-length IterateTabletK'),
};

/** Smallest landscape area, K: the same fits with no scroll. */
export const IterateLandscapeMinK: Story = {
  ...IterateTabletK,
  render: inArea('landscapeMin'),
  play: iteratePlay('measure-length IterateLandscapeMinK'),
};

/** Smallest landscape area, K, two units (two piles, two rows, two boxes). */
export const TwoUnitsLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: twoUnits },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-mlen__pile, .ni-mlen__undo, .ni-pad__key, .ni-boxentry__box, .ni-mlen__pad',
      ),
      root.querySelector('.ni-mlen__object') as HTMLElement,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectLayingLayout('measure-length TwoUnitsLandscapeMinK', canvasElement, root, 'k');
    // A wide zone (evidence review: 168 px), 12+ px of it round the rows.
    const zone = await expectDropZone(root);
    const rows = [...root.querySelectorAll('.ni-mlen__row')].map((e) => e.getBoundingClientRect());
    await expect(zone.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      1.8 * Math.max(...rows.map((r) => r.width)),
    );
  },
};

/** A vine 16 cubes long (MEA.02's longest is 11): the stress case for laying many units. */
const cubes16: Config = { ...cubes11, object: { sprite: 'vine', length: 16 } };

const stressCubes =
  (story: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 16; i += 1) {
      pile(root, 'cube').focus();
      await userEvent.keyboard('{Enter}{Enter}');
    }
    await waitFor(() => expect(laid(root, 'cube')).toHaveLength(16));
    await expect(laid(root, 'cube')).toEqual(Array.from({ length: 16 }, (_, i) => i));
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-mlen__pile, .ni-mlen__undo, .ni-pad__key, .ni-boxentry__box, .ni-mlen__laid, .ni-mlen__pad',
      ),
      root.querySelector('.ni-mlen__object') as HTMLElement,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expect(objectPx(root)).toBeCloseTo(16 * unitPx(root, 'cube'), 0);
    await expectLayingLayout(story, canvasElement, root, 'k');
    await expectNoRepeatingMarks(root);
  };

/** Stress, tablet area, K: 16 cubes laid along a 16-cube vine; everything fits, to scale. */
export const StressSixteenCubesTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: cubes16 },
  render: inArea('tablet'),
  play: stressCubes('measure-length StressSixteenCubesTabletK'),
};

/** Stress, smallest landscape area, K: the same 16 cubes. */
export const StressSixteenCubesLandscapeMinK: Story = {
  ...StressSixteenCubesTabletK,
  render: inArea('landscapeMin'),
  play: stressCubes('measure-length StressSixteenCubesLandscapeMinK'),
};

/** The ruler and the answer row use the area (60+ %), the keys at full size. */
async function expectRulerComposition(canvasElement: HTMLElement, root: HTMLElement) {
  await expectFitsArea(areaBox(canvasElement), [
    root.querySelector('svg.ni-ruler') as Element,
    root.querySelector('.ni-mlen__object') as HTMLElement,
    ...root.querySelectorAll('.ni-pad__key, .ni-boxentry__box'),
    within(root).getByRole('button', { name: 'Check' }),
  ]);
  const pct = fillPercent(areaBox(canvasElement), [
    ...root.querySelectorAll('.ni-mlen__stage, .ni-mlen__answer'),
  ]);
  await expect(pct, 'the composition uses the area').toBeGreaterThanOrEqual(60);
  await expectFullKeys(root, 'g1-up');
}

/** Read a ruler from 0 (K02 shape): a plank from mark 0 to mark 5 on an inch ruler. */
const rulerAt0: Config = { ...ruler, startOffset: 0 };

/**
 * Read a ruler, the plank starting at 0 (smallest landscape area): it ends on mark 5, no start
 * marker; numerals ≥ 32 px on their marks; ruler and pad use the area; type 5.
 */
export const ReadRuler: Story = {
  args: { config: rulerAt0, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectRulerComposition(canvasElement, root);
    await expectNumeralsAtLeast32(root, '.ni-ruler__numeral');
    await expectNumeralInk(root, '.ni-ruler__numeral');
    await expectRulerUnitClear(root);
    await expectRulerPadding(root);
    const tick = (v: number) =>
      (
        root.querySelector(`.ni-ruler__tick[data-tick="${v}"]`) as SVGElement
      ).getBoundingClientRect().left;
    const obj = (root.querySelector('.ni-mlen__object svg') as SVGElement).getBoundingClientRect();
    await expect(obj.left).toBeCloseTo(tick(0), 0);
    await expect(obj.right).toBeCloseTo(tick(5), 0);
    await expect(root.querySelector('.ni-mlen__start-mark')).toBeNull();
    await expectRulerTicks(root, 1);
    await expectControls('measure-length ReadRulerOffsetStart', 'g1-up', {
      keys: [...root.querySelectorAll('.ni-pad__key')],
      boxes: [...root.querySelectorAll('.ni-boxentry__box')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    await userEvent.click(key(root, '5'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
  },
};

/**
 * Read a ruler, the plank starting at mark 2 (K02 shape; smallest landscape area): it ends at
 * mark 7; the ruler's numerals are ≥ 32 px and sit on their whole-unit marks; the plank is exactly
 * 5 units long; a bold marker shows where it starts.
 */
export const ReadRulerOffsetStart: Story = {
  args: { config: ruler, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectRulerComposition(canvasElement, root);
    await expectNumeralsAtLeast32(root, '.ni-ruler__numeral');
    await expect(root.querySelector('.ni-ruler__unit')).toHaveTextContent('in');
    await expectRulerUnitClear(root);
    await expectRulerPadding(root);
    const tick = (v: number) =>
      (
        root.querySelector(`.ni-ruler__tick[data-tick="${v}"]`) as SVGElement
      ).getBoundingClientRect().left;
    const u = tick(1) - tick(0);
    await expect(objectPx(root)).toBeCloseTo(5 * u, 0);
    const obj = (root.querySelector('.ni-mlen__object svg') as SVGElement).getBoundingClientRect();
    await expect(obj.left).toBeCloseTo(tick(2), 0);
    await expect(obj.right).toBeCloseTo(tick(7), 0);
    // Evidence review: digits at least 32 px tall as seen, and a bold start marker on mark 2.
    await expectNumeralInk(root, '.ni-ruler__numeral');
    await expectRenderedNumerals(root, '.ni-ruler__numeral');
    const marker = root.querySelector('.ni-mlen__start-mark') as HTMLElement;
    await expect(marker).toHaveAttribute('data-start-mark', '2');
    const m = marker.getBoundingClientRect();
    const t2 = (
      root.querySelector('.ni-ruler__tick[data-tick="2"]') as SVGElement
    ).getBoundingClientRect();
    await expect(Math.abs((m.left + m.right) / 2 - (t2.left + t2.right) / 2)).toBeLessThan(1.5);
    const rulerTop = (root.querySelector('svg.ni-ruler') as SVGElement).getBoundingClientRect().top;
    await expect(m.bottom).toBeGreaterThan(rulerTop + 10);
    await expectControls('measure-length ReadRuler', 'g1-up', {
      keys: [...root.querySelectorAll('.ni-pad__key')],
      boxes: [...root.querySelectorAll('.ni-boxentry__box')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    await userEvent.click(key(root, '5'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
  },
};

/** A quarter-inch ruler, 164 sixteenths = 10.25 in (review CR-1.4). */
const quarter: Config = {
  ...ruler,
  object: { sprite: 'plank', length: 164 },
  precision: 0.25,
  startOffset: 0,
};

/** 10.25 typed on the on-screen pad (two digits, the point, two digits) is what Check sends. */
export const ReadQuarterOnPad: Story = {
  args: { config: quarter, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of ['1', '0', '.', '2', '5']) await userEvent.click(key(root, k));
    await expect(root.querySelector('.ni-boxentry__text')).toHaveTextContent('10.25');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 10.25 });
  },
};

/** The same with the physical keyboard (digits, ".", Enter). */
export const ReadQuarterOnKeyboard: Story = {
  args: { config: quarter, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.keyboard('10.25');
    await expect(root.querySelector('.ni-boxentry__text')).toHaveTextContent('10.25');
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 10.25 });
  },
};

/**
 * Every standard unit on its ruler: the unit symbol (in, cm, ft, m) sits in its own slot after the
 * end numeral, clear of every numeral and tick, whatever the ruler's length (an 8 m ruler ends in
 * "8 m", never "m" on top of the 8).
 */
export const ReadRulerEveryUnit: Story = {
  args: { config: ruler, tier: 'pictorial' },
  render: (args) => (
    <div className="story-widget-stage" style={{ display: 'grid', gap: 16 }}>
      {(['in', 'cm', 'ft', 'm'] as const).map((unit, i) => (
        <WidgetHost
          key={unit}
          {...args}
          config={{
            ...ruler,
            unit,
            object: { sprite: 'plank', length: [5, 9, 3, 7][i] as number },
            startOffset: [2, 0, 1, 0][i] as number,
          }}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(canvasElement.querySelectorAll('svg.ni-ruler')).toHaveLength(4));
    await expect(
      [...canvasElement.querySelectorAll('.ni-ruler__unit')].map((u) => u.textContent),
    ).toEqual(['in', 'cm', 'ft', 'm']);
    await expectRulerUnitClear(canvasElement);
    await expectRulerPadding(canvasElement);
    await expectNumeralsAtLeast32(canvasElement, '.ni-ruler__numeral');
    await expectNumeralInk(canvasElement, '.ni-ruler__numeral');
  },
};

/** A 12-inch plank on a quarter-inch ruler (192 sixteenths). */
const inches12: Config = {
  ...ruler,
  object: { sprite: 'plank', length: 192 },
  precision: 0.25,
  startOffset: 0,
};
/** A 30 cm plank on a half-centimetre ruler (480 sixteenths). */
const cm30: Config = {
  ...ruler,
  unit: 'cm',
  object: { sprite: 'plank', length: 480 },
  precision: 0.5,
  startOffset: 0,
};

const stressRuler =
  (story: string, config: Config, whole: number) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      root.querySelector('svg.ni-ruler') as Element,
      root.querySelector('.ni-mlen__object') as HTMLElement,
      ...root.querySelectorAll(
        '.ni-pad__key, .ni-boxentry__box, .ni-ruler__numeral, .ni-ruler__unit',
      ),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectNumeralInk(root, '.ni-ruler__numeral');
    await expectRenderedNumerals(root, '.ni-ruler__numeral');
    await expectRulerUnitClear(root);
    await expectRulerPadding(root);
    // Numerals never touch: each one's box clear of the next.
    const nums = [...root.querySelectorAll('.ni-ruler__numeral')].map((n) =>
      n.getBoundingClientRect(),
    );
    for (let i = 1; i < nums.length; i += 1) {
      await expect((nums[i] as DOMRect).left).toBeGreaterThan((nums[i - 1] as DOMRect).right);
    }
    const tick = (v: number) =>
      (
        root.querySelector(`.ni-ruler__tick[data-tick="${v}"]`) as SVGElement
      ).getBoundingClientRect().left;
    await expect(objectPx(root)).toBeCloseTo(whole * (tick(1) - tick(0)), 0);
    await expectRulerTicks(root, config.precision);
    await expectControls(story, 'g1-up', {
      keys: [...root.querySelectorAll('.ni-pad__key')],
      boxes: [...root.querySelectorAll('.ni-boxentry__box')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    await expectFullKeys(root, 'g1-up');
    await expectContentCentred(canvasElement, root);
  };

/** Stress, tablet area: a 12-inch ruler in quarter inches; numerals labelled where they fit. */
export const StressRuler12InTablet: Story = {
  args: { config: inches12, tier: 'pictorial' },
  render: inArea('tablet'),
  play: stressRuler('measure-length StressRuler12InTablet', inches12, 12),
};
/** Stress, smallest landscape area: the 12-inch quarter-inch ruler. */
export const StressRuler12InLandscapeMin: Story = {
  ...StressRuler12InTablet,
  render: inArea('landscapeMin'),
  play: stressRuler('measure-length StressRuler12InLandscapeMin', inches12, 12),
};
/** Stress, tablet area: a 30 cm ruler in half centimetres; every 5th or 10th mark labelled. */
export const StressRuler30CmTablet: Story = {
  args: { config: cm30, tier: 'pictorial' },
  render: inArea('tablet'),
  play: stressRuler('measure-length StressRuler30CmTablet', cm30, 30),
};
/** Stress, smallest landscape area: the 30 cm ruler. */
export const StressRuler30CmLandscapeMin: Story = {
  ...StressRuler30CmTablet,
  render: inArea('landscapeMin'),
  play: stressRuler('measure-length StressRuler30CmLandscapeMin', cm30, 30),
};

/** Tap-tick: tap the ruler at the plank's end; ←/→ move the mark (keyboard). A placement. */
export const ReadTapTick: Story = {
  args: { config: { ...ruler, input: 'tap-tick' }, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Single marks are far smaller than a finger: the whole ruler is the target, and a tap goes
    // to the nearest mark.
    await expectTargetSize(within(root).getByRole('slider', { name: 'Ruler' }), 'g1-up');
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
    await expectRulerUnitClear(root);
    await expectRulerPadding(root);
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
    // The ruler is what the child drags (and, with tap-tick, taps): a full target.
    await expectTargetSize(r, 'g1-up');
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
    await expectRulerUnitClear(root);
    await expectRulerPadding(root);
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

/**
 * Tap-only mode (06 §7, review CR-1.6): dragging the ruler does nothing; → on the keyboard still
 * slides it (a smaller mark under the plank's start), and units are still laid by tapping.
 */
export const TapOnlyRuler: Story = {
  args: { config: ruler },
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = within(root).getByRole('slider', { name: 'Ruler' });
    const c = center(r);
    await pointerDrag(r, { x: c.x + 120, y: c.y }, 'touch');
    await expect(r).toHaveAttribute('data-ruler-start', '2');
    await expect(traceOf(args.onInteract).map((e) => e.t)).not.toContain('drag');
    r.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(r).toHaveAttribute('data-ruler-start', '1');
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
    await expect(root.querySelector('.ni-boxentry__text')).toHaveTextContent('3');
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

/**
 * The child's turn (tablet area, K): Pip's hand points at the pile to take a unit from. One ring,
 * round the pile's cubes inside the pile; the hand starts under it (never on its stroke); the
 * composition uses the area; the start line lies inside the drop zone.
 */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: cubes3, demo: inviteDemo },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'lay-unit', args: { index: 0 } });
    const ring = () => pile(root, 'cube').querySelector('.ni-mlen__pile-stack') as HTMLElement;
    await waitFor(() => expect(ring()).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, pile(root, 'cube'), root);
    await expectHandStays(root, () => pile(root, 'cube'));
    // One ring, inside the pile, 12 px clear of the drop zone, undo and the keypad.
    await expectOneInviteRing(root, {
      clearOf: [
        ...root.querySelectorAll('.ni-mlen__pad, .ni-mlen__undo, .ni-pad__key, .ni-boxentry__box'),
      ],
    });
    const r = ring().getBoundingClientRect();
    const pileBox = pile(root, 'cube').getBoundingClientRect();
    await expect(r.top).toBeGreaterThanOrEqual(pileBox.top);
    await expect(r.bottom).toBeLessThanOrEqual(pileBox.bottom);
    // The whole hand touches only the pile and starts under the ring (3+ px clear of its
    // stroke): not the drop zone, undo, the keypad, the boxes or Check.
    await expectHandTouchesOnlyInvited(
      root,
      [
        ring(),
        ...root.querySelectorAll('.ni-mlen__pad, .ni-mlen__undo, .ni-pad__key, .ni-boxentry__box'),
        within(root).getByRole('button', { name: 'Check' }),
      ],
      { min: 3 },
    );
    await expectDropZone(root);
    const pct = fillPercent(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-mlen__stage, .ni-mlen__answer'),
    ]);
    await expect(pct, 'the composition uses the area').toBeGreaterThanOrEqual(60);
  },
};

const inviteEntry: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn to answer (read): one ring, inside the answer box, 12 px clear of the keys;
 * Pip's hand points at the box without covering its text.
 */
export const DemoInviteAnswer: Story = {
  args: { config: ruler, tier: 'pictorial', demo: inviteEntry },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteEntry.invite({ op: 'answer', args: { value: 5 } });
    const box = () => root.querySelector('.ni-boxentry__box') as HTMLElement;
    await waitFor(() => expect(box()).toHaveClass('ni-invite'));
    await expectHandStays(root, box);
    await expectOneInviteRing(root, {
      clearOf: [
        ...root.querySelectorAll('.ni-pad__key'),
        within(root).getByRole('button', { name: 'Check' }),
      ],
    });
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: laying and counting are instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: cubes3, disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Instant is checked by the effect, never by the clock: once the op resolves, the result
    // is drawn and nothing is still gliding.
    for (let i = 0; i < 3; i += 1) await reducedDemo.play({ op: 'lay-unit', args: { index: i } });
    await reducedDemo.play({ op: 'count-units' });
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running'),
    ).toHaveLength(0);
    await expect(laid(root, 'cube')).toEqual([0, 1, 2]);
  },
};

/**
 * Undo where it sits (K): a laid shell is lifted by touching it, the middle one too, and is named
 * aloud; a tap on bare track lifts nothing; Backspace on the measure takes the last one back.
 * Each lift is traced as `undo`.
 */
export const LiftUnitWhereItSitsK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    const px = Number(root.style.getPropertyValue('--unit').replace('px', ''));
    for (let i = 0; i < 3; i += 1) {
      pile(root, 'shell').focus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('{Enter}');
    }
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 1, 2]));
    clearSpies(audio);
    const tapAt = async (at: number) => {
      const s = spot(root, 'shell', at, px);
      await userEvent.pointer({
        keys: '[MouseLeft]',
        target: trackPad(root, 'shell'),
        coords: { clientX: s.x, clientY: s.y },
      });
    };
    // The middle shell, where it sits.
    await tapAt(1);
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 2]));
    await expect(audio.say).toHaveBeenCalledWith('unit.shell.one', undefined);
    // Bare track, two shells past the last: nothing is lifted.
    await tapAt(5);
    await expect(laid(root, 'shell')).toEqual([0, 2]);
    // Keyboard: Backspace on the measure takes back the one laid last.
    trackPad(root, 'shell').focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0]));
    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(laid(root, 'shell')).toEqual([]));
    const undone = traceOf(args.onInteract)
      .filter((e) => e.t === 'undo')
      .map((e) => e.target);
    await expect(undone).toEqual(['shell-1', 'shell-2', 'shell-0']);
  },
};

/** Stress, smallest landscape area: a pick with the most options the model allows (four). */
export const StressFourOptionsLandscapeMin: Story = {
  args: {
    config: { ...ruler, mode: 'estimate', input: 'pick', options: [2, 5, 9, ML_OPTION_MAX] },
  },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const options = [...root.querySelectorAll<HTMLElement>('.ni-mlen__options .ni-pick')];
    await expect(options).toHaveLength(4);
    await expectFitsArea(areaBox(canvasElement), [
      ...options,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const o of options) await expectTargetSize(o, 'g1-up');
    await expectTargetGaps(options);
  },
};

/**
 * Keyboard undo (review round 1): with a count typed, Backspace on the measure lifts a unit and
 * leaves the typed answer alone (no keypad tap is traced); ← and → mark any laid unit, so the
 * middle one can be lifted while the later ones stay.
 */
export const LiftUnitByKeyboardK: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 4; i += 1) {
      pile(root, 'shell').focus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('{Enter}');
    }
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 1, 2, 3]));
    await userEvent.click(key(root, '1'));
    await userEvent.click(key(root, '2'));
    const answer = () => root.querySelector('.ni-boxentry__text')?.textContent;
    await expect(answer()).toBe('12');
    trackPad(root, 'shell').focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 1, 2]));
    await expect(answer()).toBe('12');
    // → marks the first shell, → again the second: Delete lifts that one only.
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowRight}');
    await expect(root.querySelectorAll('.ni-mlen__laid[data-marked="true"]')).toHaveLength(1);
    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(laid(root, 'shell')).toEqual([0, 2]));
    await expect(answer()).toBe('12');
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).not.toContain('tap:key-back');
    await expect(trace.filter((e) => e.startsWith('undo:'))).toEqual([
      'undo:shell-3',
      'undo:shell-1',
    ]);
  },
};

/**
 * The ruler cannot be slid out from under the object (review round 1): however long ← is held,
 * it stops with its last mark at the object's end, stays in the stage, and its value stays in
 * its declared range.
 */
export const SlideRulerStaysInView: Story = {
  args: { config: ruler },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = within(root).getByRole('slider', { name: 'Ruler' });
    r.focus();
    for (let i = 0; i < 40; i += 1) await userEvent.keyboard('{ArrowLeft}');
    const max = Number(r.getAttribute('aria-valuemax'));
    await expect(Number(r.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(max);
    const stage = (root.querySelector('.ni-mlen__stage') as HTMLElement).getBoundingClientRect();
    const object = (root.querySelector('.ni-mlen__object') as HTMLElement).getBoundingClientRect();
    const box = (root.querySelector('svg.ni-ruler') as SVGElement).getBoundingClientRect();
    // The ruler still lies under the whole object, inside the stage.
    await expect(box.right).toBeGreaterThanOrEqual(object.right - 1);
    await expect(box.left).toBeLessThanOrEqual(object.left + 1);
    await expect(box.right).toBeGreaterThan(stage.left + 64);
    // And it comes back.
    for (let i = 0; i < 40; i += 1) await userEvent.keyboard('{ArrowRight}');
    await expect(r).toHaveAttribute('data-ruler-start', '0');
  },
};
