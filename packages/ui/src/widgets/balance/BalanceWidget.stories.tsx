import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { type SpyAudio, spyAudio } from '../../test-support/storyHelpers';
import {
  areaBox,
  enterNumber,
  expectAreaFit,
  expectCountable,
  expectRing,
  inArea,
  namedStory,
  stepButton,
} from '../../test-support/twoStepStory';
import {
  expectNoScroll,
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `balance` (03 §5.5): a pan balance with one side of an equation in each pan, and the answer
 * beside or under it. Every story runs in a workshop's widget area: `landscapeMin` (906 × 373,
 * the smallest) unless its name says tablet (1226 × 493). The configs are the shapes the shipped
 * templates build (ADD.05, ADD.10, ADD.11, ALG.05, CMP.08, MEA.16) and the bounds of the model.
 */

type Config = ConfigFor<'balance'>;

/** ADD.10.t3: is 8 + 4 the same as 7 + 5? */
const judge: Config = {
  format: 'balance',
  left: { terms: [{ n: 8 }, { op: '+' }, { n: 4 }] },
  right: { terms: [{ n: 7 }, { op: '+' }, { n: 5 }] },
  mode: 'judge',
  showTilt: false,
};
/** ALG.05.t3 (kindergarten): 7 crabs and 2 crabs. */
const judgeCrabs: Config = {
  format: 'balance',
  left: { terms: [{ object: 'crab', count: 7 }] },
  right: { terms: [{ object: 'crab', count: 2 }] },
  mode: 'judge',
  objectWeights: { crab: 1 },
  showTilt: false,
};
/** MEA.16.t1 (kindergarten): a pumpkin against a leaf. */
const weigh: Config = {
  format: 'balance',
  left: { terms: [{ object: 'pumpkin', count: 1 }] },
  right: { terms: [{ object: 'leaf', count: 1 }] },
  mode: 'which-heavier',
  objectWeights: { pumpkin: 9, leaf: 2 },
  showTilt: true,
};
/** ADD.05.t2: 7 + 1 shells is the same as 1 + how many? */
const fillShells: Config = {
  format: 'balance',
  left: { terms: [{ object: 'shell', count: 7 }, { op: '+' }, { object: 'shell', count: 1 }] },
  right: { terms: [{ object: 'shell', count: 1 }, { op: '+' }, { blank: 'x' }] },
  mode: 'fill-blank',
  objectWeights: { shell: 1 },
  showTilt: false,
};
/** ADD.11.t1: 9 + 9 = box + 3. */
const fillNumbers: Config = {
  format: 'balance',
  left: { terms: [{ n: 9 }, { op: '+' }, { n: 9 }] },
  right: { terms: [{ blank: 'x' }, { op: '+' }, { n: 3 }] },
  mode: 'fill-blank',
  showTilt: false,
};
/** ADD.10.t1: 3 + 1 shells against 2. */
const makeShells: Config = {
  format: 'balance',
  left: { terms: [{ object: 'shell', count: 3 }, { op: '+' }, { object: 'shell', count: 1 }] },
  right: { terms: [{ object: 'shell', count: 2 }] },
  mode: 'make-equal',
  objectWeights: { shell: 1 },
  showTilt: true,
};
/** CMP.08.t1: 15 against 4, with unit blocks. */
const makeBlocks: Config = {
  format: 'balance',
  left: { terms: [{ n: 15 }] },
  right: { terms: [{ n: 4 }] },
  mode: 'make-equal',
  showTilt: true,
};
/** ALG.05.t1 (kindergarten): 7 fish against 5. */
const makeFish: Config = {
  format: 'balance',
  left: { terms: [{ object: 'fish', count: 7 }] },
  right: { terms: [{ object: 'fish', count: 5 }] },
  mode: 'make-equal',
  objectWeights: { fish: 1 },
  showTilt: true,
};
/** ALG.05.t4 (kindergarten): the beam does not show the comparison. */
const makeBlind: Config = { ...makeFish, showTilt: false };

const meta = {
  title: 'Widgets/Balance',
  args: {
    config: judge as WidgetConfig,
    tier: 'pictorial',
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

const ROOT = '.ni-bal';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const card = (root: HTMLElement, id: string) => q(root, `[data-cue="card-${id}"] button`);
const cards = (root: HTMLElement) => all(root, '.ni-bal__card button');
const add = (root: HTMLElement, side: 'left' | 'right') =>
  q(root, `[data-cue="add-${side}"] button`);
const take = (root: HTMLElement, side: 'left' | 'right') =>
  q(root, `[data-cue="take-${side}"] button`);
const panButtons = (root: HTMLElement) => all(root, '.ni-bal__buttons button');
const scale = (root: HTMLElement) => q(root, '.ni-bal__scale');
const beam = (root: HTMLElement) => scale(root).dataset.beam;
const added = (root: HTMLElement, side: 'left' | 'right') =>
  all(root, `[data-zone="${side}"] .ni-bal__item`).length;
const status = (root: HTMLElement) => q(root, '[role="status"]').textContent ?? '';
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
const state = (value: Record<string, unknown>) => ({ kind: 'state', value });

/** The controls and parts of a layout, for `expectAreaFit`. */
const fit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  const entry = all(root, '.ni-entry button, .ni-stepper button');
  return {
    ageMode,
    story,
    controls: {
      ...(cards(root).length > 0 ? { cards: cards(root) } : {}),
      ...(panButtons(root).length > 0 ? { 'pan buttons': panButtons(root) } : {}),
      ...(entry.length > 0 ? { answer: entry } : {}),
      check: [stepButton(root, 'check')],
    },
    parts: all(root, '.ni-bal__scale, .ni-entry, .ni-stepper'),
    minFill: 0.5,
  };
};

/** Numerals on the pans are at least 32 px. */
async function expectTilesReadable(root: HTMLElement) {
  for (const el of all(root, '.ni-bal__tile, .ni-bal__op')) {
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    await expect(size, `"${el.textContent}"`).toBeGreaterThanOrEqual(32);
  }
}

// ---------- judge ----------

/** Numbers on both pans in the smallest area; "the same" answers `true`. */
export const JudgeNumbers: Story = {
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance judge 906x373'));
    await expectTilesReadable(root);
    // The beam is not weighing: it rests on its props, and says nothing.
    await expect(beam(root)).toBe('held');
    await expect(all(root, '.ni-bal__prop')).toHaveLength(2);
    await expect(status(root)).toBe('');
    await expect(stepButton(root, 'check')).toBeDisabled();
    await userEvent.click(card(root, 'true'));
    await expect(card(root, 'true')).toHaveAttribute('aria-pressed', 'true');
    await expect(said(audioOf(parameters))).toContain('ui.compare.same');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'true' });
    await expect(steps(args)).toEqual(['tap:card-true']);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** A pick is changed by picking the other card: one card is pressed at a time. */
export const JudgeChangeOfMind: Story = {
  tags: ['!visual'],
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(card(root, 'true'));
    await userEvent.click(card(root, 'false'));
    await expect(card(root, 'true')).toHaveAttribute('aria-pressed', 'false');
    await expect(card(root, 'false')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'false' });
  },
};

/** Keyboard: Tab to a card, Space picks it, Tab to Check, Enter sends. */
export const JudgeKeyboard: Story = {
  tags: ['!visual'],
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    card(root, 'true').focus();
    await userEvent.keyboard(' ');
    await userEvent.tab();
    await expect(card(root, 'false')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    await expect(stepButton(root, 'check')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'false' });
    await expect(steps(args)).toEqual(['tap:card-true', 'tap:card-false']);
  },
};

/** Kindergarten: countable crabs, 80 px cards, the beam held. */
export const JudgeObjectsKindergarten: Story = {
  globals: { ageMode: 'k' },
  args: { config: judgeCrabs },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'k', 'balance K judge 906x373'));
    await expectCountable(scale(root));
    await expect(beam(root)).toBe('held');
    // The pans in words: every count a sighted child can see, and no answer.
    await expect(q(root, '[data-side="left"] [role="img"]')).toHaveAccessibleName(
      'Left side: 7 Crab',
    );
    await userEvent.click(card(root, 'false'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'false' });
  },
};

// ---------- which-heavier ----------

/** Kindergarten: the heavy pan is down, and three cards say which side is heavier. */
export const WhichHeavierKindergarten: Story = {
  globals: { ageMode: 'k' },
  args: { config: weigh, tier: 'concrete' },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'k', 'balance K which-heavier 906x373'));
    await expect(beam(root)).toBe('left');
    await expect(status(root)).toBe('The left side goes down');
    await expect(cards(root)).toHaveLength(3);
    // The low pan sits lower on the screen than the high one.
    const top = (side: string) =>
      q(root, `.ni-bal__pan[data-side="${side}"] .ni-bal__tray`).getBoundingClientRect().top;
    await waitFor(() => expect(top('left')).toBeGreaterThan(top('right') + 10));
    await userEvent.click(card(root, 'left'));
    await expect(said(audioOf(parameters))).toContain('ui.widget.bal.heavier.left');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'left' });
  },
};

/** The same things on the tablet. */
export const WhichHeavierTablet: Story = {
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: weigh, tier: 'concrete' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Two single things on a tablet: drawn as large as a thing is drawn, not stretched to fill.
    await expectAreaFit(canvasElement, {
      ...fit(root, 'k', 'balance K which-heavier tablet'),
      minFill: 0.4,
    });
  },
};

// ---------- fill-blank ----------

/** Shells and a box: the number picked goes into the box on the pan; Check sends it. */
export const FillBlankObjects: Story = {
  args: { config: fillShells, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance fill-blank objects 906x373'));
    await expectCountable(scale(root));
    const box = q(root, '.ni-bal__tile--box');
    await expect(box).toHaveAttribute('data-empty', 'true');
    await expect(stepButton(root, 'check')).toBeDisabled();
    await enterNumber(root, 7);
    await expect(box).toHaveTextContent('7');
    await expect(Number.parseFloat(getComputedStyle(box).fontSize)).toBeGreaterThanOrEqual(32);
    // Filling the box does not tip the beam: this item does not show the comparison.
    await expect(beam(root)).toBe('held');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Numbers and a box; a typed digit is taken back with the pad's own key. */
export const FillBlankNumbers: Story = {
  args: { config: fillNumbers },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance fill-blank numbers 906x373'));
    await expectTilesReadable(root);
    await enterNumber(root, 15);
    await expect(q(root, '.ni-bal__tile--box')).toHaveTextContent('15');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 15 });
  },
};

/** On the tablet. */
export const FillBlankTablet: Story = {
  render: inArea('tablet'),
  args: { config: fillNumbers },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance fill-blank tablet'));
  },
};

// ---------- make-equal ----------

/** Shells: two more on the light pan level the beam; the response is what was added. */
export const MakeEqualObjects: Story = {
  args: { config: makeShells, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance make-equal 906x373'));
    await expectCountable(scale(root));
    await expect(beam(root)).toBe('left');
    // Check is live from the start: nothing added may be the answer of another item.
    await expect(stepButton(root, 'check')).toBeEnabled();
    const before = scale(root).getBoundingClientRect();
    await userEvent.click(add(root, 'right'));
    await expect(beam(root)).toBe('left');
    await userEvent.click(add(root, 'right'));
    await expect(added(root, 'right')).toBe(2);
    await expect(beam(root)).toBe('level');
    await expect(status(root)).toBe('The balance is level');
    // Adding moved and resized nothing.
    const after = scale(root).getBoundingClientRect();
    await expect([after.width, after.height]).toEqual([before.width, before.height]);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ left: 0, right: 2 }));
    await expect(steps(args)).toEqual(['tap:add-right', 'tap:add-right']);
  },
};

/** Take one off where it was put: pointer and keyboard, down to none; then the button says why. */
export const MakeEqualUndo: Story = {
  tags: ['!visual'],
  args: { config: makeShells, tier: 'concrete' },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(take(root, 'right')).toHaveAttribute('data-limit', 'true');
    for (let i = 0; i < 3; i += 1) await userEvent.click(add(root, 'right'));
    await expect(beam(root)).toBe('right');
    await expect(take(root, 'right')).not.toHaveAttribute('data-limit');
    await userEvent.click(take(root, 'right'));
    await expect(added(root, 'right')).toBe(2);
    await expect(beam(root)).toBe('level');
    // Keyboard: the same button, with Enter and Space.
    take(root, 'right').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(added(root, 'right')).toBe(0);
    await expect(take(root, 'right')).toHaveFocus();
    // Nothing left to take off: said, and in the status line.
    await userEvent.keyboard('{Enter}');
    await expect(said(audioOf(parameters))).toContain('ui.widget.bal.note.none');
    await expect(status(root)).toBe('There are no more to take away');
    // The next step clears the note.
    await userEvent.click(add(root, 'left'));
    await expect(status(root)).toBe('The left side goes down');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ left: 1, right: 0 }));
    await expect(steps(args)).toEqual([
      'tap:add-right',
      'tap:add-right',
      'tap:add-right',
      'undo:take-right',
      'undo:take-right',
      'undo:take-right',
      'undo:take-right',
      'tap:add-left',
    ]);
  },
};

/** A pan holds twenty: the add button of a full pan is dashed, and says so when pressed. */
export const MakeEqualFullPan: Story = {
  tags: ['!visual'],
  args: {
    config: {
      ...makeShells,
      left: { terms: [{ object: 'shell', count: 19 }] },
      right: { terms: [{ object: 'shell', count: 20 }] },
    },
    tier: 'concrete',
  },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance make-equal full pans 906x373'));
    await expectCountable(scale(root));
    await expect(add(root, 'right')).toHaveAttribute('data-limit', 'true');
    await userEvent.click(add(root, 'left'));
    await expect(add(root, 'left')).toHaveAttribute('data-limit', 'true');
    await userEvent.click(add(root, 'left'));
    await expect(added(root, 'left')).toBe(1);
    await expect(said(audioOf(parameters))).toContain('ui.widget.bal.note.full');
    await expect(status(root)).toBe('This side is full');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ left: 1, right: 0 }));
  },
};

/** A number and unit blocks: eleven blocks level 15 and 4, counted in fives. */
export const MakeEqualBlocks: Story = {
  args: { config: makeBlocks },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance make-equal blocks 906x373'));
    // The first block stands on its own pan's tray, beside the number, not above the pans.
    await userEvent.click(add(root, 'right'));
    const tray = q(root, '.ni-bal__pan[data-side="right"] .ni-bal__tray').getBoundingClientRect();
    const tile = q(root, '.ni-bal__pan[data-side="right"] .ni-bal__tile').getBoundingClientRect();
    const first = q(root, '[data-zone="right"] .ni-bal__item').getBoundingClientRect();
    await expect(first.left).toBeGreaterThanOrEqual(tray.left);
    await expect(first.right).toBeLessThanOrEqual(tray.right);
    await expect(Math.abs(first.bottom - tile.bottom)).toBeLessThanOrEqual(2);
    await expect(tray.top - first.bottom).toBeLessThanOrEqual(12);
    for (let i = 1; i < 11; i += 1) await userEvent.click(add(root, 'right'));
    // Every block of the eleven is inside that pan's span.
    for (const el of all(root, '[data-zone="right"] .ni-bal__item')) {
      const r = el.getBoundingClientRect();
      await expect(r.left).toBeGreaterThanOrEqual(tray.left);
      await expect(r.right).toBeLessThanOrEqual(tray.right);
    }
    await expect(beam(root)).toBe('level');
    await expectCountable(scale(root));
    await expect(q(root, '[data-side="right"] [role="img"]')).toHaveAccessibleName(
      'Right side: 4, Added: 11 Block',
    );
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ left: 0, right: 11 }));
  },
};

/** Kindergarten: 80 px buttons under each pan, in the smallest area. */
export const MakeEqualKindergarten: Story = {
  globals: { ageMode: 'k' },
  args: { config: makeFish, tier: 'concrete' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'k', 'balance K make-equal 906x373'));
    await expectCountable(scale(root));
  },
};

/** The beam held (ALG.05.t4): adding does not show the comparison. */
export const MakeEqualBeamHeld: Story = {
  globals: { ageMode: 'k' },
  args: { config: makeBlind },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(add(root, 'right'));
    await userEvent.click(add(root, 'right'));
    await expect(beam(root)).toBe('held');
    await expect(status(root)).toBe('');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ left: 0, right: 2 }));
  },
};

/** On the tablet. */
export const MakeEqualTablet: Story = {
  render: inArea('tablet'),
  args: { config: makeShells, tier: 'concrete' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance make-equal tablet'));
  },
};

// ---------- names, no input ----------

/** A touch on a pan names what is under the finger: a number, or the thing. */
export const SpeaksOnTap: Story = {
  tags: ['!visual'],
  args: { config: fillShells, tier: 'concrete' },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    const audio = audioOf(parameters);
    await userEvent.click(q(root, '[data-side="left"] .ni-bal__item'));
    await expect(said(audio)).toContain('ui.sprite.shell');
    await userEvent.click(q(root, '[data-side="left"] .ni-bal__op'));
    await expect(said(audio)).toContain('ui.widget.bal.op.plus');
    await enterNumber(root, 7);
    await userEvent.click(q(root, '.ni-bal__tile--box'));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 7 }]);
    await expect(steps(args)).toContain('tap:pan-left');
  },
};

export const Disabled: Story = {
  tags: ['!visual'],
  args: { config: makeShells, tier: 'concrete', disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(stepButton(root, 'check')).toBeDisabled();
    await expect(add(root, 'right')).toBeDisabled();
    await userEvent.click(q(root, '[data-side="left"] .ni-bal__item'));
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

// ---------- stress: the bounds, in the smallest area ----------

/** Twenty things in two groups on each pan, at kindergarten sizes. */
export const StressFullPansKindergarten: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...judgeCrabs,
      left: { terms: [{ object: 'crab', count: 10 }, { op: '+' }, { object: 'crab', count: 10 }] },
      right: { terms: [{ object: 'crab', count: 9 }, { op: '+' }, { object: 'crab', count: 11 }] },
    },
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'k', 'balance K judge 20 a pan 906x373'));
    await expectCountable(scale(root));
  },
};

/** The largest numbers the model takes, and a three-digit box. */
export const StressLargestNumbers: Story = {
  args: {
    config: {
      ...fillNumbers,
      left: { terms: [{ n: 999 }, { op: '+' }, { n: 999 }] },
      right: { terms: [{ blank: 'x' }, { op: '+' }, { n: 999 }] },
    },
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'balance fill-blank 999 906x373'));
    await expectTilesReadable(root);
    await enterNumber(root, 999);
    await expect(q(root, '.ni-bal__tile--box')).toHaveTextContent('999');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 999 });
  },
};

/** make-equal at its tallest: a pan of two groups that can take eleven more, beside a full one. */
export const StressMakeEqualTallest: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...makeShells,
      left: { terms: [{ object: 'shell', count: 1 }, { op: '+' }, { object: 'shell', count: 8 }] },
      right: {
        terms: [{ object: 'shell', count: 10 }, { op: '+' }, { object: 'shell', count: 10 }],
      },
    },
    tier: 'concrete',
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'k', 'balance K make-equal tallest 906x373'));
    for (let i = 0; i < 11; i += 1) await userEvent.click(add(root, 'left'));
    await expect(beam(root)).toBe('level');
    await expectCountable(scale(root));
  },
};

// ---------- demo ----------

const demoMake: WidgetDemo = createDemoController({ strict: true });
/** Demo play (make-equal): a side is pointed at, two shells go on one by one, the beam levels. */
export const DemoPlayMakeEqual: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { config: makeShells, tier: 'concrete', demo: demoMake },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoMake.play({ op: 'highlight-side', args: { side: 'left' } });
    await expect(q(root, '.ni-bal__pan--lit')).toHaveAttribute('data-side', 'left');
    await demoMake.play({
      op: 'place',
      args: { side: 'right', term: { object: 'shell', count: 1 }, count: 2 },
    });
    await expect(added(root, 'right')).toBe(2);
    await demoMake.play({ op: 'level' });
    await expect(beam(root)).toBe('level');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ left: 0, right: 2 }));
  },
};

const demoJudge: WidgetDemo = createDemoController({ strict: true });
/** Demo play (judge): `tilt` lets the beam show the comparison; the answer card is picked. */
export const DemoPlayJudge: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { demo: demoJudge },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(beam(root)).toBe('held');
    await demoJudge.play({ op: 'tilt' });
    await expect(beam(root)).toBe('level');
    await demoJudge.play({ op: 'answer', args: { id: 'true' } });
    await expect(card(root, 'true')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'true' });
  },
};

const demoFill: WidgetDemo = createDemoController({ strict: true });
/** Demo play (fill-blank): the answer is entered on the answer control and shows in the box. */
export const DemoPlayFillBlank: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { config: fillNumbers, demo: demoFill },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoFill.play({ op: 'highlight-side', args: { side: 'left' } });
    await demoFill.play({ op: 'answer', args: { value: 15 } });
    await expect(q(root, '.ni-bal__tile--box')).toHaveTextContent('15');
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 15 });
  },
};

const demoWeigh: WidgetDemo = createDemoController({ strict: true });
/** Demo play (which-heavier, MEA.16's solution): the objects are placed again, and nothing doubles. */
export const DemoPlayWhichHeavier: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced', ageMode: 'k' },
  args: { config: weigh, tier: 'concrete', demo: demoWeigh },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoWeigh.play({
      op: 'place',
      args: { side: 'left', term: { object: 'pumpkin', count: 1 } },
    });
    await demoWeigh.play({
      op: 'place',
      args: { side: 'right', term: { object: 'leaf', count: 1 } },
    });
    await demoWeigh.play({ op: 'tilt' });
    await expect(all(root, '.ni-bal__item')).toHaveLength(2);
    await demoWeigh.play({ op: 'answer', args: { id: 'left' } });
    await expect(card(root, 'left')).toHaveAttribute('aria-pressed', 'true');
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/** Demo invite: one ring, on the add button of the invited pan, with the hand on it. */
export const DemoInvite: Story = {
  tags: ['!visual'],
  args: { config: makeShells, tier: 'concrete', demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({
      op: 'place',
      args: { side: 'right', term: { object: 'shell', count: 1 } },
    });
    await expectRing(root, add(root, 'right'));
    await waitFor(() => expect(hand()).not.toBeNull());
    await expectPointerOn(hand(), add(root, 'right'), root);
    // The hand hangs under the button, inside the area: the picture made room for it.
    await expectNoScroll(areaBox(canvasElement));
    const area = areaBox(canvasElement).getBoundingClientRect();
    await expect(hand().getBoundingClientRect().bottom).toBeLessThanOrEqual(area.bottom);
    // The child's step ends the invite.
    await userEvent.click(add(root, 'right'));
    await expectRing(root, null);
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const demoInviteCard: WidgetDemo = createDemoController({ strict: true });
/** Demo invite on an answer: the card of a choice, or the number on the answer control. */
export const DemoInviteAnswer: Story = {
  tags: ['!visual'],
  args: { demo: demoInviteCard },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInviteCard.invite({ op: 'answer', args: { id: 'true' } });
    await expectRing(root, card(root, 'true'));
    await userEvent.click(card(root, 'true'));
    await expectRing(root, null);
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });
/** An op the balance doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  tags: ['!visual'],
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'deal-round' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};
