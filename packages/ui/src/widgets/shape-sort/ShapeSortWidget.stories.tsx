import { stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  AREA,
  areaBox,
  expectFitsArea,
  expectHandStays,
  inArea,
} from '../../test-support/areaStory';
import {
  boxGap,
  expectApart,
  expectControls,
  expectHandTouchesOnlyInvited,
  expectNumeralInk,
  expectOneInviteRing,
  expectRenderedNumerals,
  keyRectsAfterEach,
  recordEvidence,
  settleFocus,
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
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `shape-sort` (03 §5.5): sort cards into bins (`{ bins }`), find every card that fits
 * (`{ ids }`), or pick the odd one out (`choice`). Configs are real generated items (template and
 * seed in each comment); every story checks its response with the engine's checker.
 */

type Config = ConfigFor<'shape-sort'>;
type Shape = Extract<Config['cards'][number]['card'], { shape: string }>;

const props = (
  sides: number,
  corners: number,
  rightAngles: number,
  equalSides: boolean,
  parallelPairs: number,
  extra: Partial<Shape['props']> = {},
): Shape['props'] => ({
  sides,
  corners,
  rightAngles,
  equalSides,
  parallelPairs,
  curved: false,
  closed: true,
  solid: false,
  ...extra,
});
const P = {
  triangle: props(3, 3, 0, true, 0),
  rhombus: props(4, 4, 0, true, 2),
  hexagon: props(6, 6, 0, true, 3),
  trapezoid: props(4, 4, 0, false, 1),
  square: props(4, 4, 4, true, 2),
  rectangle: props(4, 4, 4, false, 2),
  kite: props(4, 4, 0, false, 0),
  quadrilateral: props(4, 4, 0, false, 0),
  circle: props(0, 0, 0, false, 0, { curved: true }),
  'open-figure': props(3, 2, 0, false, 0, { closed: false }),
} as const;
const card = (
  id: string,
  shape: keyof typeof P,
  color: string,
  rotationDeg = 0,
  scale = 1,
): Config['cards'][number] => ({
  id,
  card: { id, shape, props: { ...P[shape] }, rotationDeg, scale, color },
});
const flat = (c: Config['cards'][number]) => {
  const k = c.card as Shape;
  return { id: c.id, props: { shape: k.shape, ...k.props } };
};

/** GEO.01.t1 seed 2 (geo.identify, pattern blocks): triangles and rhombuses. */
const blocks: Config = {
  format: 'shape-sort',
  cards: [
    card('c0', 'rhombus', 'blue'),
    card('c1', 'triangle', 'green'),
    card('c2', 'rhombus', 'blue'),
    card('c3', 'triangle', 'green'),
  ],
  bins: [
    {
      id: 'b0',
      label: 'shape.triangle.many',
      rule: { prop: 'shape', op: '==', value: 'triangle' },
    },
    { id: 'b1', label: 'shape.rhombus.many', rule: { prop: 'shape', op: '==', value: 'rhombus' } },
  ],
  mode: 'sort',
};
const blocksTarget = {
  cards: blocks.cards.map(flat),
  bins: (blocks.bins ?? []).map((b) => ({ id: b.id, rule: b.rule })),
};

/** GEO.08.t2 seed 1 (geo.identify): sort by corners, 3 or 6. */
const corners: Config = {
  format: 'shape-sort',
  cards: [
    card('c0', 'triangle', 'yellow'),
    card('c1', 'triangle', 'purple'),
    card('c2', 'hexagon', 'green'),
    card('c3', 'triangle', 'red'),
    card('c4', 'hexagon', 'purple'),
  ],
  bins: [
    {
      id: 'b0',
      label: 'gen.geo.identify.bin.corners-3',
      rule: { prop: 'corners', op: '==', value: 3 },
    },
    {
      id: 'b1',
      label: 'gen.geo.identify.bin.corners-6',
      rule: { prop: 'corners', op: '==', value: 6 },
    },
  ],
  mode: 'sort',
};

/** MEA.16.t4 seed 1 (mea.massvolume): heavier or lighter than an apple (weight step 4). */
const weights: Config = {
  format: 'shape-sort',
  cards: [
    { id: 'c0', card: { kind: 'object', sprite: 'feather', props: { weight: 1 } } },
    { id: 'c1', card: { kind: 'object', sprite: 'leaf', props: { weight: 2 } } },
    { id: 'c2', card: { kind: 'object', sprite: 'brick', props: { weight: 7 } } },
    { id: 'c3', card: { kind: 'object', sprite: 'pumpkin', props: { weight: 9 } } },
    { id: 'c4', card: { kind: 'object', sprite: 'melon', props: { weight: 6 } } },
    { id: 'c5', card: { kind: 'object', sprite: 'rock', props: { weight: 8 } } },
  ],
  bins: [
    { id: 'b0', label: 'word.heavier', rule: { prop: 'weight', op: '>=', value: 5 } },
    { id: 'b1', label: 'word.lighter', rule: { prop: 'weight', op: '<=', value: 3 } },
  ],
  mode: 'sort',
};

/** GEO.07.t1 seed 2 (geo.identify, real objects): cubes, cones and spheres, three bins. */
const solids: Config = {
  format: 'shape-sort',
  cards: [
    {
      id: 'c0',
      card: {
        kind: 'object',
        sprite: 'block',
        props: { shape: 'cube', solid: true, curved: false },
      },
    },
    {
      id: 'c1',
      card: {
        kind: 'object',
        sprite: 'dice',
        props: { shape: 'cube', solid: true, curved: false },
      },
    },
    {
      id: 'c2',
      card: {
        kind: 'object',
        sprite: 'party-hat',
        props: { shape: 'cone', solid: true, curved: true },
      },
    },
    {
      id: 'c3',
      card: {
        kind: 'object',
        sprite: 'ball',
        props: { shape: 'sphere', solid: true, curved: true },
      },
    },
    {
      id: 'c4',
      card: {
        kind: 'object',
        sprite: 'ball',
        props: { shape: 'sphere', solid: true, curved: true },
      },
    },
    {
      id: 'c5',
      card: {
        kind: 'object',
        sprite: 'party-hat',
        props: { shape: 'cone', solid: true, curved: true },
      },
    },
  ],
  bins: [
    { id: 'b0', label: 'shape.cube.many', rule: { prop: 'shape', op: '==', value: 'cube' } },
    { id: 'b1', label: 'shape.cone.many', rule: { prop: 'shape', op: '==', value: 'cone' } },
    { id: 'b2', label: 'shape.sphere.many', rule: { prop: 'shape', op: '==', value: 'sphere' } },
  ],
  mode: 'sort',
};
const solidsTarget = {
  cards: solids.cards.map((c) => ({ id: c.id, props: (c.card as { props: object }).props })),
  bins: (solids.bins ?? []).map((b) => ({ id: b.id, rule: b.rule })),
};

/** GEO.01.t4 seed 1 (geo.identify, near miss): find every triangle; the open figure is not one. */
const findTriangles: Config = {
  format: 'shape-sort',
  cards: [
    card('c0', 'triangle', 'red'),
    card('c1', 'open-figure', 'green'),
    card('c2', 'triangle', 'purple'),
    card('c3', 'square', 'green'),
    card('c4', 'circle', 'purple'),
    card('c5', 'rectangle', 'yellow'),
  ],
  bins: null,
  mode: 'find-all',
};

/** GEO.02.t2 seed 2 (geo.identify, non-prototypical): turned and resized shapes. */
const findTurned: Config = {
  format: 'shape-sort',
  cards: [
    card('c0', 'hexagon', 'red', 135, 0.6),
    card('c1', 'square', 'blue', 300, 1.5),
    card('c2', 'triangle', 'yellow', 300, 1.3),
    card('c3', 'triangle', 'green', 300, 0.6),
    card('c4', 'triangle', 'orange', 20, 0.75),
    card('c5', 'open-figure', 'purple', 300, 0.75),
  ],
  bins: null,
  mode: 'find-all',
};

/** GEO.08.t4 seed 1 (geo.identify): which shape has sides that are all the same? */
const oddOne: Config = {
  format: 'shape-sort',
  cards: [
    card('c0', 'quadrilateral', 'yellow'),
    card('c1', 'trapezoid', 'yellow'),
    card('c2', 'square', 'green'),
    card('c3', 'kite', 'blue'),
  ],
  bins: null,
  mode: 'odd-one-out',
};

const meta = {
  title: 'Widgets/Shape sort',
  args: {
    config: blocks as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Evidence: every story leaves its key rects in the area's `data-evidence`.
  afterEach: [keyRectsAfterEach('.ni-ssort'), expectCheckRule],
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-ssort';

/**
 * Check's rule, the same in every story (03 §5.5: a card that fits no bin stays in the tray, so
 * Check cannot wait for an empty tray): disabled until the child has placed a card (find-all:
 * picked one; odd-one-out: picked one), enabled after; always disabled in a disabled widget.
 * Checked at the end of every story and recorded in `data-evidence`.
 */
async function expectCheckRule({ canvasElement }: { canvasElement: HTMLElement }) {
  const root = canvasElement.querySelector<HTMLElement>(ROOT);
  if (!root) return;
  const check = within(root).queryByRole('button', { name: 'Check' }) as HTMLButtonElement | null;
  if (!check) return;
  const mode = root.dataset.mode;
  const moved =
    mode === 'sort'
      ? root.querySelectorAll('.ni-ssort__bin .ni-ssort__card').length > 0
      : root.querySelectorAll('.ni-ssort__card[aria-pressed="true"]').length > 0;
  const off = root.dataset.disabled === 'true';
  const enabled = !check.disabled;
  await expect(enabled, 'Check enabled exactly after the first placement').toBe(moved && !off);
  recordEvidence(root, {
    check_rule: 'enabled after first placement (03 §5.5: non-matching cards stay in the tray)',
    check: enabled ? 'enabled' : 'disabled',
  });
  console.info(`[check] ${enabled ? 'enabled' : 'disabled'} (${moved ? 'placed' : 'none placed'})`);
}

const lastResponse = (spy: unknown) => {
  const calls = (spy as ReturnType<typeof fn>).mock.calls;
  return calls[calls.length - 1]?.[0] as ResponseValue;
};
const pad = (root: HTMLElement, bin: string) =>
  root.querySelector(`[data-bin="${bin}"] > .ni-ssort__pad`) as HTMLElement;
const cardEl = (root: HTMLElement, id: string) =>
  root.querySelector(`.ni-ssort__card[data-id="${id}"]`) as HTMLElement;
const inBin = (root: HTMLElement, bin: string) =>
  [...root.querySelectorAll(`[data-bin="${bin}"] .ni-ssort__card`)].map((e) =>
    e.getAttribute('data-id'),
  );

/**
 * K, concrete pattern blocks (GEO.01.t1): a touch drag, a mouse drag, tap-to-place and the
 * keyboard each sort one card; a tapped card says its name. The response passes sort.byRule.
 */
export const SortBlocksK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-ssort__card')];
    await expect(cards).toHaveLength(4);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    await expectTargetGaps([pad(root, 'b0'), pad(root, 'b1')]);
    await expectControls('shape-sort SortBlocksK', 'k', present(sortControls(root)));

    // Touch drag a triangle into the triangles bin.
    await pointerDrag(cardEl(root, 'c1'), center(pad(root, 'b0')), 'touch');
    await waitFor(() => expect(inBin(root, 'b0')).toEqual(['c1']));
    // Mouse drag a rhombus.
    await pointerDrag(cardEl(root, 'c0'), center(pad(root, 'b1')), 'mouse');
    await waitFor(() => expect(inBin(root, 'b1')).toEqual(['c0']));
    // Tap-to-place: tap the card (it says its name), then the bin.
    await userEvent.click(cardEl(root, 'c3'));
    await expect(audio.say).toHaveBeenCalledWith('shape.triangle.one', undefined);
    await userEvent.click(pad(root, 'b0'));
    await waitFor(() => expect(inBin(root, 'b0')).toEqual(['c1', 'c3']));
    // Keyboard: Enter picks the last card up, focus jumps to the first bin it can go in (not
    // the tray it is in), an arrow moves to the next bin, Enter drops it there.
    cardEl(root, 'c2').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(pad(root, 'b0')));
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await waitFor(() => expect(inBin(root, 'b1')).toEqual(['c0', 'c2']));

    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    const r = lastResponse(args.onResponse);
    await expect(r).toEqual({
      kind: 'state',
      value: { bins: { b0: ['c1', 'c3'], b1: ['c0', 'c2'] } },
    });
    await expect(
      stateChecker('sort.byRule')?.check(
        blocksTarget,
        (r as { value: Record<string, unknown> }).value,
      ),
    ).toBe(true);
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(
      expect.arrayContaining([
        'drag:c1',
        'drop:b0',
        'drag:c0',
        'drop:b1',
        'tap:c3',
        'tap:b0',
        'tap:c2',
        'tap:b1',
      ]),
    );
    await expectTraceOrdered(trace);
  },
};

/** A card dragged back to the tray, or dropped nowhere, leaves the bins as they were. */
export const SortBackToTray: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(cardEl(root, 'c1'), center(pad(root, 'b1')), 'mouse');
    await waitFor(() => expect(inBin(root, 'b1')).toEqual(['c1']));
    await pointerDrag(cardEl(root, 'c1'), center(pad(root, 'tray')), 'mouse');
    await waitFor(() => expect(inBin(root, 'b1')).toEqual([]));
    await expect(inBin(root, 'tray')).toContain('c1');
    // Dropped far from every bin: it glides home.
    const box = root.getBoundingClientRect();
    await pointerDrag(cardEl(root, 'c0'), { x: box.right + 300, y: box.top - 200 }, 'mouse');
    await expect(inBin(root, 'tray')).toContain('c0');
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
  },
};

/**
 * GEO.08.t2: bins "3 corners" and "6 corners"; the label numerals are ≥ 32 px. Counting the
 * corners (demo) marks each corner and shows the running count.
 */
export const SortByCorners: Story = {
  args: { config: corners, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const labels = [...root.querySelectorAll<HTMLElement>('.ni-ssort__label')];
    await expect(labels.map((l) => l.textContent)).toEqual(['3 corners', '6 corners']);
    for (const l of labels) {
      await expect(Number.parseFloat(getComputedStyle(l).fontSize)).toBeGreaterThanOrEqual(32);
    }
    // Hexagons are drawn with six corners, triangles with three.
    await expect(
      cardEl(root, 'c2').querySelectorAll('polygon')[0]?.getAttribute('points')?.split(' '),
    ).toHaveLength(6);
    for (const id of ['c0', 'c1', 'c3']) {
      await userEvent.click(cardEl(root, id));
      await userEvent.click(pad(root, 'b0'));
    }
    for (const id of ['c2', 'c4']) {
      await userEvent.click(cardEl(root, id));
      await userEvent.click(pad(root, 'b1'));
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(lastResponse(args.onResponse)).toEqual({
      kind: 'state',
      value: { bins: { b0: ['c0', 'c1', 'c3'], b1: ['c2', 'c4'] } },
    });
  },
};

/** MEA.16.t4 (pictorial objects): heavier and lighter than the apple. */
export const SortHeavierLighter: Story = {
  args: { config: weights, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('button', { name: 'Feather' })).toBeInTheDocument();
    await expect(root.querySelector('[data-sprite="pumpkin"]')).not.toBeNull();
    for (const id of ['c2', 'c3', 'c4', 'c5']) {
      await userEvent.click(cardEl(root, id));
      await userEvent.click(pad(root, 'b0'));
    }
    for (const id of ['c0', 'c1']) {
      await userEvent.click(cardEl(root, id));
      await userEvent.click(pad(root, 'b1'));
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const target = {
      cards: weights.cards.map((c) => ({ id: c.id, props: (c.card as { props: object }).props })),
      bins: (weights.bins ?? []).map((b) => ({ id: b.id, rule: b.rule })),
    };
    const r = lastResponse(args.onResponse) as { value: Record<string, unknown> };
    await expect(stateChecker('sort.byRule')?.check(target, r.value)).toBe(true);
  },
};

/**
 * Tablet widget area (1280 × 800 → 1226 × 493), K, three bins of real solid-shaped objects
 * (GEO.07.t1 seed 2). Everything fits with no scroll, before and after sorting.
 */
export const SolidsTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: solids },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await expect(box.getBoundingClientRect().width).toBeCloseTo(AREA.tablet.width, 0);
    const parts = () => [
      ...root.querySelectorAll('.ni-ssort__card, .ni-ssort__pad'),
      within(root).getByRole('button', { name: 'Check' }),
    ];
    await expectFitsArea(box, parts());
    for (const [id, bin] of [
      ['c0', 'b0'],
      ['c1', 'b0'],
      ['c2', 'b1'],
      ['c5', 'b1'],
      ['c3', 'b2'],
      ['c4', 'b2'],
    ] as const) {
      await userEvent.click(cardEl(root, id));
      await userEvent.click(pad(root, bin));
    }
    await settle(root);
    await expectFitsArea(box, parts());
    for (const c of root.querySelectorAll('.ni-ssort__card')) await expectTargetSize(c, 'k');
    await expectControls('shape-sort SolidsTabletK (sorted)', 'k', present(sortControls(root)));
    await expectBinLips(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const r = lastResponse(args.onResponse) as { value: Record<string, unknown> };
    await expect(stateChecker('sort.byRule')?.check(solidsTarget, r.value)).toBe(true);
    // Ends settled, like every area story: no focus ring left on Check (evidence review).
    await expectTrayLayout(root);
    await settleFocus();
  },
};

/**
 * The smallest landscape area (960 × 600 → 906 × 373), K, three bins: cards shrink to the K
 * target size and nothing scrolls, before and after sorting.
 */
export const SolidsLandscapeMinK: Story = {
  ...SolidsTabletK,
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await waitFor(() => expect(root).toHaveAttribute('data-compact', 'true'));
    const parts = () => [
      ...root.querySelectorAll('.ni-ssort__card, .ni-ssort__pad'),
      within(root).getByRole('button', { name: 'Check' }),
    ];
    await expectFitsArea(box, parts());
    const cards = [...root.querySelectorAll('.ni-ssort__card')];
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    for (const [id, bin] of [
      ['c0', 'b0'],
      ['c1', 'b0'],
      ['c2', 'b1'],
      ['c5', 'b1'],
      ['c3', 'b2'],
      ['c4', 'b2'],
    ] as const) {
      await userEvent.click(cardEl(root, id));
      await userEvent.click(pad(root, bin));
    }
    await settle(root);
    await expectFitsArea(box, parts());
    // Cards in bins are tapped and dragged too: K size there as well (evidence review).
    await expectControls(
      'shape-sort SolidsLandscapeMinK (sorted)',
      'k',
      present(sortControls(root)),
    );
    await expectBinLips(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const r = lastResponse(args.onResponse) as { value: Record<string, unknown> };
    await expect(stateChecker('sort.byRule')?.check(solidsTarget, r.value)).toBe(true);
    // Ends settled, like every area story: no focus ring left on Check (evidence review).
    await expectTrayLayout(root);
    await settleFocus();
  },
};

/** Triangles and rhombuses, `n` of each, in two bins (GEO.01.t1's kit, many more cards). */
const manyBlocks = (n: number): Config => ({
  ...blocks,
  cards: Array.from({ length: 2 * n }, (_, i) =>
    card(`c${i}`, i % 2 === 0 ? 'triangle' : 'rhombus', i % 2 === 0 ? 'green' : 'blue'),
  ),
});

/** Sorts every card by tapping it, then its bin (triangles to b0, rhombuses to b1). */
async function sortAll(root: HTMLElement, n: number) {
  for (let i = 0; i < 2 * n; i += 1) {
    await userEvent.click(cardEl(root, `c${i}`));
    await userEvent.click(pad(root, i % 2 === 0 ? 'b0' : 'b1'));
  }
  await waitFor(() => expect(inBin(root, 'tray')).toEqual([]));
  await settle(root);
}

/** Waits for the cards' glide (FLIP) to finish before measuring them. */
async function settle(root: HTMLElement) {
  await new Promise((r) => setTimeout(r, 100));
  await Promise.all(
    [...root.querySelectorAll('*')]
      .flatMap((el) => el.getAnimations())
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
      .map((a) => a.finished.catch(() => undefined)),
  );
  await new Promise((r) => setTimeout(r, 400));
}

const sortParts = (root: HTMLElement) => [
  ...root.querySelectorAll('.ni-ssort__card, .ni-ssort__pad'),
  within(root).getByRole('button', { name: 'Check' }),
];
const sortControls = (root: HTMLElement) => ({
  'tray cards': [...root.querySelectorAll('[data-bin="tray"] .ni-ssort__card')],
  'bin cards': [...root.querySelectorAll('.ni-ssort__bin .ni-ssort__card')],
  check: [within(root).getByRole('button', { name: 'Check' })],
});
const present = (groups: Record<string, Element[]>) =>
  Object.fromEntries(Object.entries(groups).filter(([, els]) => els.length > 0));

/**
 * Stress, tablet area, K: 16 cards (8 triangles, 8 rhombuses; real items have at most 7). All in
 * the tray, then all sorted (8 + 8): the cards shrink to fit, never under 84 px (K target 80 +
 * 4), wrap into rows, and nothing clips or scrolls.
 */
export const StressSixteenTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: manyBlocks(8), tier: 'concrete' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await expectFitsArea(box, sortParts(root));
    await expectControls(
      'shape-sort StressSixteenTabletK (tray)',
      'k',
      present(sortControls(root)),
    );
    await sortAll(root, 8);
    await expectFitsArea(box, sortParts(root));
    await expectControls(
      'shape-sort StressSixteenTabletK (sorted)',
      'k',
      present(sortControls(root)),
    );
    await expectBinLips(root);
    await settleFocus();
  },
};

/**
 * Stress, smallest landscape area (≈ 906 × 373, content 852 × 319), K. The height holds one row
 * of K cards in the tray and one in each bin: 8 + (84 + 24) + 12 + (36 + 84 + 24 + 6) = 278 of
 * 319 px at the smallest card (84 px); a second row needs 96 more (374 > 319), so more cards than
 * a row cannot fit at the K size. The row holds 7 cards (7 × 96 − 12 + 24 ≤ 712 px beside Check),
 * the most any shape-sort template makes (`cards` ≤ 7), and bins widen with their cards, so
 * 4 + 3 keeps one row each. (Seven cards in ONE of three bins would need a second row.)
 */
export const StressSevenLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...manyBlocks(4),
      cards: manyBlocks(4).cards.slice(0, 7),
    },
    tier: 'concrete',
  },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await waitFor(() => expect(root).toHaveAttribute('data-compact', 'true'));
    await expectFitsArea(box, sortParts(root));
    await expectControls(
      'shape-sort StressSevenLandscapeMinK (tray)',
      'k',
      present(sortControls(root)),
    );
    for (let i = 0; i < 7; i += 1) {
      await userEvent.click(cardEl(root, `c${i}`));
      await userEvent.click(pad(root, i % 2 === 0 ? 'b0' : 'b1'));
    }
    await waitFor(() => expect(inBin(root, 'tray')).toEqual([]));
    await settle(root);
    await expectFitsArea(box, sortParts(root));
    await expectControls(
      'shape-sort StressSevenLandscapeMinK (sorted)',
      'k',
      present(sortControls(root)),
    );
    await expectBinLips(root);
    await expectBinRingsInside(root);
    await settleFocus();
  },
};

/**
 * Every bin keeps its lower lip visible (evidence review: cards sat on it): each card's bottom
 * is at least a side padding (12 px compact, 14 px) above the bin's inner bottom edge, the card's
 * 6 px ledge clears the lip, and the bin's label starts at least 6 px below its top border.
 * Logs the measured paddings.
 */
async function expectBinLips(root: HTMLElement) {
  let least = Number.POSITIVE_INFINITY;
  for (const bin of root.querySelectorAll<HTMLElement>('.ni-ssort__bin')) {
    const p = bin.querySelector('.ni-ssort__pad') as HTMLElement;
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const innerBottom = r.bottom - (Number.parseFloat(cs.borderBottomWidth) || 0);
    // The visible lip band: the frame's inset bottom shadow.
    const lip = Number(/inset\s+0(?:px)?\s+-(\d+)px/.exec(cs.boxShadow)?.[1] ?? 0);
    const lipTop = innerBottom - lip;
    for (const card of bin.querySelectorAll<HTMLElement>('.ni-ssort__card')) {
      // The card's bottom including its base (its offset shadow).
      const base = Number(
        /\s0(?:px)?\s+(\d+)px\s+0(?:px)?/.exec(getComputedStyle(card).boxShadow)?.[1] ?? 0,
      );
      const gap = lipTop - (card.getBoundingClientRect().bottom + base);
      least = Math.min(least, gap);
      await expect(gap, 'free space between the card base and the lip band').toBeGreaterThanOrEqual(
        11.5,
      );
    }
    // The bin's name is above its frame, and its picture is at least 40 px.
    const label = bin.querySelector('.ni-ssort__label') as HTMLElement;
    await expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(r.top + 0.5);
    const icon = bin.querySelector('[data-bin-icon]') as HTMLElement;
    const art = icon.firstElementChild as Element | null;
    await expect(art, 'bin picture').not.toBeNull();
    const a = (art as Element).getBoundingClientRect();
    await expect(Math.max(a.width, a.height), 'bin picture size').toBeGreaterThanOrEqual(40);
  }
  console.info(
    Number.isFinite(least)
      ? `[bins] card base to the lip band ≥ ${Math.round(least)} px`
      : '[bins] no cards in the bins; pictures and names checked',
  );
}

/**
 * A bin's or the tray's ring (focus, armed) lies ON its frame, round the whole of its content
 * (evidence review: an inner ring ran under the bin cards' top edges): never outside the frame,
 * and every card in it at least 12 px inside the ring. Returns the least ring-to-card (px).
 */
async function expectRingClearOfCards(root: HTMLElement, id: string) {
  const p = pad(root, id);
  const cs = getComputedStyle(p);
  await expect(cs.outlineStyle, `${id} ring shows`).not.toBe('none');
  const offset = Number.parseFloat(cs.outlineOffset) || 0;
  const width = Number.parseFloat(cs.outlineWidth) || 0;
  await expect(offset + width, `${id} ring on its frame, not outside it`).toBeLessThanOrEqual(0.5);
  const r = p.getBoundingClientRect();
  const inner = {
    left: r.left - offset,
    top: r.top - offset,
    right: r.right + offset,
    bottom: r.bottom + offset,
  };
  const sel =
    id === 'tray'
      ? '[data-bin="tray"] .ni-ssort__card'
      : `.ni-ssort__bin[data-bin="${id}"] .ni-ssort__card`;
  let least = Number.POSITIVE_INFINITY;
  for (const c of root.querySelectorAll(sel)) {
    const b = c.getBoundingClientRect();
    const g = Math.min(
      b.left - inner.left,
      b.top - inner.top,
      inner.right - b.right,
      inner.bottom - b.bottom,
    );
    least = Math.min(least, g);
    await expect(g, `${id} ring 12 px clear of its cards`).toBeGreaterThanOrEqual(12);
  }
  return least;
}

/** Keyboard focus on a bin or the tray: its ring on the frame, 12+ px clear of the cards. */
async function expectBinRingsInside(root: HTMLElement) {
  for (const id of ['tray', 'b0', 'b1']) {
    const p = pad(root, id);
    if (!p) continue;
    p.focus();
    await new Promise((r) => setTimeout(r, 50));
    await expectRingClearOfCards(root, id);
  }
}

/**
 * The tray's cards sit centred in it top to bottom (equal space above and below, within 4 px),
 * and Check, with its 8 px focus ring, stays 12+ px from the tray's border (evidence review).
 * Logs the measured values.
 */
async function expectTrayLayout(root: HTMLElement) {
  const tray = pad(root, 'tray');
  const t = tray.getBoundingClientRect();
  const bw = Number.parseFloat(getComputedStyle(tray).borderTopWidth) || 0;
  const cards = [...root.querySelectorAll('[data-bin="tray"] .ni-ssort__card')].map((c) =>
    c.getBoundingClientRect(),
  );
  let line = '';
  if (cards.length > 0) {
    const above = Math.min(...cards.map((c) => c.top)) - (t.top + bw);
    const below = t.bottom - bw - Math.max(...cards.map((c) => c.bottom));
    await expect(Math.abs(above - below), 'tray cards centred').toBeLessThanOrEqual(4);
    line = `tray top/bottom ${Math.round(above)}/${Math.round(below)} px; `;
    recordEvidence(root, { tray_top_bottom: `${Math.round(above)}/${Math.round(below)}` });
  }
  const check = within(root).getByRole('button', { name: 'Check' }).getBoundingClientRect();
  const ring = {
    left: check.left - 8,
    top: check.top - 8,
    right: check.right + 8,
    bottom: check.bottom + 8,
  };
  const gap = boxGap(ring, t);
  await expect(gap, 'Check (with its focus ring) clear of the tray').toBeGreaterThanOrEqual(12);
  console.info(`[tray] ${line}Check ring to tray border ${Math.round(gap)} px`);
}

const trayPlay =
  (story: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await settle(root);
    await expectFitsArea(box, sortParts(root));
    for (const c of root.querySelectorAll('[data-bin="tray"] .ni-ssort__card')) {
      await expectFitsArea(box, [c]);
    }
    await expectControls(story, 'k', present(sortControls(root)));
    await expectTrayLayout(root);
    await expectBinLips(root);
    await settleFocus();
  };

/**
 * Stress, tablet area, K: the TRAY with 16 unsorted cards (real items have at most 7). They wrap
 * into rows of target-size cards (84 px), nothing clips or scrolls.
 */
export const StressTraySixteenTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: manyBlocks(8), tier: 'concrete' },
  render: inArea('tablet'),
  play: trayPlay('shape-sort StressTraySixteenTabletK'),
};

/**
 * Stress, smallest landscape area, K: the tray with the template maximum, 7 unsorted cards, in
 * one row beside Check; nothing clips or scrolls (the height holds one row: see
 * StressSevenLandscapeMinK).
 */
export const StressTraySevenLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: { ...manyBlocks(4), cards: manyBlocks(4).cards.slice(0, 7) },
    tier: 'concrete',
  },
  render: inArea('landscapeMin'),
  play: trayPlay('shape-sort StressTraySevenLandscapeMinK'),
};

/**
 * Smallest landscape area, K, mid-sort: one card picked up (its ring inside the card) and the
 * bins armed to take it (their rings inside their frames, 6 px clear of the border). Ends in that
 * state, so the rings show.
 */
export const StressSevenSelectedLandscapeMinK: Story = {
  ...StressTraySevenLandscapeMinK,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 4; i += 1) {
      await userEvent.click(cardEl(root, `c${i}`));
      await userEvent.click(pad(root, i % 2 === 0 ? 'b0' : 'b1'));
    }
    await settle(root);
    await settleFocus();
    await userEvent.click(cardEl(root, 'c4'));
    await waitFor(() => expect(pad(root, 'b0')).toHaveAttribute('data-armed', 'true'));
    await new Promise((r) => setTimeout(r, 300));
    const picked = cardEl(root, 'c4');
    await expect(picked).toHaveAttribute('data-selected', 'true');
    // The picked card's ring is inside it: its visible box is its own box.
    const ring = getComputedStyle(picked);
    await expect(ring.outlineStyle).not.toBe('none');
    await expect(
      (Number.parseFloat(ring.outlineOffset) || 0) + (Number.parseFloat(ring.outlineWidth) || 0),
    ).toBeLessThanOrEqual(0);
    // Each armed bin's ring is on its frame, round all its cards, 12+ px clear of every card
    // (evidence review: it ran under the cards' top edges).
    let ringToCard = Number.POSITIVE_INFINITY;
    for (const id of ['b0', 'b1']) {
      const cs = getComputedStyle(pad(root, id));
      await expect(cs.outlineColor).not.toMatch(/rgba\([^)]*,\s*0\)|transparent/);
      ringToCard = Math.min(ringToCard, await expectRingClearOfCards(root, id));
      const outer =
        (Number.parseFloat(cs.outlineOffset) || 0) + (Number.parseFloat(cs.outlineWidth) || 0);
      // ... and 6+ px from the bin's name (its glyphs), which sits above the frame.
      const r = pad(root, id).getBoundingClientRect();
      const ringBox = {
        left: r.left - outer,
        top: r.top - outer,
        right: r.right + outer,
        bottom: r.bottom + outer,
      };
      const range = document.createRange();
      range.selectNodeContents(
        root.querySelector(`[data-bin="${id}"] .ni-ssort__label`) as HTMLElement,
      );
      const toLabel = boxGap(ringBox, range.getBoundingClientRect());
      console.info(`[ring] ${id} armed ring to its name ${Math.round(toLabel)} px`);
      await expect(toLabel, `${id} ring clear of its name`).toBeGreaterThanOrEqual(6);
    }
    console.info(`[ring] armed ring to the nearest card ${Math.round(ringToCard)} px`);
    recordEvidence(root, { ring_to_card: Math.round(ringToCard) });
    await expectControls(
      'shape-sort StressSevenSelectedLandscapeMinK',
      'k',
      present(sortControls(root)),
    );
    await expectBinLips(root);
    await expectFitsArea(areaBox(canvasElement), sortParts(root));
  },
};

/** Find-all at the smallest landscape area, K: six cards and Check fit with no scroll. */
export const FindAllLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: findTriangles, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await expectFitsArea(box, [
      ...root.querySelectorAll('.ni-ssort__card'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    const cards = [...root.querySelectorAll('.ni-ssort__card')];
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
  },
};

/**
 * GEO.01.t4 (pictorial, near miss): tap every triangle. The open figure is drawn open (a
 * polyline, no fill); tapping a card again lets it go. Check answers `{ ids }`.
 */
export const FindAllTriangles: Story = {
  args: { config: findTriangles, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const open = cardEl(root, 'c1');
    await expect(open.querySelector('polyline.ni-shape__open')).not.toBeNull();
    await expect(open.querySelector('polygon')).toBeNull();
    await userEvent.click(cardEl(root, 'c0'));
    await expect(audio.say).toHaveBeenCalledWith('shape.triangle.one', undefined);
    await userEvent.click(open);
    await userEvent.click(cardEl(root, 'c2'));
    await expect(open).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(open);
    await expect(open).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { ids: ['c0', 'c2'] },
    });
    await expect(
      stateChecker('select.exactSet')?.check({ ids: ['c0', 'c2'] }, { ids: ['c0', 'c2'] }),
    ).toBe(true);
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:c0',
      'tap:c1',
      'tap:c2',
      'tap:c1',
    ]);
  },
};

/**
 * GEO.02.t2 (non-prototypical): turned and resized shapes share one scale, so the 1.5 × square
 * is drawn 1.5 / 0.6 = 2.5 × as wide as the 0.6 × hexagon's scale says; turns are applied.
 */
export const FindAllTurnedShapes: Story = {
  args: { config: findTurned, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const viewBoxes = new Set(
      [...root.querySelectorAll('svg.ni-shape')].map((s) => s.getAttribute('viewBox')),
    );
    await expect(viewBoxes.size).toBe(1);
    const sq = cardEl(root, 'c1').querySelector('svg.ni-shape g') as SVGGElement;
    await expect(sq.getAttribute('transform')).toBe('rotate(300)');
    const small = cardEl(root, 'c3').querySelector('polygon') as SVGPolygonElement;
    const big = cardEl(root, 'c2').querySelector('polygon') as SVGPolygonElement;
    await expect(big.getBBox().width / small.getBBox().width).toBeCloseTo(1.3 / 0.6, 2);
    for (const id of ['c2', 'c3', 'c4']) await userEvent.click(cardEl(root, id));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { ids: ['c2', 'c3', 'c4'] },
    });
  },
};

/** GEO.08.t4: the odd one out; picking another card changes the pick. */
export const OddOneOut: Story = {
  args: { config: oddOne, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cardEl(root, 'c1'));
    await userEvent.click(cardEl(root, 'c2'));
    await expect(cardEl(root, 'c1')).toHaveAttribute('aria-pressed', 'false');
    await expect(cardEl(root, 'c2')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'c2' });
  },
};

/** Keyboard (06 §7): Tab to a card, Space picks it, Tab on to Check, Enter answers. */
export const KeyboardOddOneOut: Story = {
  args: { config: oddOne, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    cardEl(root, 'c0').focus();
    await userEvent.tab();
    await userEvent.tab();
    await expect(cardEl(root, 'c2')).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(cardEl(root, 'c2')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.tab();
    await userEvent.tab();
    await expect(within(root).getByRole('button', { name: 'Check' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'c2' });
  },
};

/** `disabled`: nothing can be picked or moved. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cardEl(root, 'c0'));
    await expect(cardEl(root, 'c0')).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
  },
};

const demoSort: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (03 §6.3): Pip counts a hexagon's corners (each corner marked, the count shown and
 * spoken), then sorts two cards (`drag-card`).
 */
export const DemoSort: Story = {
  args: { config: corners, tier: 'pictorial', disabled: true, demo: demoSort },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const shown = demoSort.play({ op: 'highlight-attribute', args: { id: 'c2', prop: 'corners' } });
    await waitFor(() =>
      expect(cardEl(root, 'c2').querySelectorAll('.ni-shape__corner')).toHaveLength(6),
    );
    const badge = root.querySelector('.ni-ssort__count') as HTMLElement;
    await expect(badge).toHaveTextContent('6');
    await expect(Number.parseFloat(getComputedStyle(badge).fontSize)).toBeGreaterThanOrEqual(32);
    // Off the drawing: the corners being counted stay uncovered.
    for (const corner of cardEl(root, 'c2').querySelectorAll('.ni-shape__corner')) {
      await expectApart(badge, corner, 0, 'badge clear of a counted corner');
    }
    await shown;
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 6 }]);
    await demoSort.play({ op: 'drag-card', args: { id: 'c2', bin: 'b1' } });
    await demoSort.play({ op: 'drag-card', args: { id: 'c0', bin: 'b0' } });
    await expect(inBin(root, 'b1')).toEqual(['c2']);
    await expect(inBin(root, 'b0')).toEqual(['c0']);
    await expect(demoSort.play({ op: 'tap' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
  },
};

const demoCount: WidgetDemo = createDemoController({ strict: true });

/** `count-sides`: the sides light up one by one and the count goes 1, 2, 3, 4. */
export const DemoCountSides: Story = {
  args: { config: oddOne, tier: 'pictorial', disabled: true, demo: demoCount },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const done = demoCount.play({ op: 'count-sides', args: { id: 'c2' } });
    await waitFor(() => expect(root.querySelector('.ni-ssort__count')).toHaveTextContent('4'), {
      timeout: 5000,
    });
    await expect(cardEl(root, 'c2').querySelectorAll('.ni-shape__side-mark')).toHaveLength(4);
    // The count badge sits off the drawing: it covers none of the sides being counted.
    const badge = root.querySelector('.ni-ssort__count') as HTMLElement;
    await expectApart(badge, cardEl(root, 'c2').querySelector('polygon') as Element, 0, 'badge');
    await expectRenderedNumerals(root, '.ni-ssort__count');
    await expectNumeralInk(root, '.ni-ssort__count');
    await done;
    await expect((audio.sayPhrases.mock.calls as unknown[][]).map((c) => c[0])).toEqual([
      [{ number: 1 }],
      [{ number: 2 }],
      [{ number: 3 }],
      [{ number: 4 }],
    ]);
    await demoCount.play({ op: 'answer', args: { id: 'c2' } });
    await expect(cardEl(root, 'c2')).toHaveAttribute('aria-pressed', 'true');
  },
};

const inviteDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn: Pip's hand points at the card to move. One control is invited (one ring,
 * inside the card's own box, 12 px clear of the other cards and the tray's border); the bin it
 * goes in only lights up once the card is picked up.
 */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'drag-card', args: { id: 'c1', bin: 'b0' } });
    await waitFor(() => expect(cardEl(root, 'c1')).toHaveClass('ni-invite'));
    await expect(pad(root, 'b0')).not.toHaveClass('ni-invite');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, cardEl(root, 'c1'), root);
    // Settled: the story ends invited, the hand still under the card.
    await expectHandStays(root, () => cardEl(root, 'c1'));
    const others = [...root.querySelectorAll('.ni-ssort__card')].filter(
      (c) => c !== cardEl(root, 'c1'),
    );
    await expectOneInviteRing(root, {
      clearOf: [...others, pad(root, 'b0'), pad(root, 'b1')],
      inside: [pad(root, 'tray')],
    });
    // The whole hand (and its bob) touches only the invited card: not a bin, not another card.
    // ... 8+ px from every other control, and 8+ px inside the tray's border (evidence review).
    await expectHandTouchesOnlyInvited(
      root,
      [
        ...others,
        pad(root, 'b0'),
        pad(root, 'b1'),
        within(root).getByRole('button', { name: 'Check' }),
      ],
      { min: 8, inside: [pad(root, 'tray')] },
    );
    await expectControls('shape-sort DemoInvite', 'k', {
      cards: [...root.querySelectorAll('.ni-ssort__card')],
    });
    // The room for the hand is above the cards as well as below: they stay centred in the tray.
    await expectTrayLayout(root);
  },
};

const inviteTap: WidgetDemo = createDemoController({ strict: true });

/** When the child picks the invited card up, the invite (ring and hand) clears. */
export const DemoInviteClearsOnTap: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteTap },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteTap.invite({ op: 'drag-card', args: { id: 'c1', bin: 'b0' } });
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await userEvent.click(cardEl(root, 'c1'));
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expect(cardEl(root, 'c1')).not.toHaveClass('ni-invite');
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: demo ops are instant state changes. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedDemo.play({ op: 'drag-card', args: { id: 'c0', bin: 'b1' } });
    await reducedDemo.play({ op: 'count-sides', args: { id: 'c1' } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(inBin(root, 'b1')).toEqual(['c0']);
  },
};
