import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectAreaCentred,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
  waitForSettled,
} from '../../test-support/storyHelpers';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { TARGET_GAP_PX } from '../../tokens/tokens';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import { WidgetHost, type WidgetHostProps } from '../WidgetHost';

/**
 * `make-set` (03 §5.5): put exactly `target` objects in a container (concrete). Drag, tap-to-place
 * and keyboard all move objects between the heap and the container's ten-frame slots; `hands`
 * raises fingers. Configs are real generated items (CNT.02, CNT.04, CNT.06, ADD.01, CPS.01, SUB.05)
 * plus a CNT.19-style bundling item.
 */

/** CNT.02.t2 seed 1: put 9 fish on the raft (no running count). */
const raft: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 9,
  mode: 'make',
  source: { sprite: 'fish', supply: 12 },
  container: 'raft',
  capacity: 10,
  showRunningCount: false,
};

/** ADD.01.t1 seed 1: you have 1, add more to make 4 (boat), with the running count shown. */
const addMore: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 4,
  mode: 'add-more',
  start: 1,
  source: { sprite: 'crab', supply: 6 },
  container: 'boat',
  capacity: 10,
  showRunningCount: true,
};

/** CPS.01.t1 seed 1: split 5 shells into two parts (take some out of the boat). */
const takeAway: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 5,
  mode: 'take-away',
  start: 5,
  source: { sprite: 'shell', supply: 0 },
  container: 'boat',
  capacity: 10,
  showRunningCount: false,
};

/** SUB.05.t1 seed 1: show me 7 fingers. */
const hands: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 7,
  mode: 'make',
  source: { sprite: 'finger', supply: 10 },
  container: 'hands',
  capacity: 10,
  showRunningCount: false,
};

/** CNT.06.t1 seed 1: put 16 crabs in the boat (capacity 20: two ten-frames). */
const twenty: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 16,
  mode: 'make',
  source: { sprite: 'crab', supply: 19 },
  container: 'boat',
  capacity: 20,
  showRunningCount: false,
};

/** CNT.19-style: make 13 sticks and tie the full ten (groupsOf 10), in a basket. */
const bundleTen: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 13,
  mode: 'make',
  source: { sprite: 'stick', supply: 16 },
  container: 'basket',
  capacity: 20,
  showRunningCount: true,
  groupsOf: 10,
};

/** Lantern Grove: gather 6 fireflies into a jar. */
const jar: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 6,
  mode: 'make',
  source: { sprite: 'firefly', supply: 9 },
  container: 'jar',
  capacity: 10,
  showRunningCount: true,
};

/** CNT.04.t1-style, in the open shell. */
const shell: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 2,
  mode: 'make',
  source: { sprite: 'pebble', supply: 5 },
  container: 'shell',
  capacity: 10,
  showRunningCount: false,
};

const meta = {
  title: 'Widgets/Make a set',
  args: {
    config: raft as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Every area story's card is centred in the stage on both axes.
  afterEach: async ({ canvasElement }) => expectAreaCentred(canvasElement),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-mset';
const heap = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-area="pile"] .ni-mset__item'),
];
const supplyItems = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-area="supply"] .ni-mset__item'),
];
const inside = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-mset__slot .ni-mset__item'),
];
const containerPad = (root: HTMLElement) =>
  root.querySelector('.ni-mset__container > .ni-mset__pad') as HTMLElement;
const pilePad = (root: HTMLElement) =>
  root.querySelector('[data-area="pile"] > .ni-mset__pad') as HTMLElement;
const pileArea = (root: HTMLElement) => root.querySelector('[data-area="pile"]') as HTMLElement;
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const allItems = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-mset__item')];
/** The guide's hand (one per widget, placed under the invited thing by the kit's `useInviteHand`). */
const pointerIn = (el: Element) =>
  el.closest('.ni-mset')?.querySelector(':scope > .ni-hand') as HTMLElement;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const describe = (el: Element | null) =>
  el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` : 'nothing';

/**
 * A real touch at `at` lands on `el`: the browser's hit test (`elementFromPoint`) returns `el` or
 * something inside it, so nothing covers it, it is not clipped away and it is on screen.
 */
async function expectHit(el: Element, at: { x: number; y: number }, what: string) {
  const hit = document.elementFromPoint(at.x, at.y);
  await expect(
    hit !== null && el.contains(hit),
    `${what}: a touch at (${Math.round(at.x)}, ${Math.round(at.y)}) hits ${describe(hit)}, not ${describe(el)}`,
  ).toBe(true);
}

/** The middle of the part of `el` that is on screen: clipped by every scrolling ancestor. */
function reachableCenter(el: Element) {
  let { left, top, right, bottom } = el.getBoundingClientRect();
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const c = p.getBoundingClientRect();
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);
  return { x: (Math.max(0, left) + right) / 2, y: (Math.max(0, top) + bottom) / 2 };
}

/**
 * pointerDrag, but only where a real finger could do it: the press goes to the object's centre
 * only after the browser's hit test there returns the object, and the drop point (the middle of
 * the drop zone's visible part) must hit the drop zone (the container or the pile).
 */
async function drag(el: HTMLElement, target: HTMLElement, pointerType: 'mouse' | 'touch') {
  await expectHit(el, center(el), 'the dragged object');
  const to = reachableCenter(target);
  const zone = target.closest('.ni-mset__container, .ni-mset__pile') ?? target;
  await expectHit(zone, to, 'the drop zone');
  await pointerDrag(el, to, pointerType);
}

/**
 * A heap lays out in balanced, centred rows: row lengths differ by at most one (no object hangs
 * alone under the others), every row is centred on the heap, and the rows sit in the middle of
 * the heap's box (no empty lower half).
 */
async function expectEvenHeap(area: HTMLElement) {
  const items = [...area.querySelectorAll<HTMLElement>('.ni-mset__item')];
  const box = (area.querySelector('.ni-mset__heapbox') as HTMLElement).getBoundingClientRect();
  if (items.length === 0) return;
  const rows = new Map<number, DOMRect[]>();
  for (const el of items) {
    const r = el.getBoundingClientRect();
    const key = Math.round(r.top);
    rows.set(key, [...(rows.get(key) ?? []), r]);
  }
  const lengths = [...rows.values()].map((r) => r.length);
  await expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
  if (items.length > 1) await expect(Math.min(...lengths)).toBeGreaterThanOrEqual(2);
  const midX = box.left + box.width / 2;
  for (const row of rows.values()) {
    const left = Math.min(...row.map((r) => r.left));
    const right = Math.max(...row.map((r) => r.right));
    await expect(Math.abs((left + right) / 2 - midX)).toBeLessThanOrEqual(1);
  }
  const rects = items.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  await expect(Math.abs((top + bottom) / 2 - (box.top + box.height / 2))).toBeLessThanOrEqual(1);
}

/**
 * An invite ring (outline) stays ≥ 12 px clear of every other target: the ringed element's box,
 * grown by its outline's reach, against each other target's box.
 */
async function expectRingClear(ringed: HTMLElement, others: Element[]) {
  const cs = getComputedStyle(ringed);
  await expect(cs.outlineStyle).toBe('solid');
  const reach = Math.max(
    0,
    Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth),
  );
  const r = ringed.getBoundingClientRect();
  for (const other of others) {
    if (other === ringed || ringed.contains(other) || other.contains(ringed)) continue;
    const b = other.getBoundingClientRect();
    const dx = Math.max(b.left - (r.right + reach), r.left - reach - b.right);
    const dy = Math.max(b.top - (r.bottom + reach), r.top - reach - b.bottom);
    await expect(Math.max(dx, dy), 'ring clearance').toBeGreaterThanOrEqual(TARGET_GAP_PX - 0.5);
  }
}

/** WCAG contrast ratio of two computed `rgb(…)` colours. */
function contrast(a: string, b: string) {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * K (CNT.02.t2): one fish by mouse drag, one by touch drag, one by tap-to-place, one by keyboard;
 * take one back out (tap it, tap the heap); check. No running count: placing only clicks.
 */
export const MakeK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectArtHolds(root, stage(canvasElement));
    await expect(heap(root)).toHaveLength(12);
    for (const el of heap(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(heap(root));
    // 12 fish, K (3 a row): 3/3/3/3, centred in the heap.
    await expectEvenHeap(pileArea(root));
    // Check is live from the start: the untouched raft is a state the model answers for (the
    // runner judges it). Nothing is sent until the child taps it.
    await expect(check(root)).toBeEnabled();
    await expect(args.onResponse).not.toHaveBeenCalled();

    await drag(heap(root)[0] as HTMLElement, containerPad(root), 'mouse');
    await waitFor(() => expect(inside(root)).toHaveLength(1));
    await drag(heap(root)[0] as HTMLElement, containerPad(root), 'touch');
    await waitFor(() => expect(inside(root)).toHaveLength(2));
    await userEvent.click(heap(root)[0] as HTMLElement);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.sprite.fish', undefined);
    await userEvent.click(containerPad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(3));
    (heap(root)[0] as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await expect(audio.sfx).toHaveBeenCalledWith('build-tap');
    await expect(audio.sayPhrases).not.toHaveBeenCalled();
    for (const el of inside(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(inside(root));

    // Take one back out: tap it, then tap the heap.
    await userEvent.click(inside(root)[3] as HTMLElement);
    await userEvent.click(pilePad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(3));
    await expect(heap(root)).toHaveLength(9);
    await expectEvenHeap(pileArea(root));

    await userEvent.click(check(root));
    check(root).blur();
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 3, removed: 1 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => e.t)).toEqual([
      'drag',
      'drop',
      'drag',
      'drop',
      'tap',
      'tap',
      'tap',
      'tap',
      'tap',
      'tap',
      'undo',
    ]);
    // Make-set traces never use counting ids (obj-<i> belongs to tap-count, MC rules read it).
    await expect(trace.some((e) => /^obj-/.test(e.target))).toBe(false);
    await expectTraceOrdered(trace);
  },
};

/** G1 (ADD.01.t1): one crab is already aboard; add three. The running count shows and speaks. */
export const AddMoreG1: Story = {
  args: { config: addMore },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(inside(root)).toHaveLength(1);
    await expect(within(root).getByRole('button', { name: 'Your answer: 1' })).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await drag(heap(root)[0] as HTMLElement, containerPad(root), 'touch');
      await waitFor(() => expect(inside(root)).toHaveLength(2 + i));
    }
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 4 }]);
    await expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible();
    for (const el of heap(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(heap(root));
    // Three crabs left, in one centred row in the middle of the heap (not top-left).
    await expectEvenHeap(pileArea(root));
    await userEvent.click(check(root));
    check(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 4, removed: 0 },
    });
  },
};

/**
 * Take away (CPS.01.t1): drag two shells out of the boat onto the "take away" pile; both parts
 * stay visible. Put one back by keyboard. The response carries the parts.
 */
export const TakeAwaySplit: Story = {
  args: { config: takeAway },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(inside(root)).toHaveLength(5);
    await expect(supplyItems(root)).toHaveLength(0);
    await drag(inside(root)[4] as HTMLElement, pilePad(root), 'mouse');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await drag(inside(root)[3] as HTMLElement, pilePad(root), 'touch');
    await waitFor(() => expect(heap(root)).toHaveLength(2));
    // The arrow between the parts is decorative: hidden from assistive tech and drawn as a plain
    // ink glyph (no fill, no border), so it never looks tappable.
    const arrow = pileArea(root).querySelector('.ni-mset__away-icon') as HTMLElement;
    await expect(arrow).toHaveAttribute('aria-hidden', 'true');
    await expect(arrow.closest('button, [role="button"]')).toBeNull();
    const look = getComputedStyle(arrow);
    await expect(look.borderTopWidth).toBe('0px');
    await expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(look.pointerEvents).toBe('none');
    // The two taken away sit centred in the "take away" pile.
    await expectEvenHeap(pileArea(root));
    for (const el of heap(root)) await expectTargetSize(el, 'g1-up');
    // One back, by keyboard: Enter picks it up and moves focus to the boat; Enter puts it in.
    (heap(root)[0] as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await userEvent.click(inside(root)[3] as HTMLElement);
    await userEvent.click(pilePad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(3));
    await userEvent.click(check(root));
    check(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 3, removed: 2, parts: [3, 2] },
    });
    // Taking away is the task here, not an undo.
    await expect(traceOf(args.onInteract).some((e) => e.t === 'undo')).toBe(false);
  },
};

/**
 * Hands, K (SUB.05.t1): tap the left hand five times, raise two on the right with "finger up",
 * fold one, raise it again with ArrowUp. Answers `parts: [left, right]`.
 */
export const HandsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: hands },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const left = canvas.getByRole('button', { name: 'Left hand: 0' });
    for (let i = 0; i < 6; i++) await userEvent.click(left);
    await expect(canvas.getByRole('button', { name: 'Left hand: 5' })).toBeVisible();
    const ups = canvas.getAllByRole('button', { name: 'Finger up' });
    const downs = canvas.getAllByRole('button', { name: 'Finger down' });
    await expect(ups[0]).toBeDisabled();
    await userEvent.click(ups[1] as HTMLElement);
    await userEvent.click(ups[1] as HTMLElement);
    await userEvent.click(downs[1] as HTMLElement);
    const right = canvas.getByRole('button', { name: 'Right hand: 1' });
    right.focus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(canvas.getByRole('button', { name: 'Right hand: 2' })).toBeVisible();
    await expect(root.querySelectorAll('[data-raised="true"]')).toHaveLength(7);
    // The open hand's thumb (raised last) shows whole: its outline is inside the drawing's box.
    const art = left.querySelector('svg.ni-hand-art') as SVGSVGElement;
    const thumb = art.querySelector('rect[data-raised="true"]') as SVGRectElement;
    const scale = art.getBoundingClientRect().height / 124;
    await expect(thumb.getBoundingClientRect().left - 1.5 * scale).toBeGreaterThanOrEqual(
      art.getBoundingClientRect().left,
    );
    for (const b of [left, right, ...ups, ...downs]) await expectTargetSize(b, 'k');
    await expectTargetGaps([...ups, ...downs]);
    await userEvent.click(check(root));
    check(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 7, removed: 0, parts: [5, 2] },
    });
    await expect(traceOf(args.onInteract).filter((e) => e.t === 'undo')).toHaveLength(1);
  },
};

/** K, capacity 20 (CNT.06.t1): two ten-frames in the boat; everything fits the widget area. */
export const TwentyK: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectArtHolds(root, stage(canvasElement));
    await expect(root.querySelectorAll('.ni-mset__frame')).toHaveLength(2);
    await expect(root.querySelectorAll('.ni-mset__slot')).toHaveLength(20);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    for (let i = 0; i < 12; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(12));
    // 7 crabs left, K: 3/2/2, centred (never 3/3/1).
    await expect(heap(root)).toHaveLength(7);
    await expectEvenHeap(pileArea(root));
    for (const el of heap(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(heap(root));
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
};

/**
 * The workshop's widget area at a viewport, as in tap-count's area stories: the width less the
 * workshop frame's 2 × 24 px padding and the stage's 2 × 3 px border; the height is the 06 §2
 * minimum, 60 % of the screen over that width, less the border. 1280 × 800 → 1226 × 493,
 * 960 × 600 (06 §1 minimum) → 906 × 373, 800 × 1280 → 746 × 812. (Today's WorkshopFrame chrome
 * leaves less than 60 %; that is the frame's to fix, not the widget's.)
 */
function widgetArea(vw: number, vh: number) {
  const outer = vw - 2 * 24;
  return { width: outer - 2 * 3, height: Math.ceil((0.6 * vw * vh) / outer) - 2 * 3 };
}

const AREA = {
  landscapeMin: widgetArea(960, 600),
  portrait: widgetArea(800, 1280),
  tablet: widgetArea(1280, 800),
  /**
   * A 960 × 720 landscape (906 × 449, 852 × 395 inside): with "make a ten" under Check (groupsOf
   * items) the column beside the boat needs ~358 px, more than the 960 × 600 minimum's 319, and
   * two K ten-frames still don't fit, so a groupsOf item shows one ten-frame at a time here.
   */
  shortLandscape: widgetArea(960, 720),
  /**
   * The Practice Pier's workshop area at 960 × 600 in K, as measured (#12): 858 × 366 inside the
   * card's padding and border. Taller than the 06 §2 minimum above, which the pier's short top
   * row gives back to the widget.
   */
  pierMinK: { width: 858 + 2 * 27, height: 366 + 2 * 27 },
} as const;

/**
 * Renders the widget in the normal warm widget card (as `.story-widget-stage`: a 3 px tan border,
 * 24 px padding, sand), the card exactly the area's size, so the widget gets the inner area
 * (906 × 373 → 852 × 319). The card is a scroll box like a stage, so the play functions can prove
 * nothing scrolls: it never grows to fit the widget.
 */
function inArea(area: keyof typeof AREA) {
  return (args: WidgetHostProps) => (
    <div
      className="story-widget-area"
      data-area-size={area}
      style={{
        ...AREA[area],
        maxWidth: 'none',
        // Centred in the stage even when wider than its padded content box (the 1226 px tablet
        // area in a 1280 px viewport): a grid item that overflows its track starts at the track's
        // left edge, so equal negative margins centre it on the viewport instead.
        justifySelf: 'center',
        marginInline: `min(0px, calc((100% - ${AREA[area].width}px) / 2))`,
        boxSizing: 'border-box',
        display: 'grid',
        overflow: 'auto',
        padding: 24,
        border: '3px solid var(--color-sand-deep)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-sand)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <WidgetHost {...args} />
    </div>
  );
}

const areaBox = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.story-widget-area') as HTMLElement;
const tens = (root: HTMLElement) => root.querySelector<HTMLElement>('.ni-mset__tens');

/** An element's content box: inside its border and padding. */
function contentBox(el: Element) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const n = (v: string) => Number.parseFloat(v) || 0;
  return {
    left: r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft),
    top: r.top + n(cs.borderTopWidth) + n(cs.paddingTop),
    right: r.right - n(cs.borderRightWidth) - n(cs.paddingRight),
    bottom: r.bottom - n(cs.borderBottomWidth) - n(cs.paddingBottom),
  };
}

type Edges = { left: number; top: number; right: number; bottom: number };
/** `inner` lies inside `outer` with at least `margin` px on every side. */
async function expectInside(inner: Edges, outer: Edges, margin: number, what: string) {
  await expect(inner.left - outer.left, `${what}: left margin`).toBeGreaterThanOrEqual(
    margin - 0.5,
  );
  await expect(inner.top - outer.top, `${what}: top margin`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.right - inner.right, `${what}: right margin`).toBeGreaterThanOrEqual(
    margin - 0.5,
  );
  await expect(outer.bottom - inner.bottom, `${what}: bottom margin`).toBeGreaterThanOrEqual(
    margin - 0.5,
  );
}

/**
 * The container holds its frames: each shown ten-frame (and the small frame beside it, one
 * ten-frame at a time) lies ≥ 8 px inside the art's body (the hull, the raft's logs, the basket,
 * the jar or the shell); each slot has ≥ 4 px of room inside its frame's border; and the whole
 * drawing (water, handle, lid) lies inside `card`'s inner area, never clipped.
 */
async function expectArtHolds(root: HTMLElement, card: Element) {
  const body = (root.querySelector('.ni-mset__body') as Element).getBoundingClientRect();
  const held = [
    ...root.querySelectorAll('.ni-mset__frame'),
    ...root.querySelectorAll('.ni-mset__tens'),
  ];
  await expect(held.length).toBeGreaterThan(0);
  for (const el of held) await expectInside(el.getBoundingClientRect(), body, 8, describe(el));
  for (const s of root.querySelectorAll('.ni-mset__slot')) {
    const frame = s.closest('.ni-mset__frame') as Element;
    const cs = getComputedStyle(frame);
    const f = frame.getBoundingClientRect();
    const b = Number.parseFloat(cs.borderTopWidth);
    const room = { left: f.left + b, top: f.top + b, right: f.right - b, bottom: f.bottom - b };
    await expectInside(s.getBoundingClientRect(), room, 4, `slot ${s.getAttribute('data-slot')}`);
  }
  const drawn = (root.querySelector('.ni-mset__drawn') as Element).getBoundingClientRect();
  await expectInside(drawn, contentBox(card), 0, 'the container art');
}

/** The plain story stage (renderWidget): the card a regular story draws the widget in. */
const stage = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.story-widget-stage') as HTMLElement;

/**
 * The whole widget fits its card's inner area with no scroll (06 §1, §2): at scrollTop 0 the
 * card scrolls neither way; every object (heap and container), every slot, the piles, the
 * container, the small ten-frame and Check lie inside the inner area; the container holds its
 * frames (expectArtHolds); a real touch (the browser's hit test) at each object's, the small
 * frame's and Check's centre lands on it; and the targets keep their size and 12 px gaps.
 */
async function expectFitsArea(root: HTMLElement, box: HTMLElement, ageMode: 'k' | 'g1-up') {
  box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  box.scrollTop = 0;
  box.scrollLeft = 0;
  await nextFrame();
  await expect(box.scrollHeight, 'the area does not scroll down').toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
  await expect(box.scrollWidth, 'the area does not scroll across').toBeLessThanOrEqual(
    box.clientWidth + 1,
  );
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  const inner = contentBox(box);
  const parts = [
    ...root.querySelectorAll<HTMLElement>('.ni-mset__pile'),
    root.querySelector('.ni-mset__container') as HTMLElement,
    ...root.querySelectorAll<HTMLElement>('.ni-mset__slot'),
    ...root.querySelectorAll<HTMLElement>('.ni-mset__tens'),
    ...[...root.querySelectorAll<HTMLElement>('.ni-mset__supply-icon')].filter(
      (el) => el.offsetParent !== null,
    ),
    ...allItems(root),
    check(root),
  ];
  await expect(parts.length).toBeGreaterThanOrEqual(4);
  for (const part of parts) {
    await expectInside(part.getBoundingClientRect(), inner, 0, `${describe(part)} in the area`);
  }
  await expectArtHolds(root, box);
  const targets = [
    ...allItems(root),
    ...root.querySelectorAll<HTMLElement>('.ni-mset__tens'),
    check(root),
  ];
  for (const el of targets) await expectHit(el, center(el), describe(el));
  await expect(box.scrollTop).toBe(0);
  for (const el of targets) await expectTargetSize(el, ageMode);
  await expectTargetGaps(targets);
  // The content (piles, container, actions) covers ≥ 60 % of the card's inner area.
  const content = [
    ...root.querySelectorAll('.ni-mset__pile'),
    root.querySelector('.ni-mset__container') as Element,
    root.querySelector('.ni-mset__actions') as Element,
  ].map((el) => el.getBoundingClientRect());
  const w = Math.max(...content.map((r) => r.right)) - Math.min(...content.map((r) => r.left));
  const h = Math.max(...content.map((r) => r.bottom)) - Math.min(...content.map((r) => r.top));
  const areaW = inner.right - inner.left;
  const areaH = inner.bottom - inner.top;
  await expect((w * h) / (areaW * areaH), 'area fill').toBeGreaterThanOrEqual(0.6);
}

/** Check passes a real hit test at its centre and answers when tapped there. */
async function expectCheckTaps(root: HTMLElement) {
  const ok = check(root);
  await expectHit(ok, center(ok), 'Check');
  await expect(ok).toBeEnabled();
  await userEvent.click(ok);
  // Stories that end here end with no focus ring.
  ok.blur();
}

/** Puts `n` objects in, one at a time: tap the first heap object, then the container. */
async function tapIn(root: HTMLElement, n: number) {
  for (let i = 0; i < n; i++) {
    await userEvent.click(heap(root)[0] as HTMLElement);
    await userEvent.click(containerPad(root));
  }
}

/**
 * The frame slides over as the ten is tied or untied, and the button beside it pops in: wait
 * until both have arrived.
 */
async function framesSettled(root: HTMLElement) {
  const frames = root.querySelector('.ni-mset__frames') as HTMLElement;
  await waitFor(() => expect(getComputedStyle(frames).left).toBe(frames.style.left));
  const popping = (tens(root)?.getAnimations() ?? []).filter(
    (a) =>
      a.playState === 'running' &&
      a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
  );
  await Promise.all(popping.map((a) => a.finished.catch(() => undefined)));
  await nextFrame();
}

/** What a sprite draws, in screen px: its SVG content's box (not its layout box, which is bigger). */
function drawnSize(host: Element) {
  const svg = (host.matches('svg') ? host : host.querySelector('svg')) as SVGSVGElement;
  const bb = svg.getBBox();
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const sx = r.width / vb.width;
  const sy = r.height / vb.height;
  const left = r.left + (bb.x - vb.x) * sx;
  const top = r.top + (bb.y - vb.y) * sy;
  const width = bb.width * sx;
  const height = bb.height * sy;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/**
 * The tied ten reads "10, then the ones": it comes first (its box left of the frame of ones, or
 * above it), it is about as tall as that frame (its small frame ≥ 85 % of the frame's height,
 * with ≥ 32 px pieces) and it carries a "10" numeral of at least 32 px.
 */
async function expectTenFirst(root: HTMLElement) {
  const ten = tens(root) as HTMLElement;
  await expect(ten).toHaveAttribute('data-tens', 'bundle');
  await framesSettled(root);
  const frame = (root.querySelector('.ni-mset__frame') as Element).getBoundingClientRect();
  const t = ten.getBoundingClientRect();
  await expect(t.right <= frame.left || t.bottom <= frame.top, 'the ten comes first').toBe(true);
  // ONE bundle, not a frame: no cells; ten objects of ≥ 32 px, most of the frame's height.
  await expect(ten.querySelector('.ni-mset__tens-frame')).toBeNull();
  const bundle = (ten.querySelector('.ni-mset__bundle') as Element).getBoundingClientRect();
  await expect(bundle.height).toBeGreaterThanOrEqual(0.6 * frame.height);
  const objs = [...ten.querySelectorAll('.ni-mset__bundle-obj')];
  await expect(objs).toHaveLength(10);
  await expect(ten.querySelectorAll('.ni-mset__bundle-obj [data-sprite]')).toHaveLength(10);
  // Every one of the ten in view: drawn ≥ 40 px, ≥ 80 % of its drawing clear of the rope and the
  // bow (their shapes' boxes with the outline; overlaps summed, so counted twice where they meet).
  const tie = [
    ...ten.querySelectorAll(
      '.ni-mset__bundle-tie rect, .ni-mset__bundle-tie ellipse, .ni-mset__bundle-tie circle',
    ),
  ].map((el) => {
    const r = el.getBoundingClientRect();
    const w = Number.parseFloat(getComputedStyle(el).strokeWidth) / 2 || 0;
    return { left: r.left - w, top: r.top - w, right: r.right + w, bottom: r.bottom + w };
  });
  for (const [i, o] of objs.entries()) {
    // Drawn (not just boxed) at ≥ 40 px, the token's size in one-frame mode (06 §2).
    const ink = drawnSize(o);
    const r = ink;
    await expect(ink.width, 'bundle object drawn width').toBeGreaterThanOrEqual(40);
    await expect(ink.height, 'bundle object drawn height').toBeGreaterThanOrEqual(40);
    // The row below (drawn over it) hides the feet only: under 30 % of the drawing's height.
    const below = objs[i + 2];
    if (below) {
      const hidden = ink.bottom - drawnSize(below).top;
      await expect(hidden / ink.height, 'hidden by the row below').toBeLessThanOrEqual(0.3);
    }
    // An invite ring is drawn in the outer 5 px of the token's box: the drawing stays inside it
    // (sides and top; the tag and the fingertip strip are below).
    await expect(ink.left - bundle.left, 'drawing inside the ring, left').toBeGreaterThanOrEqual(
      4.5,
    );
    await expect(bundle.right - ink.right, 'drawing inside the ring, right').toBeGreaterThanOrEqual(
      4.5,
    );
    await expect(ink.top - bundle.top, 'drawing inside the ring, top').toBeGreaterThanOrEqual(4.5);
    await expect(bundle.bottom - ink.bottom, 'drawing inside the bundle').toBeGreaterThanOrEqual(
      -0.5,
    );
    const covered = tie.reduce(
      (sum, t) =>
        sum +
        Math.max(0, Math.min(r.right, t.right) - Math.max(r.left, t.left)) *
          Math.max(0, Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)),
      0,
    );
    await expect(covered / (r.width * r.height), 'object covered by the tie').toBeLessThanOrEqual(
      0.2,
    );
  }
  const tag = ten.querySelector('.ni-mset__tens-tag') as HTMLElement;
  await expect(tag).toHaveTextContent('10');
  await expect(tag).toBeVisible();
  await expect(Number.parseFloat(getComputedStyle(tag).fontSize)).toBeGreaterThanOrEqual(32);
}

/**
 * TwentyK at the minimum landscape (960 × 600 → a 906 × 373 card, 852 × 319 inside). Two K
 * ten-frames need 356 px of slots, so the boat shows one ten-frame at a time (03 §5.5): when the
 * first ten fills it ties into a bundle (the bundled ten-frame's rope band on a small 2 × 5 frame,
 * 92 × 186) beside the frame, which goes on filling with the ones. Fourteen crabs show as the
 * tied ten plus a frame holding 4. Tapping the ten unties it (and says "ten") so crabs can come
 * out; tapping the ones (or Enter on them) ties it again. The heap and Check sit in a column
 * beside the boat; no scroll.
 */
export const TwentyKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const box = areaBox(canvasElement);
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    await expect(root).toHaveAttribute('data-layout', 'side');
    await expect(root.querySelectorAll('.ni-mset__frame')).toHaveLength(1);
    await expect(tens(root)).toBeNull();
    await expectFitsArea(root, box, 'k');

    // One crab by touch drag, then 13 by tap-to-place: the first ten ties up at 10.
    await drag(heap(root)[0] as HTMLElement, containerPad(root), 'touch');
    await waitFor(() => expect(inside(root)).toHaveLength(1));
    await tapIn(root, 9);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    await expect(inside(root)).toHaveLength(0);
    await tapIn(root, 4);
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    // 14: the tied ten (ten pieces, named "10") beside the frame of ones (slots 10–19).
    const ten = tens(root) as HTMLElement;
    await expect(ten).toHaveAttribute('data-tens', 'bundle');
    await expect(ten).toHaveAccessibleName('10');
    await expect(ten.querySelectorAll('.ni-sprite')).toHaveLength(10);
    // Tied: the rope round the middle and a visible bow (two loops and a knot) on the front.
    const tie = ten.querySelector('.ni-mset__bundle-tie') as Element;
    await expect(tie).not.toBeNull();
    await waitForSettled(tie);
    await expect(tie.querySelectorAll('.ni-mset__bow')).toHaveLength(3);
    const bundleBox = (ten.querySelector('.ni-mset__bundle') as Element).getBoundingClientRect();
    for (const bow of tie.querySelectorAll('.ni-mset__bow')) {
      await expectInside(bow.getBoundingClientRect(), bundleBox, 0, 'the bow on the bundle');
    }
    await expect(root.querySelector('[data-slot="10"]')).not.toBeNull();
    await expect(root.querySelector('[data-slot="0"]')).toBeNull();
    await expectTenFirst(root);
    await expectFitsArea(root, box, 'k');

    // Tap the ten (a real touch on it): it unties into the frame and says "ten".
    await expectHit(ten, center(ten), 'the tied ten');
    await userEvent.click(ten);
    await waitFor(() => expect(inside(root)).toHaveLength(10));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 10 }]);
    await expect(tens(root)).toHaveAttribute('data-tens', 'ones');
    await expect(tens(root)).toHaveAccessibleName('4');
    await expect((tens(root) as HTMLElement).querySelectorAll('.ni-sprite')).toHaveLength(4);
    // Untied, the ten's frame comes first and the ones after it (right), with no "10" tag.
    await framesSettled(root);
    const tenFrame = (root.querySelector('.ni-mset__frame') as Element).getBoundingClientRect();
    await expect((tens(root) as HTMLElement).getBoundingClientRect().left).toBeGreaterThan(
      tenFrame.right,
    );
    await expect((tens(root) as HTMLElement).querySelector('.ni-mset__tens-tag')).toBeNull();
    await expectFitsArea(root, box, 'k');
    // A crab comes out of the ten: 13, the ten still shown.
    await userEvent.click(inside(root)[9] as HTMLElement);
    await userEvent.click(pilePad(root));
    await waitFor(() => expect(tens(root)).toHaveAccessibleName('3'));
    await expect(inside(root)).toHaveLength(10);
    // Tie it again from the keyboard (Tab to the ones' button, Enter): focus stays on the button
    // that replaces it (the tied ten), so Enter unties it again and focus comes back.
    (tens(root) as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    await expect(tens(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'ones'));
    await expect(tens(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    await expect(tens(root)).toHaveFocus();
    await expect(inside(root)).toHaveLength(3);
    await expectTenFirst(root);
    await expectFitsArea(root, box, 'k');

    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 13, removed: 1 },
    });
    // Tying and untying are presentation only: no trace events for them.
    const trace = traceOf(args.onInteract);
    await expect(trace.some((e) => !/^set-\d+$|^container$|^pile$/.test(e.target))).toBe(false);
  },
};

const oneFrameInvite: WidgetDemo = createDemoController({ strict: true });

/** Every object, the shown ten-frame(s) and the small frame beside them. */
const ringNeighbours = (root: HTMLElement) => [
  ...allItems(root),
  ...root.querySelectorAll('.ni-mset__frame'),
  ...root.querySelectorAll('.ni-mset__tens'),
];

/**
 * The ring and the guide's hand on `el` and nothing else, the ring ≥ 12 px clear of every object, of the
 * shown ten-frame and of the small frame beside it (whichever it is not on).
 */
async function expectInviteOn(root: HTMLElement, el: HTMLElement) {
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
  await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
  await framesSettled(root);
  await expectPointerOn(pointerIn(el), el, root);
  await expectRingClear(el, ringNeighbours(root));
  await expectRingBelowArtTop(root, el);
}

/** A ring (outline) on `el` lies ≥ 12 px below the container art's top edge (a boat's hull). */
async function expectRingBelowArtTop(root: HTMLElement, el: HTMLElement) {
  const cs = getComputedStyle(el);
  const reach = Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth);
  const ringTop = el.getBoundingClientRect().top - Math.max(0, reach);
  const art = (root.querySelector('.ni-mset__drawn') as Element).getBoundingClientRect();
  await expect(ringTop - art.top, 'ring below the art top edge').toBeGreaterThanOrEqual(12 - 0.5);
}

/** The guide's hand carries the action's cue: `take` (remove) or `count`. */
async function expectHandCue(root: HTMLElement, cue: 'take' | 'count') {
  const handEl = root.querySelector('.ni-hand') as HTMLElement;
  await expect(handEl.querySelector(`.ni-mset__cue[data-cue="${cue}"]`)).not.toBeNull();
}

/**
 * One ten-frame at a time (TwentyKMinLandscape's layout) with a remove invite: the object to take
 * out is the last one in, and it can be in the frame not shown. Then the ring and the guide's hand go
 * on the button beside the frame that shows it (the ones, or the tied ten), and on the object
 * once it is in view.
 */
export const TwentyKMinRemoveInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty, demo: oneFrameInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    await tapIn(root, 12);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));

    // 12, the ten tied: the last crab is in the frame of ones, in view.
    oneFrameInvite.invite({ op: 'answer', args: { value: 11 } });
    await expectInviteOn(root, inside(root).at(-1) as HTMLElement);
    await expectHandCue(root, 'take');
    // Untie the ten: the last crab is now among the ones beside it, so the ones' button is invited.
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'ones'));
    await expectInviteOn(root, tens(root) as HTMLElement);
    // Tie it again: the crab is in view and invited.
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    await expectInviteOn(root, inside(root).at(-1) as HTMLElement);

    // Take two out: exactly ten, all in the tied ten, and the frame of ones is empty.
    for (let i = 0; i < 2; i++) {
      await userEvent.click(inside(root).at(-1) as HTMLElement);
      await userEvent.click(pilePad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(0));
    await expect(tens(root)).toHaveAttribute('data-tens', 'bundle');
    oneFrameInvite.invite({ op: 'answer', args: { value: 9 } });
    await expectInviteOn(root, tens(root) as HTMLElement);
    // Untie it: the ten is in the frame, and its last crab is invited.
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(inside(root)).toHaveLength(10));
    await expectInviteOn(root, inside(root).at(-1) as HTMLElement);
    // Tie it again (the empty ones' button): the invite goes back on the tied ten, and stays.
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    await expectInviteOn(root, tens(root) as HTMLElement);
  },
};

const oneFrameCount: WidgetDemo = createDemoController({ strict: true });

/** The spoken numbers, in order (`sayNumber` speaks a `{ number }` phrase). */
const spokenNumbers = (audio: ReturnType<typeof spyAudio>) =>
  (audio.sayPhrases.mock.calls as unknown as [{ number?: number }[]][]).flatMap(([phrases]) =>
    phrases.flatMap((p) => (p.number === undefined ? [] : [p.number])),
  );

/**
 * Counting step `n` (11 and up) on the small frame of ones beside the shown ten: the ONE cell
 * being counted (cell n − 11) is marked, no other is, and the running number `n` sits under the
 * small frame, outside its cells, over no object (in the frame, beside it or in the heap).
 */
async function expectOnesCountStep(root: HTMLElement, n: number) {
  const badge = await waitFor(
    () => {
      const b = tens(root)?.querySelector<HTMLElement>('.ni-mset__tens-count');
      if (b?.textContent !== String(n)) throw new Error(`waiting for ${n}`);
      return b;
    },
    { timeout: 15_000, interval: 20 },
  );
  const ones = tens(root) as HTMLElement;
  await expect(ones).toHaveAttribute('data-tens', 'ones');
  await expect(ones).not.toHaveAttribute('data-counting');
  // The ones counted so far are marked (the marks equal the count), the rest are not.
  const cells = [...ones.querySelectorAll('.ni-mset__tens-cell')];
  await expect(cells.map((c) => c.hasAttribute('data-counting'))).toEqual(
    cells.map((_, k) => k <= n - 11),
  );
  const b = badge.getBoundingClientRect();
  await expect(Number.parseFloat(getComputedStyle(badge).fontSize)).toBeGreaterThanOrEqual(32);
  const mini = (ones.querySelector('.ni-mset__tens-frame') as Element).getBoundingClientRect();
  await expect(b.top, 'under the small frame').toBeGreaterThanOrEqual(mini.bottom);
  for (const s of root.querySelectorAll('.ni-sprite')) {
    const r = s.getBoundingClientRect();
    const apart = b.right <= r.left || r.right <= b.left || b.bottom <= r.top || r.bottom <= b.top;
    await expect(apart, `count ${n} clear of every object`).toBe(true);
  }
  const area = root.closest('.story-widget-area') as Element;
  await expectInside(b, contentBox(area), 0, 'count in the area');
}

/**
 * One ten-frame at a time, count-aloud (follow-up from #76): nothing is counted out of sight.
 * With the ten tied beside the ones, the invite goes on the tied ten and the guide counts it as one ten
 * ("ten", on the bundle), then on through the ones in view. With the ten shown, the guide counts 1–10
 * in the frame and the ones on their small frame beside it, which shows the running count.
 */
export const TwentyKMinCountAloud: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty, demo: oneFrameCount },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    await tapIn(root, 12);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));

    // The tied ten: invited first, counted as "ten", then 11 and 12 in the frame of ones.
    oneFrameCount.invite({ op: 'count-aloud' });
    await expectInviteOn(root, tens(root) as HTMLElement);
    await expectHandCue(root, 'count');
    clearSpies(audio);
    const tied = oneFrameCount.play({ op: 'count-aloud' });
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-counting', 'true'));
    await tied;
    await expect(spokenNumbers(audio)).toEqual([10, 11, 12]);

    // Untie: the first ten is in the frame and the ones are beside it; counting reaches them.
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'ones'));
    oneFrameCount.invite({ op: 'count-aloud' });
    const framesRing = root.querySelector('.ni-mset__frames') as HTMLElement;
    await waitFor(() => expect(framesRing).toHaveClass('ni-invite'));
    await framesSettled(root);
    await expectRingClear(framesRing, ringNeighbours(root));
    await expectRingBelowArtTop(root, framesRing);
    await expectHandCue(root, 'count');
    clearSpies(audio);
    const untied = oneFrameCount.play({ op: 'count-aloud' });
    // Ten counting steps (≈ 600 ms each) come first; then 11 and 12, each on its own small cell.
    for (const n of [11, 12]) await expectOnesCountStep(root, n);
    await untied;
    await expect(spokenNumbers(audio)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    // Tie the ten again: the count-aloud invite is back on the tied ten (the story's end state).
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    oneFrameCount.invite({ op: 'count-aloud' });
    await expectInviteOn(root, tens(root) as HTMLElement);
  },
};

/**
 * PV.09.t1 seed 1 (a real generated item, CNT.19-style regrouping: 13 loose crabs already in the
 * boat, groupsOf 10, nothing bundled; its solution says "Count out ten ones." with `count-aloud`,
 * then `bundle`).
 */
const regroup: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 13,
  mode: 'make',
  start: 13,
  source: { sprite: 'crab', supply: 0 },
  container: 'boat',
  capacity: 20,
  showRunningCount: false,
  groupsOf: 10,
};

const regroupBefore: WidgetDemo = createDemoController({ strict: true });

/**
 * PV.09.t1 in a short landscape area (960 × 720 → a 906 × 449 card), one ten-frame at a time,
 * BEFORE bundling. The first ten sits beside the ones as a sheaf of ten, not tied (no rope, no
 * bow: the model has no bundle yet), and count-aloud counts every crab one by one, 1 … 13: the
 * ten's frame is shown while 1–10 are counted, the ones on their small frame after it, and the page
 * comes back afterwards. The story ends on the solution's next step, an invite on "Make a ten"
 * (one ring, the guide's hand).
 */
export const RegroupKShortBeforeBundle: Story = {
  globals: { ageMode: 'k' },
  args: { config: regroup, demo: regroupBefore },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('shortLandscape'),
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    await expect((tens(root) as HTMLElement).querySelector('.ni-mset__bundle-tie')).toBeNull();
    await expectFitsArea(root, areaBox(canvasElement), 'k');

    clearSpies(audio);
    const counted = regroupBefore.play({ op: 'count-aloud' });
    // The ten's own frame is shown while its crabs are counted.
    await waitFor(() =>
      expect(root.querySelector('[data-slot="0"] [data-counting="true"]')).not.toBeNull(),
    );
    await expect(tens(root)).toHaveAttribute('data-tens', 'ones');
    for (const n of [11, 12, 13]) await expectOnesCountStep(root, n);
    await counted;
    await expect(spokenNumbers(audio)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    // Counted one by one, and left that way before any bundle exists: all 13 loose (the ten in
    // its frame, the ones on their small frame), marked 1–10 and the ones 11–13 with the 13 under
    // them.
    await expect(tens(root)).toHaveAttribute('data-tens', 'ones');
    await expect(root.querySelector('.ni-mset__frame[data-bundled="true"]')).toBeNull();
    await expect(root.querySelector('.ni-mset__bundle')).toBeNull();
    const frameMarks = [...root.querySelectorAll('.ni-mset__frame .ni-mset__mark')].map((m) =>
      Number(m.textContent),
    );
    await expect(frameMarks).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    const onesCells = [...(tens(root) as HTMLElement).querySelectorAll('.ni-mset__tens-cell')];
    await expect(onesCells.filter((c) => c.hasAttribute('data-counting'))).toHaveLength(3);
    // The waiting ones are tokens drawn ≥ 32 px (06 §2, one-frame mode), counted or not, each
    // inside its own cell.
    for (const cell of onesCells.filter((c) => c.querySelector('svg'))) {
      const ink = drawnSize(cell);
      await expect(ink.width, 'waiting one drawn width').toBeGreaterThanOrEqual(32);
      await expect(ink.height, 'waiting one drawn height').toBeGreaterThanOrEqual(32);
      const c = cell.getBoundingClientRect();
      await expect(ink.top).toBeGreaterThanOrEqual(c.top - 0.5);
      await expect(ink.bottom).toBeLessThanOrEqual(c.bottom + 0.5);
    }
    await expect(tens(root)?.querySelector('.ni-mset__tens-count')).toHaveTextContent('13');

    // Next: make a ten.
    regroupBefore.invite({ op: 'bundle' });
    const makeTen = within(root).getByRole('button', { name: 'Make a ten' });
    await waitFor(() => expect(makeTen.closest('.ni-mset__action')).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    await waitFor(() => expectPointerOn(pointerIn(makeTen), makeTen, root));
    // The guide's hand at rest (its tap bob held at the start), and 8 px lower at the bob's bottom,
    // stays ≥ 12 px clear of Check under the invited "Make a ten".
    const handEl = pointerIn(makeTen);
    for (const a of handEl.getAnimations()) {
      a.pause();
      a.currentTime = 0;
    }
    const h = handEl.getBoundingClientRect();
    const ok = check(root).getBoundingClientRect();
    await expect(ok.top - (h.bottom + 8), 'hand clear of Check').toBeGreaterThanOrEqual(12);
    for (const a of handEl.getAnimations()) a.play();
    await expectFitsArea(root, areaBox(canvasElement), 'k');
  },
};

const resizeCount: WidgetDemo = createDemoController({ strict: true });

/**
 * The host shrinks while the guide counts (a tablet turned, a panel opened): 12 crabs in two frames at
 * the tablet area, then the minimum area (one frame at a time, the first ten tied beside the
 * ones) right after "one". Every number spoken after that still has a visible highlight: on the
 * tied ten while its crabs are counted, then on the ones in the frame.
 */
export const CountAloudSurvivesResize: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...twenty, start: 12 }, demo: resizeCount },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(inside(root)).toHaveLength(12));
    await expect(root).not.toHaveAttribute('data-one-frame');
    clearSpies(audio);
    const counted = resizeCount.play({ op: 'count-aloud' });
    await waitFor(() => expect(spokenNumbers(audio)).toEqual([1]));
    const box = areaBox(canvasElement);
    box.style.width = `${AREA.landscapeMin.width}px`;
    box.style.height = `${AREA.landscapeMin.height}px`;
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    let heard = spokenNumbers(audio).length;
    while (heard < 12) {
      await waitFor(() => expect(spokenNumbers(audio).length).toBeGreaterThan(heard), {
        timeout: 3000,
        interval: 20,
      });
      heard = spokenNumbers(audio).length;
      const lit = root.querySelector('[data-counting="true"]') as HTMLElement | null;
      await expect(lit, `a highlight for ${heard}`).not.toBeNull();
      await expect(lit).toBeVisible();
    }
    await counted;
    await expect(spokenNumbers(audio)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  },
};

const resizeLoose: WidgetDemo = createDemoController({ strict: true });

/**
 * The same shrink on the regrouping item (13 loose crabs, groupsOf 10, nothing bundled), where the
 * ten is counted crab by crab: after "one" the area shrinks to one frame at a time. The ten's own
 * frame is the one shown, so each of 2–10 lights its own crab's slot (never the loose sheaf as a
 * whole), then 11–13 are counted on the small frame of ones, and the view stays that way, as when
 * counting starts in one frame (RegroupKShortBeforeBundle).
 */
export const CountAloudSurvivesResizeLooseTen: Story = {
  globals: { ageMode: 'k' },
  args: { config: regroup, demo: resizeLoose },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(inside(root)).toHaveLength(13));
    await expect(root).not.toHaveAttribute('data-one-frame');
    clearSpies(audio);
    const counted = resizeLoose.play({ op: 'count-aloud' });
    await waitFor(() => expect(spokenNumbers(audio)).toEqual([1]));
    const box = areaBox(canvasElement);
    box.style.width = `${AREA.shortLandscape.width}px`;
    box.style.height = `${AREA.shortLandscape.height}px`;
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    // In one frame from here on: the ten's frame, the ones beside it, no sheaf lit as a whole.
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'ones'));
    let heard = spokenNumbers(audio).length;
    await expect(heard, 'shrunk while the ten is still being counted').toBeLessThan(10);
    while (heard < 10) {
      await waitFor(() => expect(spokenNumbers(audio).length).toBeGreaterThan(heard), {
        timeout: 3000,
        interval: 20,
      });
      heard = spokenNumbers(audio).length;
      const n = heard;
      const lit = await waitFor(
        () => {
          const el = root.querySelector<HTMLElement>(
            `[data-slot="${n - 1}"] [data-counting="true"]`,
          );
          if (!el) throw new Error(`no highlight in slot ${n - 1} for ${n}`);
          return el;
        },
        { timeout: 300, interval: 10 },
      );
      await expect(lit).toBeVisible();
      await expect(tens(root)).toHaveAttribute('data-tens', 'ones');
      await expect(tens(root)).not.toHaveAttribute('data-counting');
    }
    for (const n of [11, 12, 13]) await expectOnesCountStep(root, n);
    await counted;
    await expect(spokenNumbers(audio)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    await expect(tens(root)).toHaveAttribute('data-tens', 'ones');
    await expect(root.querySelector('.ni-mset__bundle')).toBeNull();
    await expectFitsArea(root, areaBox(canvasElement), 'k');
  },
};

const regroupAnswer: WidgetDemo = createDemoController({ strict: true });

/**
 * An `answer` invite on a set that already holds the value but has a full ten still loose
 * (groupsOf 10, 13 crabs). The model's `answer` ends with the ten tied and `set.count` checks the
 * bundles, so the cue goes on "Make a ten" first and on Check only once the ten is tied: following
 * the cue gives the answer the checker accepts. (A child's action ends an invite, as everywhere
 * in this widget; the host gives the same `answer` invite again for the next step.)
 */
export const AnswerInviteBundlesFirst: Story = {
  globals: { ageMode: 'k' },
  args: { config: regroup, demo: regroupAnswer },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    regroupAnswer.invite({ op: 'answer', args: { value: 13 } });
    const makeTen = within(root).getByRole('button', { name: 'Make a ten' });
    await waitFor(() => expect(makeTen.closest('.ni-mset__action')).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(check(root)).not.toHaveClass('ni-invite');
    await userEvent.click(makeTen);
    await waitFor(() => expect(makeTen).toBeDisabled());
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(0);
    regroupAnswer.invite({ op: 'answer', args: { value: 13 } });
    await waitFor(() => expect(check(root)).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await userEvent.click(check(root));
    check(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 13, removed: 0, bundles: 1 },
    });
    regroupAnswer.invite(null);
  },
};

const regroupAfter: WidgetDemo = createDemoController({ strict: true });

/**
 * PV.09.t1, AFTER bundling (the solution's `bundle`): the ten is tied (rope and bow) and is one
 * ten in the model, so counting it as one ten is right: "10, 11, 12, 13". The story ends on a
 * count-aloud invite on the tied ten (one ring, the guide's hand with its "count" cue), where counting
 * now starts. (An invite on Check, at the foot of the column, would need the hand's room below
 * it, more than this short area has.)
 */
export const RegroupKShortAfterBundle: Story = {
  globals: { ageMode: 'k' },
  args: { config: regroup, demo: regroupAfter },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('shortLandscape'),
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-one-frame', 'true'));
    await regroupAfter.play({ op: 'bundle' });
    await waitFor(() =>
      expect((tens(root) as HTMLElement).querySelector('.ni-mset__bundle-tie')).not.toBeNull(),
    );
    await expectTenFirst(root);
    // Review round 3 (F3): untie the view (the full, bundled frame with the ones beside it): the
    // bow's ink stays ≥ 12 px clear of the small frame of ones.
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'ones'));
    await framesSettled(root);
    const bundled = root.querySelector('.ni-mset__frame[data-bundled="true"]') as HTMLElement;
    await waitForSettled(bundled.querySelector('.ni-mset__band') as Element);
    const ones = (tens(root) as HTMLElement).getBoundingClientRect();
    for (const bow of bundled.querySelectorAll('.ni-mset__bow')) {
      const r = bow.getBoundingClientRect();
      const ink = {
        left: r.left - 1.5,
        top: r.top - 1.5,
        right: r.right + 1.5,
        bottom: r.bottom + 1.5,
      };
      const gap = Math.max(
        ones.left - ink.right,
        ink.left - ones.right,
        ones.top - ink.bottom,
        ink.top - ones.bottom,
      );
      await expect(gap, 'bow clear of the small frame').toBeGreaterThanOrEqual(12 - 0.5);
    }
    await userEvent.click(tens(root) as HTMLElement);
    await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
    (document.activeElement as HTMLElement | null)?.blur();
    clearSpies(audio);
    await regroupAfter.play({ op: 'count-aloud' });
    await expect(spokenNumbers(audio)).toEqual([10, 11, 12, 13]);
    // The ten counted as one ten, the three ones marked 11, 12, 13 (they stay marked).
    const onesMarks = [...root.querySelectorAll('.ni-mset__frame .ni-mset__mark')].map((m) =>
      Number(m.textContent),
    );
    await expect(onesMarks).toEqual([11, 12, 13]);
    regroupAfter.invite({ op: 'count-aloud' });
    await expectInviteOn(root, tens(root) as HTMLElement);
    await expectHandCue(root, 'count');
    await expectFitsArea(root, areaBox(canvasElement), 'k');
  },
};

/** Spies for the one-frame twin in OneFrameMatchesTwoFrames. */
const twin = { onResponse: fn(), onInteract: fn() };

/**
 * The same moves give the same response and the same trace with two ten-frames (the plain stage)
 * and one ten-frame at a time (the 960 × 600 card): twelve crabs in, one back out, one in by
 * keyboard, Check. In the one-frame widget the ten is also untied and tied again mid-way, which
 * changes neither.
 */
export const OneFrameMatchesTwoFrames: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty },
  render: (args) => (
    <div style={{ display: 'grid', gap: 24, justifyItems: 'center' }}>
      {renderWidget(args)}
      {inArea('landscapeMin')({ ...args, ...twin })}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    twin.onResponse.mockClear();
    twin.onInteract.mockClear();
    await findWidget(canvasElement, ROOT);
    const two = stage(canvasElement).querySelector(ROOT) as HTMLElement;
    const one = await findWidget(areaBox(canvasElement), ROOT);
    await waitFor(() => expect(one).toHaveAttribute('data-one-frame', 'true'));
    await expect(two).not.toHaveAttribute('data-one-frame');
    await expect(two.querySelectorAll('.ni-mset__frame')).toHaveLength(2);

    const run = async (root: HTMLElement, retie: boolean) => {
      await tapIn(root, 12);
      if (retie) {
        await userEvent.click(tens(root) as HTMLElement);
        await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'ones'));
        await userEvent.click(tens(root) as HTMLElement);
        await waitFor(() => expect(tens(root)).toHaveAttribute('data-tens', 'bundle'));
      }
      // The last crab in comes back out (it is in view in both).
      await userEvent.click(root.querySelector('[data-item="set-11"]') as HTMLElement);
      await userEvent.click(pilePad(root));
      // One in by keyboard: Enter picks it up, Enter puts it in the container.
      (heap(root)[0] as HTMLElement).focus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('{Enter}');
      await userEvent.click(check(root));
      check(root).blur();
    };
    await run(two, false);
    await run(one, true);

    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(twin.onResponse.mock.calls).toEqual(
      (args.onResponse as ReturnType<typeof fn>).mock.calls,
    );
    await expect(twin.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 12, removed: 0 },
    });
    const strip = (calls: unknown) => traceOf(calls).map(({ t, target }) => ({ t, target }));
    const traceTwo = strip(args.onInteract);
    await expect(traceTwo.length).toBeGreaterThan(20);
    await expect(strip(twin.onInteract)).toEqual(traceTwo);
  },
};

/**
 * TwentyK in portrait (800 × 1280 → a 746 × 812 card, 692 × 758 inside): both ten-frames, in the
 * tight frame chrome, the heap (one row) above the boat and Check under it; no scroll.
 */
export const TwentyKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty },
  render: inArea('portrait'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-chrome', 'tight'));
    await expect(root).not.toHaveAttribute('data-one-frame');
    await expect(root.querySelectorAll('.ni-mset__frame')).toHaveLength(2);
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    await expectEvenHeap(pileArea(root));
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 0, removed: 0 },
    });
  },
};

/**
 * TwentyK at the tablet baseline (1280 × 800 → a 1226 × 493 card, 1172 × 439 inside): one row as
 * designed, heap, boat and Check side by side, both ten-frames in view (tight frame chrome).
 */
export const TwentyKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-chrome', 'tight'));
    await expect(root).toHaveAttribute('data-layout', 'row');
    await expect(root).not.toHaveAttribute('data-one-frame');
    await expect(root.querySelectorAll('.ni-mset__frame')).toHaveLength(2);
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    const pile = pileArea(root).getBoundingClientRect();
    const boat = (root.querySelector('.ni-mset__container') as HTMLElement).getBoundingClientRect();
    const ok = check(root).getBoundingClientRect();
    await expect(pile.right).toBeLessThan(boat.left);
    await expect(boat.right).toBeLessThan(ok.left);
    // Three columns of K objects, all 12 shown, as before.
    await expect(heap(root)).toHaveLength(12);
    await expect(new Set(heap(root).map((el) => el.getBoundingClientRect().left)).size).toBe(3);
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
  },
};

/** The open shell, K, at the minimum landscape (852 × 319 inside): `side`, no scroll. */
export const ShellKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: shell },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-layout', 'side'));
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    await expectEvenHeap(pileArea(root));
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
  },
};

/** The open shell, K, in portrait (692 × 758 inside): heap, shell, then Check, all inside. */
export const ShellKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: shell },
  render: inArea('portrait'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    await expectEvenHeap(pileArea(root));
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
  },
};

/**
 * Take away at the minimum landscape (852 × 319 inside): `side`, the boat on the right, the
 * "take away" pile (its arrow beside its heap) with Check under it on the left; both parts stay
 * visible and inside the area, no scroll.
 */
export const TakeAwayMinLandscape: Story = {
  args: { config: takeAway },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-layout', 'side'));
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up');
    await drag(inside(root)[4] as HTMLElement, pilePad(root), 'mouse');
    await waitFor(() => expect(heap(root)).toHaveLength(1));
    await userEvent.click(inside(root)[3] as HTMLElement);
    await userEvent.click(pilePad(root));
    await waitFor(() => expect(heap(root)).toHaveLength(2));
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up');
    await expectEvenHeap(pileArea(root));
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 3, removed: 2, parts: [3, 2] },
    });
  },
};

/**
 * Bundling (CNT.19, groupsOf 10): fill a ten, tie it with "make a ten", add three more. The
 * response carries `bundles`.
 */
export const BundleTen: Story = {
  args: { config: bundleTen },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const tie = within(root).getByRole('button', { name: 'Make a ten' });
    // Sticks look slim, but each one's hit area is the full G1 target, 12 px apart.
    for (const el of heap(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(heap(root));
    for (let i = 0; i < 10; i++) {
      if (i === 9) await expect(tie).toBeDisabled();
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(tie).toBeEnabled());
    await userEvent.click(tie);
    await expect(root.querySelector('.ni-mset__frame[data-bundled="true"]')).not.toBeNull();
    await expect(tie).toBeDisabled();
    // The bow sits just outside the frame's edge: once the band has popped in, it overlaps no
    // slot and not the frame's border.
    await waitForSettled(root.querySelector('.ni-mset__band') as Element);
    await expectKnotOffBorder(root);
    const bows = [...root.querySelectorAll('.ni-mset__bow')].map((b) => b.getBoundingClientRect());
    await expect(bows.length).toBeGreaterThan(0);
    for (const s of root.querySelectorAll('.ni-mset__slot')) {
      const r = s.getBoundingClientRect();
      for (const b of bows) {
        const apart =
          b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom;
        await expect(apart, 'bow clear of every slot').toBe(true);
      }
    }
    for (let i = 0; i < 3; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(13));
    await expectEvenHeap(pileArea(root));
    await userEvent.click(check(root));
    check(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 13, removed: 0, bundles: 1 },
    });
  },
};

/** The jar (Lantern Grove fireflies) with a running count. */
export const Jar: Story = {
  args: { config: jar },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectArtHolds(root, stage(canvasElement));
    for (let i = 0; i < 4; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    for (const el of allItems(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(heap(root));
    await expectTargetGaps(inside(root));
    await expectEvenHeap(pileArea(root));
    // Every firefly's silhouette reaches 3:1 against the sand heap (06 §7: icons ≥ 3:1): its felt
    // body (the last piece) holds it by its colour.
    const pieces = heap(root)[0]?.querySelectorAll('[data-felt-piece] > path:first-child') ?? [];
    const body = pieces[pieces.length - 1] as SVGElement;
    const sand = getComputedStyle(pileArea(root)).backgroundColor;
    await expect(contrast(getComputedStyle(body).fill, sand)).toBeGreaterThanOrEqual(3);
  },
};

/** The open shell, K. */
export const ShellK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shell },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectArtHolds(root, stage(canvasElement));
    await expect(within(root).getByRole('button', { name: 'Shell' })).toBeVisible();
    for (const el of heap(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(heap(root));
    await expectEvenHeap(pileArea(root));
    // The ten-frame sits inside the shell: all four of its corners are inside the outline, and
    // the ribs stop above it.
    const outline = root.querySelector('.ni-mset__outline') as SVGPathElement;
    const art = (root.querySelector('.ni-mset__art') as SVGSVGElement).getBoundingClientRect();
    const frame = (root.querySelector('.ni-mset__frame') as HTMLElement).getBoundingClientRect();
    for (const [x, y] of [
      [frame.left, frame.top],
      [frame.right, frame.top],
      [frame.left, frame.bottom],
      [frame.right, frame.bottom],
    ] as const) {
      await expect(outline.isPointInFill(new DOMPoint(x - art.left, y - art.top))).toBe(true);
    }
    for (const rib of root.querySelectorAll('.ni-mset__rib')) {
      await expect(rib.getBoundingClientRect().bottom).toBeLessThan(frame.top - 8);
    }
  },
};

/** `disabled`: nothing moves and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(heap(root)[0] as HTMLElement);
    await userEvent.click(containerPad(root));
    await expect(inside(root)).toHaveLength(0);
    await expect(check(root)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
    // Input off: no drop affordance on the container or the pile, even after a tap on them.
    for (const target of root.querySelectorAll('.ni-drop-target')) {
      await expect(getComputedStyle(target).outlineStyle, 'no drop ring when disabled').toBe(
        'none',
      );
    }
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/**
 * A zero item (03 §5.5 `count.set` mode zero): five shells wait beside the basket, so leaving it
 * empty is a choice; the running count shows the basket's 0, as in the other states.
 */
const zeroSet: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 0,
  mode: 'make',
  source: { sprite: 'shell', supply: 5 },
  container: 'basket',
  capacity: 10,
  showRunningCount: true,
};

/**
 * The untouched container is the answer (target 0): the shells are there to take, the count
 * reads 0, and Check is enabled and answers the model's response for the initial state, exactly
 * once (a double tap is debounced). Nothing is sent before the tap, and no move is made.
 */
export const EmptyIsTheAnswer: Story = {
  args: { config: zeroSet },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Zero is a visible choice: a full heap beside the empty basket, and the count at 0.
    await expect(heap(root)).toHaveLength(5);
    for (const el of heap(root)) await expect(el).toBeVisible();
    await expectEvenHeap(pileArea(root));
    await expect(inside(root)).toHaveLength(0);
    await expect(within(root).getByRole('button', { name: 'Your answer: 0' })).toBeVisible();
    await expect(check(root)).toBeEnabled();
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.dblClick(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 0, removed: 0 },
    });
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(inside(root)).toHaveLength(0);
  },
};

/** No invite cue anywhere: no ring and no pointer. */
async function expectNoCue(root: HTMLElement) {
  await expect(root.querySelector('.ni-invite')).toBeNull();
  await expect(root.querySelector('.ni-hand')).toBeNull();
}

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), the CNT.02.t2 solution as a worked example (the guide acts, input is off): the guide
 * drags fish onto the raft, counts them aloud, takes one off, and closes (a sail goes up). While
 * the widget is disabled an invite shows no cue: the guide never points at something the child can't
 * use. `DemoInvite` is the child's turn.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'drag', args: { count: 3 } });
    await expect(inside(root)).toHaveLength(3);
    await demoController.play({ op: 'count-aloud' });
    await demoController.play({ op: 'remove', args: { count: 1 } });
    await expect(inside(root)).toHaveLength(2);
    await demoController.play({ op: 'bundle' });
    await demoController.play({ op: 'close-container' });
    await expect(root.querySelector('.ni-mset__art[data-closed="true"]')).not.toBeNull();
    await expect(demoController.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    for (const op of ['drag', 'remove', 'count-aloud', 'close-container'] as const) {
      demoController.invite({ op, args: { count: 1 } });
      await new Promise((r) => setTimeout(r, 50));
      await expectNoCue(root);
    }
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo, the child's turn (03 §6.3): the guide has put two fish on the raft and input is back on. Each
 * invite puts the ring AND the guide's hand on the one enabled thing to act on, clear of its neighbours.
 * The story ends inviting a drag: one fish in the heap (the last, in the bottom row, so the hand
 * below it covers nothing), never the whole raft.
 */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { disabled: false, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.play({ op: 'drag', args: { count: 2 } });
    await expect(inside(root)).toHaveLength(2);

    // Remove: the last fish on the raft.
    inviteController.invite({ op: 'remove', args: { count: 1 } });
    await waitFor(() => expect(inside(root).at(-1)?.classList.contains('ni-invite')).toBe(true));
    const last = inside(root).at(-1) as HTMLElement;
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(last).not.toHaveAttribute('aria-disabled');
    await expectPointerOn(pointerIn(last), last, root);
    await expectRingClear(last, allItems(root));

    // Counting: the ring hugs the ten-frame, clear of the heap; the hand points at it.
    inviteController.invite({ op: 'count-aloud' });
    await waitFor(() => expect(root.querySelector('.ni-mset__frames.ni-invite')).not.toBeNull());
    const frames = root.querySelector('.ni-mset__frames') as HTMLElement;
    await expectPointerOn(pointerIn(frames), frames, root);
    await expectRingClear(frames, [...heap(root), check(root)]);

    // Check: enabled (as it always is while input is on), ring and hand on it.
    inviteController.invite({ op: 'close-container' });
    await waitFor(() => expect(check(root).classList.contains('ni-invite')).toBe(true));
    await expect(check(root)).toBeEnabled();
    await expectPointerOn(pointerIn(check(root).parentElement as HTMLElement), check(root), root);

    // Last, and left on screen: drag one fish.
    inviteController.invite({ op: 'drag', args: { count: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-mset__item.ni-invite')).not.toBeNull());
    const fish = root.querySelector('.ni-mset__item.ni-invite') as HTMLElement;
    await expect(fish).toBe(heap(root).at(-1));
    // An enabled, interactive draggable.
    await expect(fish).toHaveAttribute('role', 'button');
    await expect(fish).not.toHaveAttribute('aria-disabled');
    await expect(fish.tabIndex).toBe(0);
    await expect(fish.classList.contains('ni-draggable')).toBe(true);
    await expect(root.querySelector('.ni-mset__container.ni-invite')).toBeNull();
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    await expectPointerOn(pointerIn(fish), fish, root);
    await expectRingClear(fish, allItems(root));
    await expectEvenHeap(pileArea(root));
    // The crate keeps room under its objects for the hand: at the bottom of its tap bob (8 px)
    // the hand stays ≥ 12 px above the crate's rim (3 px border, 11 px rim).
    const crate = pileArea(root);
    await expect(crate).toHaveAttribute('data-hand-room', 'true');
    const handEl = pointerIn(fish);
    for (const a of handEl.getAnimations()) {
      a.pause();
      a.currentTime = 0;
    }
    const rim = crate.getBoundingClientRect().bottom - 3 - 11;
    await expect(
      rim - (handEl.getBoundingClientRect().bottom + 8),
      'hand above the rim',
    ).toBeGreaterThanOrEqual(12);
    for (const a of handEl.getAnimations()) a.play();
    // It stays: nothing clears the invite until the child acts.
    await new Promise((r) => setTimeout(r, 600));
    await expect(fish.classList.contains('ni-invite')).toBe(true);
    await expect(pointerIn(fish)).not.toBeNull();
  },
};

const untouchedInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo, the child's turn on an untouched container: Check is enabled before any move, so inviting
 * it (`close-container`, or `answer` with the value already there) puts the ring and the guide's hand on
 * it.
 */
export const DemoInviteCheckUntouched: Story = {
  args: { config: zeroSet, disabled: false, demo: untouchedInvite },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const action of [
      { op: 'close-container' },
      { op: 'answer', args: { value: 0 } },
    ] as const) {
      untouchedInvite.invite(null);
      await waitFor(() => expect(root.querySelector('.ni-invite')).toBeNull());
      untouchedInvite.invite(action);
      await waitFor(() => expect(check(root).classList.contains('ni-invite')).toBe(true));
      await expect(check(root)).toBeEnabled();
      await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
      await expectPointerOn(pointerIn(check(root).parentElement as HTMLElement), check(root), root);
    }
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

const handsDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo, hands (CPS.01.t2 solution) as a worked example: the guide raises one finger on each hand.
 * Input is off, so an invite shows no cue (every finger button is disabled).
 */
export const DemoHands: Story = {
  args: { config: { ...hands, target: 2 }, disabled: true, demo: handsDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await handsDemo.play({ op: 'drag', args: { count: 1, hand: 0 } });
    await handsDemo.play({ op: 'drag', args: { count: 1, hand: 1 } });
    await expect(within(root).getByRole('button', { name: 'Right hand: 1' })).toBeVisible();
    await handsDemo.play({ op: 'count-aloud' });
    handsDemo.invite({ op: 'drag', args: { count: 1, hand: 1 } });
    await new Promise((r) => setTimeout(r, 50));
    await expectNoCue(root);
    // The panel is centred, and the check has room around it.
    const box = root.getBoundingClientRect();
    const handsBox = (root.querySelector('.ni-mset__hands') as HTMLElement).getBoundingClientRect();
    await expect(
      Math.abs(handsBox.left - box.left - (box.right - handsBox.right)),
    ).toBeLessThanOrEqual(2);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    const ok = check(root).getBoundingClientRect();
    await expect(Math.min(ok.left - box.left, box.right - ok.right)).toBeGreaterThanOrEqual(24);
    // The fingers the guide raised stay raised.
    await new Promise((r) => setTimeout(r, 300));
    await expect(root.querySelectorAll('[data-raised="true"]')).toHaveLength(2);
  },
};

const handsInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo, hands, the child's turn: the guide opens the left hand (5) and raises one on the right; input
 * is back on. Inviting the full left hand's "finger up" (disabled) shows no cue; the story ends
 * inviting the right hand's ENABLED "Finger up", ring and hand on it, clear of "Finger down" and
 * the hand card.
 */
export const DemoInviteHands: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...hands, target: 7 }, disabled: false, demo: handsInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await handsInvite.play({ op: 'drag', args: { count: 5, hand: 0 } });
    await handsInvite.play({ op: 'drag', args: { count: 1, hand: 1 } });
    const ups = within(root).getAllByRole('button', { name: 'Finger up' });
    await expect(ups[0]).toBeDisabled();
    handsInvite.invite({ op: 'drag', args: { count: 1, hand: 0 } });
    await new Promise((r) => setTimeout(r, 50));
    await expectNoCue(root);

    handsInvite.invite({ op: 'drag', args: { count: 1, hand: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-mset__ctl.ni-invite')).not.toBeNull());
    const ringed = root.querySelector('.ni-mset__ctl.ni-invite') as HTMLElement;
    await expect(ringed.contains(ups[1] as HTMLElement)).toBe(true);
    await expect(ups[1]).toBeEnabled();
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    await expectPointerOn(pointerIn(ringed), ups[1] as HTMLElement, root);
    await expectRingClear(ringed, [...root.querySelectorAll('button')]);
    await new Promise((r) => setTimeout(r, 600));
    await expect(ringed.classList.contains('ni-invite')).toBe(true);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: drags are instant (no flight), and the generic `answer` op sets the count. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'drag', args: { count: 9 } });
    await expect(inside(root)).toHaveLength(9);
    await reducedController.play({ op: 'answer', args: { value: 5 } });
    await expect(inside(root)).toHaveLength(5);
    await expect(performance.now() - started).toBeLessThan(1500);
    await expect(root.querySelector('.ni-mset__flight')).toBeNull();
  },
};

const answerBundles: WidgetDemo = createDemoController({ strict: true });

/**
 * The generic `answer {value}` takes its end state from the engine model: with groupsOf 10 the
 * model bundles every full ten, so the demo fills 13 and ties the ten.
 */
export const DemoAnswerBundles: Story = {
  globals: { motion: 'reduced' },
  args: { config: bundleTen, disabled: true, demo: answerBundles },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await answerBundles.play({ op: 'answer', args: { value: 13 } });
    await expect(inside(root)).toHaveLength(13);
    await expectKnotOffBorder(root);
    // The 3 sticks left over are in the supply crate, dimmed while the guide shows, under its tag.
    await expect(heap(root)).toHaveLength(3);
    for (const el of heap(root)) {
      await expect(Number(getComputedStyle(el).opacity)).toBeLessThan(0.6);
    }
    const crate = pileArea(root);
    await expect(crate).toHaveAttribute('data-kind', 'supply');
    const tag = crate.querySelector('.ni-mset__supply-icon') as HTMLElement;
    await expect(tag).toBeVisible();
    // The tag sits on the crate's rim, inside the crate and above its objects.
    const c = crate.getBoundingClientRect();
    const t = tag.getBoundingClientRect();
    // On the floor: ≥ 3 px inside the crate's 3 px border and 11 px rim.
    await expectInside(t, c, 3 + 11 + 3 - 2, 'the tag on the crate floor');
    for (const el of heap(root)) {
      await expect(t.bottom).toBeLessThanOrEqual(el.getBoundingClientRect().top);
    }
  },
};

/**
 * The distance from `x` (screen px) rightwards to the inner edge of the container art's drawn wall
 * at height `y`, where the art body is one shape (the basket): scanned along its fill, less half
 * its stroke. Null where the body is a group of shapes (the boat), measured by its box instead.
 */
function wallGapAt(root: HTMLElement, x: number, y: number): number | null {
  const body = root.querySelector('.ni-mset__body');
  if (!(body instanceof SVGGeometryElement)) return null;
  const svg = body.ownerSVGElement as SVGSVGElement;
  const s = svg.getBoundingClientRect();
  const stroke = Number.parseFloat(getComputedStyle(body).strokeWidth) || 0;
  const pt = svg.createSVGPoint();
  pt.y = y - s.top;
  let at = x - s.left;
  for (; at < s.width; at += 0.5) {
    pt.x = at;
    if (!body.isPointInFill(pt)) break;
  }
  return at - stroke / 2 - (x - s.left);
}

/**
 * A bundled ten-frame's bow (its knot and loops) sits fully outside the frame, never on its
 * border, and inside the container; the band reaches it across the frame's edge.
 */
async function expectKnotOffBorder(root: HTMLElement) {
  const frame = root.querySelector('.ni-mset__frame[data-bundled="true"]') as HTMLElement;
  await expect(frame).not.toBeNull();
  await waitForSettled(frame.querySelector('.ni-mset__band') as Element);
  const f = frame.getBoundingClientRect();
  const box = (root.querySelector('.ni-mset__container') as Element).getBoundingClientRect();
  const bows = [...frame.querySelectorAll('.ni-mset__bow')];
  await expect(bows).toHaveLength(3);
  const crate = root.querySelector('.ni-mset__pile[data-kind="supply"]')?.getBoundingClientRect();
  for (const bow of bows) {
    // Outlines are 3 px: 1.5 px beyond the shape's box.
    const r = bow.getBoundingClientRect();
    const b = {
      left: r.left - 1.5,
      top: r.top - 1.5,
      right: r.right + 1.5,
      bottom: r.bottom + 1.5,
    };
    await expect(b.left - f.right, 'bow 12 px outside the frame').toBeGreaterThanOrEqual(12 - 0.5);
    await expectInside(b, box, 12, 'bow 12 px inside the container');
    // And ≥ 12 px inside the container's drawn wall at the bow's own height (a basket's wall
    // slants inwards): from the bow's right edge to the wall's inner stroke edge.
    const wall = wallGapAt(root, b.right, (b.top + b.bottom) / 2);
    if (wall !== null) {
      await expect(wall, 'bow 12 px inside the drawn wall').toBeGreaterThanOrEqual(12 - 0.5);
    }
    if (crate) {
      const gap = Math.max(
        b.left - crate.right,
        crate.left - b.right,
        b.top - crate.bottom,
        crate.top - b.bottom,
      );
      await expect(gap, 'bow 12 px from the crate').toBeGreaterThanOrEqual(12 - 0.5);
    }
  }
}

// ---------- #12: the arrangements that did not fit the Practice Pier ----------

/**
 * SUB.05.t1 (K) in the smallest area: the two hands, their finger buttons and Check under them
 * need 556 px; here the hands are drawn to the height the buttons leave, with Check beside them.
 */
export const HandsKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: hands },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-hands', 'tight'));
    const box = areaBox(canvasElement);
    await expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    const inner = contentBox(box);
    const controls = [...root.querySelectorAll<HTMLElement>('.ni-mset__hand-btn, .ni-btn')];
    await expect(controls).toHaveLength(7);
    for (const el of controls) {
      await expectInside(el.getBoundingClientRect(), inner, 0, el.getAttribute('aria-label') ?? '');
      await expectTargetSize(el, 'k');
    }
    await expectTargetGaps(controls);
    // The same task: seven fingers up, check, the same response.
    const up = [...root.querySelectorAll<HTMLElement>('[data-ctl="up"] .ni-btn')];
    for (let i = 0; i < 5; i++) await userEvent.click(up[0] as HTMLElement);
    for (let i = 0; i < 2; i++) await userEvent.click(up[1] as HTMLElement);
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 7, removed: 0, parts: [5, 2] },
    });
  },
};

/** ADD.20.t2 seed 1 (K): seven shells in the basket, take away until four are left. */
const takeAwayK: ConfigFor<'make-set'> = {
  ...takeAway,
  target: 4,
  start: 7,
  container: 'basket',
};

/**
 * Take-away in K in the smallest area: seven 80 px objects cannot stand in a column beside the
 * basket with Check, so the pile gets a column of its own (`split`), with Check under it.
 */
export const TakeAwayKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: takeAwayK },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-layout', 'split'));
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    for (let i = 0; i < 3; i++) {
      await userEvent.click(inside(root).at(-1) as HTMLElement);
      await userEvent.click(pilePad(root));
      await waitFor(() => expect(heap(root)).toHaveLength(i + 1));
    }
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    for (const el of heap(root)) await expectTargetSize(el, 'k');
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 4, removed: 3, parts: [4, 3] },
    });
  },
};

/** ADD.24.t1 seed 1 (K): eight starfish in the boat, three more in the crate, leave six. */
const takeAwaySupplyK: ConfigFor<'make-set'> = {
  ...takeAway,
  target: 6,
  start: 8,
  source: { sprite: 'starfish', supply: 3 },
};

/**
 * Take-away with a crate in K in the pier's area at 960 × 600 (858 × 366 inside): the crate and
 * Check under the boat, the pile beside them. The pile shows the latest objects taken (here six
 * at once); the ones before come back into view as objects go back, and the response counts all.
 */
export const TakeAwaySupplyKPier: Story = {
  globals: { ageMode: 'k' },
  args: { config: takeAwaySupplyK },
  render: inArea('pierMinK'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-layout', 'split'));
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    const pile = () => [...pileArea(root).querySelectorAll('.ni-mset__item')];
    for (let i = 0; i < 7; i++) {
      await userEvent.click(inside(root).at(-1) as HTMLElement);
      await userEvent.click(pilePad(root));
      await waitFor(() => expect(inside(root)).toHaveLength(7 - i));
    }
    // Seven taken, six in view (two columns of three rows) and "+1" on the pile; nothing scrolls.
    await expect(pile()).toHaveLength(6);
    const more = () => pileArea(root).querySelector('.ni-mset__more');
    await expect(more()).toHaveTextContent('+1');
    await expect(Number.parseFloat(getComputedStyle(more() as Element).fontSize)).toBe(32);
    await expectFitsArea(root, areaBox(canvasElement), 'k');
    // One back into the boat: the seventh comes into view again.
    await userEvent.click(pile()[0] as HTMLElement);
    await userEvent.click(containerPad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(2));
    await expect(pile()).toHaveLength(6);
    await expect(more()).toBeNull();
    await expectCheckTaps(root);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 2, removed: 6, parts: [2, 6] },
    });
  },
};

/** PV.09.t1 seed 1: 37 crabs in a boat of 40, to bundle by tens. */
const forty: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 37,
  mode: 'make',
  start: 37,
  source: { sprite: 'crab', supply: 0 },
  container: 'boat',
  capacity: 40,
  showRunningCount: false,
  groupsOf: 10,
};

/**
 * A boat of 40 on the tablet area: four ten-frames in a column are 624 px tall, so they stand two
 * by two, and the actions go icon-only where their words would not leave the boat its width.
 */
export const FortyTablet: Story = {
  args: { config: forty },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root.querySelectorAll('.ni-mset__frame')).toHaveLength(4));
    const box = areaBox(canvasElement);
    await waitFor(() => expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1));
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    const frames = [...root.querySelectorAll('.ni-mset__frame')].map((f) =>
      f.getBoundingClientRect(),
    );
    // Two rows of two frames, in reading order.
    await expect(Math.abs((frames[0] as DOMRect).top - (frames[1] as DOMRect).top)).toBeLessThan(1);
    await expect((frames[2] as DOMRect).top).toBeGreaterThan((frames[0] as DOMRect).bottom);
    await expect(inside(root)).toHaveLength(37);
    for (const el of inside(root)) await expectTargetSize(el, 'g1-up');
    const inner = contentBox(box);
    for (const el of root.querySelectorAll('.ni-mset__actions .ni-btn')) {
      await expectInside(el.getBoundingClientRect(), inner, 0, 'action');
    }
  },
};
