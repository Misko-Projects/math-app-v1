import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import {
  center,
  clearSpies,
  pointerDrag,
  type SpyAudio,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  clickAt,
  enterNumber,
  expectAreaFit,
  expectCountable,
  expectNote,
  expectRing,
  expectTarget,
  extremes,
  goNext,
  inArea,
  namedStory,
  stepButton,
} from '../../test-support/twoStepStory';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `equal-groups` (03 §5.5): containers of sprites. Two steps: build (fill the containers from the
 * supply), then ask (a picture of the containers and the answer control); `read` shows the ask
 * step alone. Every story runs in a workshop's widget area: `landscapeMin` (906 × 373, the
 * smallest) unless its name says tablet (1226 × 493).
 */

type Config = ConfigFor<'equal-groups'>;

const base = { format: 'equal-groups', mode: 'build', sprite: 'shell' } as const;

/** The size is asked: 12 shells in all on 3 rafts (4 on each). */
const size: Config = {
  ...base,
  groups: 3,
  perGroup: 4,
  unknown: 'size',
  container: 'raft',
  maxGroups: 3,
};
/** The number of groups is asked: 12 fish, 3 in each basket (4 baskets, room for 6). */
const groupsAsked: Config = {
  ...base,
  groups: 4,
  perGroup: 3,
  unknown: 'groups',
  container: 'basket',
  sprite: 'fish',
  maxGroups: 6,
};
/** The total is asked: 2 plates of 3 crabs from a bucket. */
const total: Config = {
  ...base,
  groups: 2,
  perGroup: 3,
  unknown: 'total',
  container: 'plate',
  sprite: 'crab',
  maxGroups: 2,
};
/** `read`: 3 nests of 5 pebbles; how many in all? */
const read: Config = {
  ...base,
  mode: 'read',
  groups: 3,
  perGroup: 5,
  unknown: 'total',
  container: 'nest',
  sprite: 'pebble',
  maxGroups: 3,
};
/** Kindergarten `read`: 3 baskets of 2 fish. */
const readK: Config = { ...read, perGroup: 2, container: 'basket', sprite: 'fish' };
/** The bound of a build from a pile: 40 in all (GROUPS_PILE_MAX), 10 in each of 4 nests. */
const bound: Config = {
  ...base,
  groups: 4,
  perGroup: 10,
  unknown: 'size',
  container: 'nest',
  sprite: 'pebble',
  maxGroups: 4,
};
/** The most containers: 6 groups (GROUPS_MAX) of 3 from a pile of 18 (20 at most beside 6). */
const sixGroups: Config = { ...bound, groups: 6, perGroup: 3, maxGroups: 6 };
/** The largest picture: 6 plates of 10 (GROUPS_MAX × GROUP_CAPACITY). */
const largest: Config = {
  ...bound,
  mode: 'read',
  groups: 6,
  maxGroups: 6,
  unknown: 'total',
  container: 'plate',
};
/** A small sharing task whose pile runs out quickly: 6 in all on 2 rafts. */
const small: Config = { ...size, groups: 2, perGroup: 3, maxGroups: 2 };

const meta = {
  title: 'Widgets/Equal groups',
  args: {
    config: size as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { audio: spyAudio() } },
  decorators: [namedStory],
  render: inArea('landscapeMin'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-egw';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const spot = (root: HTMLElement) => q(root, '.ni-egw__spot');
const grab = (root: HTMLElement) => q(root, '[data-place-item="supply"]');
const group = (root: HTMLElement, i: number) => q(root, `[data-place-target="group-${i}"]`);
/** The containers: each is one target (its drop pad, and its box as the take-back handle). */
const cards = (root: HTMLElement) => all(root, '.ni-egw__group[data-group]');
const handle = (root: HTMLElement, i: number) => q(root, `[data-cue="take-${i}"]`);
const hit = (root: HTMLElement, i: number) => q(handle(root, i), '.ni-egw__hit');
const supply = (root: HTMLElement) => q(root, '[data-place-target="supply"]');
const addButton = (root: HTMLElement) => q(root, '[data-add="true"]');
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;

/** What the picture shows: the sprites in each container, and in the supply pile. */
function shown(root: HTMLElement) {
  return {
    groups: cards(root).map((g) => g.querySelectorAll('[data-eg-sprite]').length),
    pile:
      root.querySelectorAll('.ni-egw__pile .ni-egw__sprite').length +
      root.querySelectorAll('.ni-egw__spot[data-kind="pile"] .ni-egw__grab').length,
  };
}
async function expectShown(root: HTMLElement, want: { groups: number[]; pile?: number }) {
  await waitFor(() => {
    const s = shown(root);
    expect(s.groups).toEqual(want.groups);
    if (want.pile !== undefined) expect(s.pile).toBe(want.pile);
  });
}

const state = (value: Record<string, unknown>) => ({ kind: 'state', value });
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);

/** Every sprite is its own cell: no two overlap, none is under 20 px, and all are one size. */
async function expectSpritesApart(root: HTMLElement) {
  const rects = all(root, '.ni-egw__sprite, .ni-egw__grab-sprite').map((el) =>
    el.getBoundingClientRect(),
  );
  const sizes = new Set(rects.map((r) => Math.round(r.width)));
  await expect(sizes.size, `sprite sizes ${[...sizes].join(', ')}`).toBeLessThanOrEqual(1);
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i] as DOMRect;
    await expect(Math.round(a.width), `sprite ${i} cell`).toBeGreaterThanOrEqual(26);
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j] as DOMRect;
      const apart =
        a.right <= b.left + 0.5 ||
        b.right <= a.left + 0.5 ||
        a.bottom <= b.top + 0.5 ||
        b.bottom <= a.top + 0.5;
      await expect(apart, `sprites ${i} and ${j} apart`).toBe(true);
    }
  }
}

/** Every container is one size, and they sit in straight rows (equal groups are drawn equal). */
async function expectContainersEqual(root: HTMLElement) {
  const rects = all(root, '.ni-egw__group').map((el) => el.getBoundingClientRect());
  const sizes = new Set(rects.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`));
  await expect(sizes.size, `container sizes ${[...sizes].join(', ')}`).toBe(1);
}

/** The build step's controls and parts, for `expectAreaFit`. */
const buildFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  const add = addButton(root);
  return {
    ageMode,
    story,
    controls: {
      'take-one spot': [spot(root)],
      ...(cards(root).length > 0 ? { containers: cards(root) } : {}),
      ...(add ? { 'add a container': [add] } : {}),
      next: [stepButton(root, 'next')],
    },
    parts: all(root, '.ni-egw__supply, .ni-egw__top, .ni-egw__handstrip, .ni-egw__ghost'),
  };
};

/** The ask step's controls and parts, for `expectAreaFit`. */
const askFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  const back = stepButton(root, 'back');
  return {
    ageMode,
    story,
    controls: {
      answer: all(root, '.ni-entry button, .ni-stepper button'),
      ...(back ? { back: [back] } : {}),
      check: [stepButton(root, 'check')],
    },
    parts: all(root, '.ni-egw__picture, .ni-entry, .ni-stepper'),
  };
};

/** Puts `n` sprites into container `i`, one tap-to-place at a time. */
async function fill(root: HTMLElement, i: number, n: number) {
  for (let k = 0; k < n; k += 1) {
    await userEvent.click(grab(root));
    await userEvent.click(group(root, i));
  }
}

// ---------- the two steps in the two areas ----------

/** Tablet (1226 × 493): the task line, the pile, three rafts and Next, all in view. */
export const TabletBuild: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [0, 0, 0], pile: 12 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups tablet build'));
    await expectContainersEqual(root);
  },
};

/** The smallest area (906 × 373): the same parts, every control at full size, nothing scrolls. */
export const LandscapeMinBuild: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups 906x373 build'));
    await expectSpritesApart(root);
    await expectContainersEqual(root);
    // The task line says what the task gives (the total), never the answer.
    await expect(q(root, '.ni-egw__task').textContent).toContain('12 in all');
  },
};

/** The ask step in the smallest area: the rafts as a picture, the numeral cards, Back, Check. */
export const LandscapeMinAsk: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const i of [0, 1, 2]) await fill(root, i, 4);
    await expectShown(root, { groups: [4, 4, 4], pile: 0 });
    await goNext(root);
    await expectShown(root, { groups: [4, 4, 4] });
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-groups 906x373 ask'),
      minFill: 0.5,
    });
    await expectSpritesApart(root);
    await expect(stepButton(root, 'check')).toBeDisabled();
    await enterNumber(root, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ groups: [4, 4, 4], value: 4 }));
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** The ask step on the tablet. */
export const TabletAsk: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 2);
    await goNext(root);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-groups tablet ask'),
      minFill: 0.5,
    });
  },
};

// ---------- the three ways to fill ----------

/** Mouse drag: the take-one spot's shell onto the second raft. */
export const DragToGroup: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(grab(root), center(group(root, 1)), 'mouse', 10);
    await expectShown(root, { groups: [0, 1, 0], pile: 11 });
    await expect(steps(args)).toEqual(['drag:supply', 'drop:group-1']);
  },
};

/** Touch drag (a finger on a tablet). */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(grab(root), center(group(root, 2)), 'touch', 10);
    await expectShown(root, { groups: [0, 0, 1], pile: 11 });
    await expect(steps(args)).toEqual(['drag:supply', 'drop:group-2']);
  },
};

/** Tap to place: tap the spot (its name is spoken), then a raft. An empty raft says its name. */
export const TapToPlace: Story = {
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    await userEvent.click(grab(root));
    await expect(said(audio)).toEqual(['ui.sprite.shell']);
    await userEvent.click(group(root, 0));
    await expectShown(root, { groups: [1, 0, 0], pile: 11 });
    clearSpies(audio);
    await userEvent.click(group(root, 2));
    await expect(said(audio)).toEqual(['ui.widget.eg.container.raft']);
    await expectShown(root, { groups: [1, 0, 0], pile: 11 });
    await expect(steps(args)).toEqual(['tap:supply', 'tap:group-0', 'tap:group-2']);
  },
};

/** Keyboard: Enter picks the shell up, the arrows choose a raft, Enter puts it down. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    grab(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(group(root, 0)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await expectShown(root, { groups: [0, 1, 0], pile: 11 });
    await expect(steps(args)).toEqual(['tap:supply', 'tap:group-1']);
  },
};

// ---------- undo: touch the thing where it sits ----------

/**
 * A filled raft is the handle of its last shell (a full target): drag it back to the supply, or
 * tap it and tap the supply, or move it on to another raft.
 */
export const TakeBack: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 2);
    await fill(root, 1, 2);
    await expectShown(root, { groups: [2, 2, 0], pile: 8 });
    await expectTarget(hit(root, 0), 'g1-up', 'the take-back hit area');
    (args.onInteract as ReturnType<typeof fn>).mockClear();
    await pointerDrag(handle(root, 0), center(supply(root)), 'mouse', 10);
    await expectShown(root, { groups: [1, 2, 0], pile: 9 });
    await userEvent.click(handle(root, 1));
    await userEvent.click(supply(root));
    await expectShown(root, { groups: [1, 1, 0], pile: 10 });
    await userEvent.click(handle(root, 1));
    await userEvent.click(group(root, 2));
    await expectShown(root, { groups: [1, 0, 1], pile: 10 });
    await expect(steps(args)).toEqual([
      'drag:sprite-0-1',
      'drop:supply',
      'tap:sprite-1-1',
      'tap:supply',
      'tap:sprite-1-0',
      'tap:group-2',
    ]);
  },
};

/**
 * A held shell goes into the raft that is tapped, wherever on the raft the tap lands: the
 * take-back handle never takes a tap meant for filling (every corner and the middle of a raft
 * that already holds shells).
 */
export const HeldSpriteLandsAnywhereOnTheContainer: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 1, 1);
    let want = 1;
    for (const at of extremes(group(root, 1), 14)) {
      await userEvent.click(grab(root));
      await clickAt(at.x, at.y);
      want += 1;
      await expectShown(root, { groups: [0, want, 0], pile: 12 - want });
    }
  },
};

/** Baskets are added one at a time; touching an empty one takes it away again. */
export const AddAndRemoveGroup: Story = {
  args: { config: groupsAsked },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [], pile: 12 });
    await userEvent.click(addButton(root));
    await userEvent.click(addButton(root));
    await expectShown(root, { groups: [0, 0] });
    await fill(root, 0, 1);
    // The filled basket's sprite is picked up; the empty one is taken away.
    await userEvent.click(group(root, 1));
    await expectShown(root, { groups: [1] });
    await expect(steps(args).slice(-1)).toEqual(['tap:remove-group-1']);
    // By keyboard too: Enter takes one empty basket away, Space another, one for each press.
    await userEvent.click(addButton(root));
    await userEvent.click(addButton(root));
    await expectShown(root, { groups: [1, 0, 0] });
    await expect(group(root, 2)).not.toHaveAttribute('aria-disabled', 'true');
    group(root, 2).focus();
    await userEvent.keyboard('{Enter}');
    await expectShown(root, { groups: [1, 0] });
    group(root, 1).focus();
    await userEvent.keyboard(' ');
    await expectShown(root, { groups: [1] });
    await expect(steps(args).slice(-2)).toEqual(['tap:remove-group-2', 'tap:remove-group-1']);
    // The last basket: the add button is gone, the note says why, the ring shows what is next.
    for (let i = 0; i < 5; i += 1) await userEvent.click(addButton(root));
    await expectShown(root, { groups: [1, 0, 0, 0, 0, 0] });
    await expect(addButton(root)).toBeNull();
    await expectNote(root, 'You can not add more');
    await expect(said(audio)).toContain('ui.widget.eg.note.most');
    await expectRing(root, spot(root));
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups six baskets'));
  },
};

// ---------- limits: said, shown, and one ring on what to do next ----------

/** A full plate takes no more: the note says so and the plate (take one back) is ringed. */
export const FullContainerNote: Story = {
  args: { config: total },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 10);
    await expectShown(root, { groups: [10, 0] });
    await expectNote(root, null);
    clearSpies(audio);
    await userEvent.click(grab(root));
    await userEvent.click(group(root, 0));
    await expectShown(root, { groups: [10, 0] });
    await expectNote(root, 'This one is full');
    await expect(said(audio)).toContain('ui.widget.eg.note.full');
    await expectRing(root, cards(root)[0] as HTMLElement);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups full container'));
    await expectSpritesApart(root);
  },
};

/** The child's next step (picking the ringed plate's crab up) clears the note and the ring. */
export const NoteClearsOnTheNextStep: Story = {
  args: { config: total },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 11);
    await expectNote(root, 'This one is full');
    await userEvent.click(handle(root, 0));
    await expectNote(root, null);
    await expectRing(root, null);
  },
};

/** Ten in a raft may be the answer (20 in all on 2 rafts): the note stands alone, no ring. */
export const FullAtAPossibleAnswerHasNoRing: Story = {
  args: { config: { ...size, groups: 2, perGroup: 10, maxGroups: 2 } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 11);
    await expectShown(root, { groups: [10, 0], pile: 10 });
    await expectNote(root, 'This one is full');
    await expectRing(root, null);
  },
};

/** The size is given (3 in each basket): the ring goes to a basket with a wrong count. */
export const EmptySupplyRingsAWrongGroup: Story = {
  args: { config: { ...groupsAsked, groups: 2, perGroup: 3, maxGroups: 4 } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 3; i += 1) await userEvent.click(addButton(root));
    await fill(root, 0, 3);
    await fill(root, 1, 2);
    await fill(root, 2, 1);
    await expectShown(root, { groups: [3, 2, 1], pile: 0 });
    await expectNote(root, 'There are no more');
    // Basket 0 holds the right 3: the ring is on the one with the fewest, never on it.
    await expectRing(root, cards(root)[2] as HTMLElement);
  },
};

/** The last shell leaves the pile: the note says there are no more; equal groups ring Next. */
export const EmptySupplyNote: Story = {
  args: { config: small },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 3);
    await fill(root, 1, 2);
    clearSpies(audio);
    await fill(root, 1, 1);
    await expectShown(root, { groups: [3, 3], pile: 0 });
    await expectNote(root, 'There are no more');
    await expect(said(audio)).toContain('ui.widget.eg.note.empty');
    await expectRing(root, stepButton(root, 'next'));
  },
};

/** An empty pile with unequal groups rings the raft that holds the most, never Next. */
export const EmptySupplyUnequal: Story = {
  args: { config: small },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 4);
    await fill(root, 1, 2);
    await expectShown(root, { groups: [4, 2], pile: 0 });
    await expectNote(root, 'There are no more');
    await expectRing(root, cards(root)[0] as HTMLElement);
    // Touching the empty supply says it again.
    await userEvent.click(handle(root, 0));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(supply(root));
    await expectNote(root, 'There are no more');
  },
};

/**
 * A drag that starts at the very edge of the take-back target still lands where the finger lets
 * go: the target is no wider than a full target, so the crab stays within reach of the drop.
 */
export const DragFromTheEdgeOfTheHandle: Story = {
  args: { config: total },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fill(root, 0, 1);
    const area = hit(root, 0).getBoundingClientRect();
    await expect(Math.round(area.width)).toBe(64);
    const from = { x: area.right - 4, y: area.top + area.height / 2 };
    const to = center(group(root, 1));
    const el = hit(root, 0);
    const init = (x: number, y: number, buttons: number): PointerEventInit => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 78,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
    });
    el.dispatchEvent(new PointerEvent('pointerdown', init(from.x, from.y, 1)));
    for (let k = 1; k <= 10; k += 1) {
      const x = from.x + ((to.x - from.x) * k) / 10;
      const y = from.y + ((to.y - from.y) * k) / 10;
      window.dispatchEvent(new PointerEvent('pointermove', init(x, y, 1)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.dispatchEvent(new PointerEvent('pointerup', init(to.x, to.y, 0)));
    await expectShown(root, { groups: [0, 1] });
  },
};

// ---------- the other unknowns ----------

/** The total is asked: fill two plates from the bucket, then type how many in all. */
export const BucketTotal: Story = {
  args: { config: total },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(q(root, '.ni-egw__task').textContent).toContain('3 on each plate');
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups bucket'));
    await fill(root, 0, 3);
    await fill(root, 1, 3);
    await goNext(root);
    await enterNumber(root, 6);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ groups: [3, 3], value: 6 }));
  },
};

/** The number of groups is asked: add baskets, put 3 in each, then say how many baskets. */
export const GroupsAsked: Story = {
  args: { config: groupsAsked },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups add baskets'));
    for (let i = 0; i < 4; i += 1) {
      await userEvent.click(addButton(root));
      await fill(root, i, 3);
    }
    await expectShown(root, { groups: [3, 3, 3, 3], pile: 0 });
    await goNext(root);
    await enterNumber(root, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ groups: [3, 3, 3, 3], value: 4 }));
  },
};

/** `read`: the nests are a picture; type the total and check. A tap names what is under it. */
export const ReadTotal: Story = {
  args: { config: read, tier: 'pictorial' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expectShown(root, { groups: [5, 5, 5] });
    // The picture says every count a sighted child can see (a screen reader's way to the answer).
    await expect(q(root, '.ni-egw__picture')).toHaveAttribute(
      'aria-label',
      'Look at the picture. Nest 1 has 5. Nest 2 has 5. Nest 3 has 5',
    );
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-groups read'),
      minFill: 0.5,
    });
    await expectSpritesApart(root);
    await expectContainersEqual(root);
    clearSpies(audio);
    await userEvent.click(q(root, '[data-eg-sprite="sprite-1-0"]'));
    await expect(said(audio)).toEqual(['ui.sprite.pebble']);
    await enterNumber(root, 15);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 15 });
  },
};

// ---------- kindergarten mode ----------

/** Kindergarten: 2 plates of 3 crabs from a bucket; 80 px targets in the smallest area. */
export const KindergartenBuild: Story = {
  globals: { ageMode: 'k' },
  args: { config: total },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, buildFit(root, 'k', 'equal-groups K 906x373 build'));
    await fill(root, 0, 1);
    await expectTarget(hit(root, 0), 'k', 'the take-back hit area');
  },
};

/** Kindergarten `read`: 3 baskets of 2 fish, and an answer control with 80 px targets. */
export const KindergartenRead: Story = {
  globals: { ageMode: 'k' },
  args: { config: readK, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [2, 2, 2] });
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'k', 'equal-groups K 906x373 read'),
      minFill: 0.5,
    });
    await enterNumber(root, 6);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
  },
};

// ---------- stress: the bound, in the smallest area ----------

/** The pile at its largest: 40 in the supply (the model's bound), nothing placed yet. */
export const StressPileAtMaximum: Story = {
  args: { config: bound },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [0, 0, 0, 0], pile: 40 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups pile of 40'));
    await expectSpritesApart(root);
    await expectCountable(root);
  },
};

/** The same pile with other things: all can be counted. */
const pileOf = (sprite: Config['sprite']): Story => ({
  args: { config: { ...bound, sprite } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [0, 0, 0, 0], pile: 40 });
    await expectCountable(root);
  },
});
export const StressPileOfShells: Story = pileOf('shell');
export const StressPileOfFish: Story = pileOf('fish');
export const StressPileOfCrabs: Story = pileOf('crab');
export const StressPileOfStarfish: Story = pileOf('starfish');
export const StressPileOfCounters: Story = pileOf('counter');

const demoBound: WidgetDemo = createDemoController({ strict: true });
/** 4 nests of 10 from a pile of 40 (the model's bound): everything fits, sprites apart. */
export const StressAtBoundBuild: Story = {
  globals: { motion: 'reduced' },
  args: { config: bound, demo: demoBound },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [0, 0, 0, 0], pile: 40 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups 4 x 10 build'));
    await expectSpritesApart(root);
    for (let i = 0; i < 4; i += 1) {
      await demoBound.play({ op: 'fill-group', args: { index: i, count: 10 } });
    }
    await expectShown(root, { groups: [10, 10, 10, 10], pile: 0 });
    await expectSpritesApart(root);
    await expectCountable(root);
    await expectContainersEqual(root);
    await expectTarget(hit(root, 3), 'g1-up', 'the take-back hit area');
  },
};

/** The most containers a build has: 6 nests and a pile of 18, in the smallest area. */
export const StressSixGroupsBuild: Story = {
  args: { config: sixGroups },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [0, 0, 0, 0, 0, 0], pile: 18 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups 6 x 3 build'));
    await expectSpritesApart(root);
    await expectCountable(root);
    await expectContainersEqual(root);
  },
};

/** The bucket has no pile to draw: 6 plates of up to 10 fit beside it. */
export const StressSixGroupsBucket: Story = {
  args: { config: { ...sixGroups, perGroup: 10, unknown: 'total', container: 'plate' } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups 6 x 10 bucket'));
  },
};

/** The bound as a picture to read: 6 plates of 10 beside the number pad. */
export const StressAtBoundRead: Story = {
  args: { config: largest, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { groups: [10, 10, 10, 10, 10, 10] });
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-groups 6 x 10 read'),
      minFill: 0.5,
    });
    await expectSpritesApart(root);
    await expectCountable(root);
    await expectContainersEqual(root);
    await enterNumber(root, 60);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 60 });
  },
};

// ---------- disabled, demo ----------

/** Disabled: nothing moves and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(stepButton(root, 'next')).toBeDisabled();
    await userEvent.click(grab(root));
    await userEvent.click(group(root, 0));
    await pointerDrag(grab(root), center(group(root, 1)), 'mouse');
    await expectShown(root, { groups: [0, 0, 0], pile: 12 });
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoPlay: WidgetDemo = createDemoController({ strict: true });
/** Demo play: the guide adds baskets, fills them, counts by threes and enters the answer. */
export const DemoPlay: Story = {
  globals: { motion: 'reduced' },
  args: { config: { ...groupsAsked, groups: 2, maxGroups: 3 }, demo: demoPlay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoPlay.play({ op: 'add-group' });
    await demoPlay.play({ op: 'add-group' });
    await demoPlay.play({ op: 'fill-group', args: { index: 0, count: 3 } });
    await demoPlay.play({ op: 'fill-group', args: { index: 1, count: 3 } });
    await expectShown(root, { groups: [3, 3], pile: 0 });
    const counting = demoPlay.play({ op: 'skip-count' });
    await waitFor(() => expect(all(root, '.ni-egw__skip').length).toBeGreaterThan(0));
    for (const el of all(root, '.ni-egw__skip')) {
      await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await counting;
    await demoPlay.play({ op: 'circle-group', args: { index: 1 } });
    await expect(root.querySelectorAll('.ni-egw__lasso')).toHaveLength(1);
    await demoPlay.play({ op: 'answer', args: { value: 2 } });
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ groups: [3, 3], value: 2 }));
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/**
 * Demo invite in the smallest area: one ring, on the take-one spot, with the demonstration hand
 * on it; the whole task stays in view.
 */
export const DemoInviteLandscapeMin: Story = {
  args: { demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({ op: 'fill-group', args: { index: 0, count: 1 } });
    await expectRing(root, spot(root));
    await waitFor(() => expect(hand()).not.toBeNull());
    await expectPointerOn(hand(), spot(root), root);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-groups invite'));
  },
};

const demoInvites: WidgetDemo = createDemoController({ strict: true });
/** Each invite rings exactly one control: the add button, a filled basket, Next, the answer. */
export const DemoInviteEachControl: Story = {
  args: { config: groupsAsked, demo: demoInvites },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInvites.invite({ op: 'add-group' });
    await expectRing(root, addButton(root));
    await userEvent.click(addButton(root));
    await expectRing(root, null);
    await fill(root, 0, 2);
    // Taking one out is invited on the basket itself (its take-back handle).
    demoInvites.invite({ op: 'fill-group', args: { index: 0, count: 1 } });
    await expectRing(root, cards(root)[0] as HTMLElement);
    demoInvites.invite({ op: 'answer', args: { value: 4 } });
    await expectRing(root, stepButton(root, 'next'));
    await goNext(root);
    demoInvites.invite({ op: 'answer', args: { value: 4 } });
    await waitFor(() => expect(root.querySelectorAll('.ni-invite')).toHaveLength(1));
    await expect(root.querySelector('.ni-entry .ni-invite, .ni-stepper .ni-invite')).not.toBeNull();
    await enterNumber(root, 4);
    await expectRing(root, null);
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });
/** An op equal-groups doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'deal-round' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const demoMotion: WidgetDemo = createDemoController({ strict: true });
/** With motion on, a filled sprite flies in from the take-one spot and lands in its cell. */
export const DemoFillFlies: Story = {
  args: { demo: demoMotion },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoMotion.play({ op: 'fill-group', args: { index: 2, count: 2 } });
    await expectShown(root, { groups: [0, 0, 2], pile: 10 });
    await demoMotion.play({ op: 'fill-group', args: { index: 2, count: 1 } });
    await expectShown(root, { groups: [0, 0, 1], pile: 11 });
  },
};
