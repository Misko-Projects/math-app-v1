import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
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
import type { WidgetHostProps } from '../WidgetHost';

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
const pointerIn = (el: Element) => el.querySelector(':scope > .ni-hand') as HTMLElement;

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
    await expect(heap(root)).toHaveLength(12);
    for (const el of heap(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(heap(root));
    // 12 fish, K (3 a row): 3/3/3/3, centred in the heap.
    await expectEvenHeap(pileArea(root));
    await expect(check(root)).toBeDisabled();

    await pointerDrag(heap(root)[0] as HTMLElement, center(containerPad(root)), 'mouse');
    await waitFor(() => expect(inside(root)).toHaveLength(1));
    await pointerDrag(heap(root)[0] as HTMLElement, center(containerPad(root)), 'touch');
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
      await pointerDrag(heap(root)[0] as HTMLElement, center(containerPad(root)), 'touch');
      await waitFor(() => expect(inside(root)).toHaveLength(2 + i));
    }
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 4 }]);
    await expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible();
    for (const el of heap(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(heap(root));
    // Three crabs left, in one centred row in the middle of the heap (not top-left).
    await expectEvenHeap(pileArea(root));
    await userEvent.click(check(root));
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
    await pointerDrag(inside(root)[4] as HTMLElement, center(pilePad(root)), 'mouse');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await pointerDrag(inside(root)[3] as HTMLElement, center(pilePad(root)), 'touch');
    await waitFor(() => expect(heap(root)).toHaveLength(2));
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
    // The bow sits on the frame's edge: once the band has popped in, it overlaps no slot.
    await waitForSettled(root.querySelector('.ni-mset__band') as Element);
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
    for (let i = 0; i < 4; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    for (const el of allItems(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(heap(root));
    await expectTargetGaps(inside(root));
    await expectEvenHeap(pileArea(root));
    // Every firefly's outline reaches 3:1 against the sand heap (06 §7: icons ≥ 3:1).
    const body = heap(root)[0]?.querySelector('ellipse:nth-of-type(4)') as SVGElement;
    const sand = getComputedStyle(pileArea(root)).backgroundColor;
    await expect(contrast(getComputedStyle(body).stroke, sand)).toBeGreaterThanOrEqual(3);
  },
};

/** The open shell, K. */
export const ShellK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shell },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
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
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), the CNT.02.t2 solution: Pip drags fish onto the raft, counts them aloud,
 * takes one off, and closes (a sail goes up). Then the check button is invited.
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

    // Invite a drag: the ring AND Pip's hand are on ONE fish, the last in the heap (bottom row,
    // so the hand below it covers nothing), never on the whole raft.
    demoController.invite({ op: 'drag', args: { count: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-mset__item.ni-invite')).not.toBeNull());
    const fish = root.querySelector('.ni-mset__item.ni-invite') as HTMLElement;
    await expect(fish).toBe(heap(root).at(-1));
    await expect(root.querySelector('.ni-mset__container.ni-invite')).toBeNull();
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    await expectPointerOn(pointerIn(fish), fish, root);
    await expectRingClear(fish, allItems(root));
    await expectEvenHeap(pileArea(root));

    // Invite a remove: the last fish on the raft.
    demoController.invite({ op: 'remove', args: { count: 1 } });
    await waitFor(() => expect(inside(root).at(-1)?.classList.contains('ni-invite')).toBe(true));
    const last = inside(root).at(-1) as HTMLElement;
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expectPointerOn(pointerIn(last), last, root);
    await expectRingClear(last, allItems(root));

    // Invite counting: the ring hugs the ten-frame, clear of the heap; the hand points at it.
    demoController.invite({ op: 'count-aloud' });
    await waitFor(() => expect(root.querySelector('.ni-mset__frames.ni-invite')).not.toBeNull());
    const frames = root.querySelector('.ni-mset__frames') as HTMLElement;
    await expectPointerOn(pointerIn(frames), frames, root);
    await expectRingClear(frames, [...heap(root), check(root)]);

    // Invite the check: ring and hand on the button.
    demoController.invite({ op: 'close-container' });
    await waitFor(() => expect(check(root).classList.contains('ni-invite')).toBe(true));
    await expectPointerOn(pointerIn(check(root).parentElement as HTMLElement), check(root), root);
    demoController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-invite')).toBeNull());
  },
};

const handsDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo, hands (CPS.01.t2 solution): one finger on each hand. */
export const DemoHands: Story = {
  args: { config: { ...hands, target: 2 }, disabled: true, demo: handsDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await handsDemo.play({ op: 'drag', args: { count: 1, hand: 0 } });
    await handsDemo.play({ op: 'drag', args: { count: 1, hand: 1 } });
    await expect(within(root).getByRole('button', { name: 'Right hand: 1' })).toBeVisible();
    await handsDemo.play({ op: 'count-aloud' });
    // Invite a finger up on the right hand: ring and hand on that hand's "Finger up" button (the
    // control the child presses), clear of "Finger down" and the hand card.
    handsDemo.invite({ op: 'drag', args: { count: 1, hand: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-mset__ctl.ni-invite')).not.toBeNull());
    const ringed = root.querySelector('.ni-mset__ctl.ni-invite') as HTMLElement;
    const ups = within(root).getAllByRole('button', { name: 'Finger up' });
    await expect(ringed.contains(ups[1] as HTMLElement)).toBe(true);
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expectPointerOn(pointerIn(ringed), ups[1] as HTMLElement, root);
    await expectRingClear(ringed, [...root.querySelectorAll('button')]);
    // The panel is centred, and the check has room around it.
    const box = root.getBoundingClientRect();
    const handsBox = (root.querySelector('.ni-mset__hands') as HTMLElement).getBoundingClientRect();
    await expect(
      Math.abs(handsBox.left - box.left - (box.right - handsBox.right)),
    ).toBeLessThanOrEqual(2);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    const ok = check(root).getBoundingClientRect();
    await expect(Math.min(ok.left - box.left, box.right - ok.right)).toBeGreaterThanOrEqual(24);
    // The fingers Pip raised stay raised.
    await new Promise((r) => setTimeout(r, 300));
    await expect(root.querySelectorAll('[data-raised="true"]')).toHaveLength(2);
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
