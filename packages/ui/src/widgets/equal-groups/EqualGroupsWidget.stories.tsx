import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  type SpyAudio,
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
 * `equal-groups` (03 §5.5): containers of sprites. Build: fill rafts from the supply (drag,
 * tap-to-place or keyboard), add rafts when their number is the unknown, take sprites back, then
 * type the unknown; Check sends `{ kind: 'state', value: { groups, value } }`. Read: the filled
 * containers are one picture and Check sends the typed `number`. Nothing shows a count or total.
 */

type Config = ConfigFor<'equal-groups'>;

const base: Config = {
  format: 'equal-groups',
  groups: 3,
  perGroup: 4,
  unknown: 'size',
  mode: 'build',
  container: 'raft',
  sprite: 'shell',
  maxGroups: 6,
};

/** G1: 12 shells shared onto 3 rafts. How many on each raft? */
const buildSize: Config = base;
/** 12 shells, 4 on each raft. How many rafts? The child adds the rafts. */
const buildGroups: Config = { ...base, unknown: 'groups', maxGroups: 6 };
/** 3 baskets of 5 fish. How many fish? A bottomless bucket, so the pile can't give it away. */
const buildTotal: Config = {
  ...base,
  groups: 3,
  perGroup: 5,
  unknown: 'total',
  container: 'basket',
  sprite: 'fish',
};
/** K: 3 nests of 2 leaves. How many leaves? */
const buildK: Config = {
  ...base,
  groups: 3,
  perGroup: 2,
  unknown: 'total',
  container: 'nest',
  sprite: 'leaf',
};
/** MUL.11: 4 rafts of 30. How many? Ten-rods in the supply. */
const buildTens: Config = { ...base, groups: 4, perGroup: 30, unknown: 'total', maxGroups: 4 };
const readTotal: Config = { ...base, mode: 'read', unknown: 'total' };
const readK: Config = {
  ...base,
  mode: 'read',
  groups: 2,
  perGroup: 3,
  unknown: 'total',
  container: 'basket',
  sprite: 'crab',
};
const readTens: Config = { ...base, mode: 'read', groups: 4, perGroup: 30, unknown: 'total' };
const stress10x10: Config = {
  ...base,
  mode: 'read',
  groups: 10,
  perGroup: 10,
  unknown: 'total',
  container: 'plate',
  sprite: 'starfish',
  maxGroups: 10,
};
const stressBuild: Config = {
  ...base,
  groups: 6,
  perGroup: 7,
  unknown: 'groups',
  maxGroups: 8,
  container: 'basket',
  sprite: 'pebble',
};

/**
 * The 1280 × 800 tablet: the story canvas is 1200 × 720 inside its 40 px padding, so the widget
 * stage is exactly 1200 px wide (wider than the test browser's own stage).
 */
const renderTablet = (args: WidgetHostProps) => (
  <div style={{ width: 1200, maxWidth: 'none' }}>{renderWidget(args)}</div>
);

const meta = {
  title: 'Widgets/Equal groups',
  args: {
    config: buildSize as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderTablet,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-egw';

// ---------- helpers ----------

const supply = (root: HTMLElement) =>
  root.querySelector('[data-place-item="supply"]') as HTMLElement;
const rodSource = (root: HTMLElement) =>
  root.querySelector('[data-place-item="supply-ten"]') as HTMLElement;
const supplyPad = (root: HTMLElement) =>
  root.querySelector('[data-place-target="supply"]') as HTMLElement;
const group = (root: HTMLElement, i: number) =>
  root.querySelector(`[data-place-target="group-${i}"]`) as HTMLElement;
const sprite = (root: HTMLElement, i: number, j: number) =>
  root.querySelector(`[data-place-item="sprite-${i}-${j}"]`) as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });

/** What each container holds, read from the DOM (loose sprites plus ten per rod). */
function countsOf(root: HTMLElement): number[] {
  const out: number[] = [];
  for (const cell of root.querySelectorAll<HTMLElement>('.ni-egw__group:not(.ni-egw__ghost)')) {
    if (cell.classList.contains('ni-egw__empty')) continue;
    out.push(
      cell.querySelectorAll('.ni-egw__sprite').length +
        10 * cell.querySelectorAll('.ni-egw__rod').length,
    );
  }
  return out;
}

async function expectCounts(root: HTMLElement, counts: number[]) {
  await waitFor(() => expect(countsOf(root)).toEqual(counts));
}

/** Tap-to-place: tap the supply, then container i, `n` times. */
async function tapFill(root: HTMLElement, i: number, n: number) {
  for (let k = 0; k < n; k++) {
    await userEvent.click(supply(root));
    await userEvent.click(group(root, i));
  }
}

async function type(root: HTMLElement, digits: string) {
  for (const d of digits) await userEvent.click(key(root, d));
}

const state = (groups: number[], value: number) => ({
  kind: 'state',
  value: { groups, value },
});

/**
 * Nothing outside the number pad states a count, the total or the answer (03 §5.5): not the text,
 * not an accessible name or title, not a data- attribute.
 */
async function expectNoValueShown(root: HTMLElement, forbidden: number[]) {
  const outsidePad = [...root.querySelectorAll<HTMLElement>('*')].filter(
    (el) => !el.closest('.ni-pad') && !el.closest('.ni-egw__blank'),
  );
  const words = [
    ...outsidePad.map((el) =>
      el.childNodes.length > 0
        ? [...el.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : '')).join(' ')
        : '',
    ),
    ...outsidePad.map((el) => el.getAttribute('aria-label') ?? ''),
    ...outsidePad.map((el) => el.getAttribute('title') ?? ''),
  ].join(' ');
  for (const f of forbidden) {
    await expect(new RegExp(`(^|[^0-9])${f}([^0-9]|$)`).test(words), String(f)).toBe(false);
  }
  for (const el of outsidePad) {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith('data-')) continue;
      await expect(forbidden.map(String), `${a}="${el.getAttribute(a)}"`).not.toContain(
        el.getAttribute(a),
      );
    }
  }
}

/**
 * The widget fits its stage with no scrolling: the stage stays within the tablet's 720 px, the
 * widget's scroll size equals its client size, every drawn part lies inside the widget, every
 * sprite lies inside its container, and no two countable things overlap.
 */
async function expectFits(canvasElement: HTMLElement, root: HTMLElement) {
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);
  await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (el.closest('.ni-egw__empty')) continue;
    const name = String(el.getAttribute('class') ?? el.tagName);
    await expect(r.left, `${name} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${name} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${name} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
  for (const cell of root.querySelectorAll<HTMLElement>('.ni-egw__group')) {
    const c = cell.getBoundingClientRect();
    const things = [...cell.querySelectorAll<HTMLElement>('.ni-egw__sprite, .ni-egw__rod')];
    const rects = things.map((t) => t.getBoundingClientRect());
    for (const r of rects) {
      await expect(r.left).toBeGreaterThanOrEqual(c.left);
      await expect(r.right).toBeLessThanOrEqual(c.right);
      await expect(r.top).toBeGreaterThanOrEqual(c.top);
      await expect(r.bottom).toBeLessThanOrEqual(c.bottom);
    }
    await expectNoOverlap(rects);
  }
  await expectNoOverlap(
    [...root.querySelectorAll<HTMLElement>('.ni-egw__group')].map((g) => g.getBoundingClientRect()),
  );
  // One object scale: nothing countable under 20 px, the pile and rods included.
  for (const el of root.querySelectorAll('.ni-egw__sprite, .ni-egw__rodcell, .ni-egw__pilecell')) {
    const r = el.getBoundingClientRect();
    await expect(Math.min(r.width, r.height), 'countable size').toBeGreaterThanOrEqual(20);
  }
}

async function expectNoOverlap(rects: DOMRect[]) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as DOMRect;
      const b = rects[j] as DOMRect;
      const overlap =
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      await expect(overlap, `things ${i} and ${j} overlap`).toBe(false);
    }
  }
}

/** Numerals the child reads are ≥ 32 px (05 §11). */
async function expectBigNumerals(els: Element[]) {
  for (const el of els) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

/** The controls a child taps: the supply, add button, answer blank, pad keys and check. */
const controls = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(
    '.ni-egw__task, .ni-egw__grab, .ni-egw__add, .ni-egw__blank, .ni-pad__key, .ni-egw .ni-btn:not(.ni-iconbtn)',
  ),
];

/**
 * Evidence stories end at rest: the test's synthetic clicks leave keyboard-style focus on the last
 * control, which a child's finger never shows.
 */
function restFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
}

/** Every countable thing (sprites, rod cells, pile sprites) is drawn at ≥ 20 px. */
async function expectCountable(root: HTMLElement) {
  for (const el of root.querySelectorAll('.ni-egw__sprite, .ni-egw__rodcell, .ni-egw__pilecell')) {
    const r = el.getBoundingClientRect();
    await expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(20);
  }
}

// ---------- build ----------

/**
 * Evidence, START: G1, "12 in all" shared onto 3 empty rafts. The task chip shows the given total;
 * the pile holds exactly 12; the supply and the answer are labelled regions.
 */
export const BuildStart: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const chip = within(root).getByRole('button', { name: '12 in all' });
    await expectBigNumerals([chip.querySelector('.ni-egw__tasknum') as Element]);
    await userEvent.click(chip);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.eg.task.total', { n: 12 });
    await expect(within(root).getByRole('group', { name: 'Take from here' })).toBeVisible();
    await expect(within(root).getByRole('group', { name: 'Your answer' })).toBeVisible();
    await expectCounts(root, [0, 0, 0]);
    await expectCountable(root);
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/** Evidence, IN PROGRESS: two rafts have their shells, the third is being filled. */
export const BuildInProgress: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapFill(root, 0, 4);
    await tapFill(root, 1, 4);
    await tapFill(root, 2, 2);
    await expectCounts(root, [4, 4, 2]);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(2);
    await expectCountable(root);
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/**
 * Evidence, FINISHED: G1, 12 shells on 3 rafts (sharing): tap-to-place four onto each raft from
 * the pile of exactly 12, type 4, check. The pile empties; controls are G1-sized and spaced;
 * nothing shows a count.
 */
export const BuildSize: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(12);
    await expect(root.querySelectorAll('[data-container="raft"]')).toHaveLength(3);
    for (const c of controls(root)) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(controls(root));
    for (let i = 0; i < 3; i++) await expectTargetSize(group(root, i), 'g1-up');
    await expect(check(root)).toBeDisabled();
    for (let i = 0; i < 3; i++) await tapFill(root, i, 4);
    await expectCounts(root, [4, 4, 4]);
    // The pile is used up: the supply has nothing more to give.
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(0);
    await expect(supply(root)).toHaveAttribute('aria-disabled', 'true');
    await expectNoValueShown(root, [4]);
    await type(root, '4');
    await expectBigNumerals([root.querySelector('.ni-egw__blank') as Element]);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state([4, 4, 4], 4));
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(0, 2).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:supply',
      'tap:group-0',
    ]);
    await expect(trace.at(-1)).toMatchObject({ t: 'tap', target: 'key-4' });
    await expectTraceOrdered(trace);
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/**
 * 12 shells, 4 on each raft: how many rafts? The child adds rafts ("Add a raft", at most
 * `maxGroups`), fills them and types 3. The rafts' layout never shows how many to make.
 */
export const BuildGroups: Story = {
  args: { config: buildGroups },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectCounts(root, []);
    const add = within(root).getByRole('button', { name: 'Add a raft' });
    await expectTargetSize(add, 'g1-up');
    for (let i = 0; i < 3; i++) {
      await userEvent.click(within(root).getByRole('button', { name: 'Add a raft' }));
    }
    await expectCounts(root, [0, 0, 0]);
    for (let i = 0; i < 3; i++) await tapFill(root, i, 4);
    await expectCounts(root, [4, 4, 4]);
    await expectNoValueShown(root, [3]);
    await type(root, '3');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([4, 4, 4], 3));
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(0, 3).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:add-group',
      'tap:add-group',
      'tap:add-group',
    ]);
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/**
 * At most `maxGroups` (6): the add button goes once they are all out. An extra empty raft is not a
 * group (the model still sends it; the checker ignores empty containers).
 */
export const AddGroupLimit: Story = {
  args: { config: buildGroups },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 6; i++) {
      await userEvent.click(within(root).getByRole('button', { name: 'Add a raft' }));
    }
    await expectCounts(root, [0, 0, 0, 0, 0, 0]);
    await expect(within(root).queryByRole('button', { name: 'Add a raft' })).toBeNull();
    await tapFill(root, 0, 4);
    await type(root, '1');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([4, 0, 0, 0, 0, 0], 1));
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/**
 * 3 baskets of 5 fish: how many fish? The total is the unknown, so the supply is a bottomless
 * bucket that hands out one at a time (a finite pile would show the answer).
 */
export const BuildTotalBucket: Story = {
  args: { config: buildTotal },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-egw__pile')).toBeNull();
    await expect(root.querySelector('.ni-egw__bucket')).not.toBeNull();
    await expect(root.querySelectorAll('[data-container="basket"]')).toHaveLength(3);
    for (let i = 0; i < 3; i++) await tapFill(root, i, 5);
    await expectCounts(root, [5, 5, 5]);
    // Still more in the bucket.
    await expect(supply(root)).not.toHaveAttribute('aria-disabled');
    await expectNoValueShown(root, [15]);
    await type(root, '15');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([5, 5, 5], 15));
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/**
 * K mode, 3 nests of 2 leaves: chunky sprites, every control K-sized (≥ 80 px) and icon-only with
 * a spoken label.
 */
export const BuildK: Story = {
  globals: { ageMode: 'k' },
  args: { config: buildK },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    for (const c of controls(root)) await expectTargetSize(c, 'k');
    await expectTargetGaps(controls(root));
    await expect(check(root).textContent?.trim()).toBe('');
    await expect(root.querySelector('.ni-caption')).toBeNull();
    for (let i = 0; i < 3; i++) await tapFill(root, i, 2);
    await expectCounts(root, [2, 2, 2]);
    // Chunky: the sprites in the nests are K target size too.
    for (const s of root.querySelectorAll('.ni-egw__sprite')) await expectTargetSize(s, 'k');
    await expectTargetGaps([...root.querySelectorAll('.ni-egw__sprite')]);
    await type(root, '6');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([2, 2, 2], 6));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 6 }]);
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/**
 * MUL.11, 4 rafts of 30: the supply also hands out ten-rods (+10 each). A raft shows rods and
 * loose shells, so it stays countable. One raft gets a single shell too, which is taken back.
 */
export const BuildTens: Story = {
  args: { config: buildTens },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTargetSize(rodSource(root), 'g1-up');
    await pointerDrag(rodSource(root), center(group(root, 0)), 'mouse');
    await expectCounts(root, [10, 0, 0, 0]);
    for (let i = 0; i < 4; i++) {
      for (let k = i === 0 ? 1 : 0; k < 3; k++) {
        await userEvent.click(rodSource(root));
        await userEvent.click(group(root, i));
      }
    }
    await expectCounts(root, [30, 30, 30, 30]);
    await tapFill(root, 1, 1);
    await expectCounts(root, [30, 31, 30, 30]);
    await expect(root.querySelectorAll('.ni-egw__rod')).toHaveLength(12);
    await expectFits(canvasElement, root);
    await pointerDrag(sprite(root, 1, 0), center(supplyPad(root)), 'mouse');
    await expectCounts(root, [30, 30, 30, 30]);
    await type(root, '120');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([30, 30, 30, 30], 120));
    await expect(traceOf(args.onInteract).slice(0, 2)).toMatchObject([
      { t: 'drag', target: 'supply-ten' },
      { t: 'drop', target: 'group-0' },
    ]);
  },
};

/** Mouse drag: sprites dragged from the pile onto rafts; a mis-drop glides home. */
export const DragSprite: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(supply(root), center(group(root, 0)), 'mouse');
    await expectCounts(root, [1, 0, 0]);
    await pointerDrag(supply(root), center(group(root, 2)), 'mouse');
    await expectCounts(root, [1, 0, 1]);
    // Dropped on nothing: nothing changes.
    const r = supply(root).getBoundingClientRect();
    await pointerDrag(supply(root), { x: r.left + r.width / 2, y: r.top - 30 }, 'mouse');
    await expectCounts(root, [1, 0, 1]);
    // A sprite can move from one raft to another.
    await pointerDrag(sprite(root, 2, 0), center(group(root, 1)), 'mouse');
    await expectCounts(root, [1, 1, 0]);
    await type(root, '1');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([1, 1, 0], 1));
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(0, 8).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:supply',
      'drop:group-0',
      'drag:supply',
      'drop:group-2',
      'drag:supply',
      'drop:none',
      'drag:sprite-2-0',
      'drop:group-1',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Touch drag (a tablet finger): fill a raft, then drag a sprite back to the supply. */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let k = 0; k < 3; k++) await pointerDrag(supply(root), center(group(root, 1)), 'touch');
    await expectCounts(root, [0, 3, 0]);
    await pointerDrag(sprite(root, 1, 2), center(supplyPad(root)), 'touch');
    await expectCounts(root, [0, 2, 0]);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(10);
    await type(root, '2');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([0, 2, 0], 2));
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(0, 2).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:supply',
      'drop:group-1',
    ]);
    await expect(trace.slice(-3).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:sprite-1-2',
      'drop:supply',
      'tap:key-2',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Tap-to-place: tapping the supply picks a sprite up (ink ring) and says its name; tapping a raft
 * puts it there. Tapping a raft with nothing picked up says "Raft"; tapping a sprite on a raft
 * says its name.
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(supply(root));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.shell', undefined);
    await expect(supply(root)).toHaveAttribute('aria-pressed', 'true');
    await expect(group(root, 0)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(group(root, 0));
    await expectCounts(root, [1, 0, 0]);
    clearSpies(audio);
    await userEvent.click(group(root, 1));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.eg.container.raft', undefined);
    clearSpies(audio);
    await userEvent.click(sprite(root, 0, 0));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.shell', undefined);
    // Tapping it again puts it down where it is.
    await userEvent.click(sprite(root, 0, 0));
    await expectCounts(root, [1, 0, 0]);
    await tapFill(root, 1, 1);
    await tapFill(root, 2, 1);
    await type(root, '1');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([1, 1, 1], 1));
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:supply',
      'tap:group-0',
      'tap:group-1',
      'tap:sprite-0-0',
      'tap:sprite-0-0',
      'tap:supply',
      'tap:group-1',
      'tap:supply',
      'tap:group-2',
      'tap:key-1',
    ]);
  },
};

/**
 * Keyboard (06 §7): Enter on the supply picks a sprite up and moves focus to the first raft;
 * arrows move between rafts; Enter puts it down. Digits type the answer; Enter checks.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    supply(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(group(root, 0)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expectCounts(root, [1, 0, 0]);
    supply(root).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowRight}');
    await expect(group(root, 1)).toHaveFocus();
    await userEvent.keyboard(' ');
    await expectCounts(root, [1, 1, 0]);
    // Enter on a raft's sprite moves focus to where it can go; Escape puts it down.
    sprite(root, 1, 0).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await expect(sprite(root, 1, 0)).toHaveFocus();
    await expectCounts(root, [1, 1, 0]);
    supply(root).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}');
    await expectCounts(root, [1, 1, 1]);
    // Enter on a focused raft never submits.
    await userEvent.keyboard('1');
    group(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith(state([1, 1, 1], 1));
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Taking back: drag a sprite to the supply, and tap-to-place another back. The pile refills. */
export const TakeBack: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapFill(root, 0, 5);
    await expectCounts(root, [5, 0, 0]);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(7);
    await pointerDrag(sprite(root, 0, 4), center(supplyPad(root)), 'mouse');
    await expectCounts(root, [4, 0, 0]);
    await userEvent.click(sprite(root, 0, 3));
    await expect(supplyPad(root)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(supplyPad(root));
    await expectCounts(root, [3, 0, 0]);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(9);
    await type(root, '3');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([3, 0, 0], 3));
    await expect(
      traceOf(args.onInteract)
        .slice(10, 14)
        .map((e) => `${e.t}:${e.target}`),
    ).toEqual(['drag:sprite-0-4', 'drop:supply', 'tap:sprite-0-3', 'tap:supply']);
  },
};

// ---------- read ----------

/**
 * Pictorial, G1: 3 rafts of 4 shells, how many shells? One static picture named "Look at the
 * picture"; tapping a shell says "Shell", tapping a raft says "Raft". Check sends a number.
 */
export const ReadTotal: Story = {
  args: { config: readTotal, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const picture = within(root).getByRole('img', { name: 'Look at the picture' });
    await expect(picture).toBeVisible();
    await expect(root.querySelectorAll('[data-place-item]')).toHaveLength(0);
    await expect(root.querySelectorAll('.ni-egw__sprite')).toHaveLength(12);
    await expectNoValueShown(root, [12]);
    await userEvent.click(root.querySelector('[data-eg-tap="sprite-1-2"]') as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.shell', undefined);
    // The raft itself (the tap lands on the raft drawing, not on a shell).
    await userEvent.click(root.querySelector('[data-eg-tap="group-0"]') as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.eg.container.raft', undefined);
    for (const k of root.querySelectorAll('.ni-pad__key')) await expectTargetSize(k, 'g1-up');
    await type(root, '12');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 12 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:sprite-1-2',
      'tap:group-0',
      'tap:key-1',
      'tap:key-2',
    ]);
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/** Pictorial, K mode: 2 baskets of 3 crabs. Big crabs, K-sized keys, icon-only check. */
export const ReadK: Story = {
  globals: { ageMode: 'k' },
  args: { config: readK, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('img', { name: 'Look at the picture' })).toBeVisible();
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'k');
    await expectTargetGaps(keys);
    for (const s of root.querySelectorAll('.ni-egw__sprite')) await expectTargetSize(s, 'k');
    await expect(check(root).textContent?.trim()).toBe('');
    await type(root, '6');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    await expectFits(canvasElement, root);
    restFocus();
  },
};

/** MUL.11 pictorial: 4 rafts of 30, each drawn as three ten-rods (countable by tens). */
export const ReadTens: Story = {
  args: { config: readTens, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-egw__rod')).toHaveLength(12);
    await expect(root.querySelectorAll('.ni-egw__sprite')).toHaveLength(0);
    await expect(root.querySelectorAll('.ni-egw__rodcell')).toHaveLength(120);
    await expectNoValueShown(root, [120, 30]);
    await type(root, '120');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 120 });
    await expectFits(canvasElement, root);
    restFocus();
  },
};

// ---------- gallery ----------

const KINDS = ['raft', 'basket', 'plate', 'nest'] as const;
const SPRITES = ['shell', 'fish', 'starfish', 'leaf'] as const;

/** Every container (raft, basket, plate, nest), as read pictures at half size. */
export const AllContainers: Story = {
  render: (args) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 600px)',
        gridTemplateRows: 'repeat(2, 360px)',
        gap: 0,
        width: 1200,
      }}
    >
      {KINDS.map((k, i) => (
        <div key={k} style={{ width: 1200, transform: 'scale(0.5)', transformOrigin: '0 0' }}>
          <div className="story-widget-stage">
            <WidgetHost
              {...args}
              config={{ ...readTotal, container: k, sprite: SPRITES[i] ?? 'shell' }}
              tier="pictorial"
            />
          </div>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll(ROOT)).toHaveLength(4));
    for (const k of KINDS) {
      await expect(canvasElement.querySelectorAll(`[data-container="${k}"]`)).toHaveLength(3);
    }
  },
};

// ---------- stress ----------

/** The largest read picture: 10 plates of 10 starfish fit the 1280 × 800 widget area. */
export const Stress10x10: Story = {
  args: { config: stress10x10, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-egw__sprite')).toHaveLength(100);
    await expectFits(canvasElement, root);
    for (const c of controls(root)) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(controls(root));
  },
};

/**
 * The largest build: up to 8 baskets (6 needed) of 7 pebbles from a pile of 42. Filled, it still
 * fits, nothing overlaps, and the pile empties.
 */
export const StressBuild: Story = {
  args: { config: stressBuild },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(42);
    await expectFits(canvasElement, root);
    for (let i = 0; i < 6; i++) {
      await userEvent.click(within(root).getByRole('button', { name: 'Add a basket' }));
    }
    for (let i = 0; i < 6; i++) await tapFill(root, i, 7);
    await expectCounts(root, [7, 7, 7, 7, 7, 7]);
    await expect(root.querySelectorAll('.ni-egw__pile .ni-egw__pilecell')).toHaveLength(0);
    await expectFits(canvasElement, root);
    for (const c of controls(root)) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(controls(root));
    await type(root, '6');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state([7, 7, 7, 7, 7, 7], 6));
    restFocus();
  },
};

/** `disabled`: no input at all (feedback showing, or the runner waiting). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(supply(root)).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(supply(root));
    await userEvent.click(group(root, 0));
    await expectCounts(root, [0, 0, 0]);
    await expect(key(root, '3')).toBeDisabled();
    await userEvent.keyboard('3');
    await expect(within(root).getByRole('button', { name: 'Your answer:' })).toBeDisabled();
    await expect(check(root)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

// ---------- demo ----------

const demoPlay: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), every op: Pip adds two rafts, fills them (shells fly in one by one), skip
 * counts (each raft lights up with its running multiple), lassoes a raft and types the answer.
 */
export const DemoPlay: Story = {
  args: { config: buildGroups, demo: demoPlay },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await demoPlay.play({ op: 'add-group' });
    await demoPlay.play({ op: 'add-group' });
    await demoPlay.play({ op: 'add-group' });
    await expectCounts(root, [0, 0, 0]);
    await demoPlay.play({ op: 'fill-group', args: { index: 0, count: 4 } });
    await demoPlay.play({ op: 'fill-group', args: { index: 1, count: 4 } });
    await demoPlay.play({ op: 'fill-group', args: { index: 2, count: 4 } });
    await expectCounts(root, [4, 4, 4]);
    // A fill can also take sprites back out.
    await demoPlay.play({ op: 'fill-group', args: { index: 2, count: 3 } });
    await demoPlay.play({ op: 'fill-group', args: { index: 2, count: 4 } });
    await expectCounts(root, [4, 4, 4]);
    const counted = demoPlay.play({ op: 'skip-count' });
    await waitFor(() => expect(root.querySelector('[data-counted="true"]')).not.toBeNull());
    await counted;
    await expect((audio.sayPhrases.mock.calls as unknown[][]).map((c) => c[0])).toEqual([
      [{ number: 4 }],
      [{ number: 8 }],
      [{ number: 12 }],
    ]);
    await demoPlay.play({ op: 'circle-group', args: { index: 1 } });
    await expect(root.querySelectorAll('.ni-egw__lasso')).toHaveLength(1);
    await demoPlay.play({ op: 'answer', args: { value: 3 } });
    await expect(within(root).getByRole('button', { name: 'Your answer: 3' })).toBeVisible();
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });

/** Demo invite: Pip's pointer on the next raft's place, then on a raft, then on the answer. */
export const DemoInvite: Story = {
  args: { config: buildGroups, demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInvite.invite({ op: 'add-group' });
    await waitFor(() => expect(root.querySelector('.ni-egw__add.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      root.querySelector('.ni-egw__add') as HTMLElement,
      root,
    );
    // The child's tap clears the invite.
    await userEvent.click(within(root).getByRole('button', { name: 'Add a raft' }));
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    demoInvite.invite({ op: 'fill-group', args: { index: 0, count: 4 } });
    await waitFor(() => expect(root.querySelector('.ni-egw__group.ni-invite')).not.toBeNull());
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, group(root, 0), root);
    demoInvite.invite({ op: 'answer', args: { value: 3 } });
    await waitFor(() => expect(root.querySelector('.ni-egw__blank.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      root.querySelector('.ni-egw__blank') as HTMLElement,
      root,
    );
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });

/** An op the format doesn't list throws UnsupportedWidgetOpError (03 §6.3, development). */
export const DemoUnsupportedOp: Story = {
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const demoReduced: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: every op is an instant state change plus a highlight. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: buildK, demo: demoReduced },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await demoReduced.play({ op: 'fill-group', args: { index: 0, count: 2 } });
    await demoReduced.play({ op: 'fill-group', args: { index: 1, count: 2 } });
    await demoReduced.play({ op: 'fill-group', args: { index: 2, count: 2 } });
    await expectCounts(root, [2, 2, 2]);
    await expect(root.querySelector('[data-flash="true"]')).not.toBeNull();
    await demoReduced.play({ op: 'skip-count' });
    await expect(root.querySelectorAll('[data-counted="true"]')).toHaveLength(3);
    await demoReduced.play({ op: 'circle-group', args: { index: 0 } });
    await demoReduced.play({ op: 'answer', args: { value: 6 } });
    await expect(performance.now() - started).toBeLessThan(800);
    await expect(
      getComputedStyle(root.querySelector('.ni-egw__lasso path') as Element).animationName,
    ).toBe('none');
    await expect(within(root).getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
  },
};
