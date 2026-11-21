import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  AREA,
  areaBox,
  expectEqualShares,
  expectFitsArea,
  expectNumeralInk,
  expectSingleInvite,
  inArea,
  measuredShares,
} from '../../test-support/fractionStoryArea';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
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
 * `fraction-pick` (03 §5.5): a fraction picture and a choice. Pictures are exact: equal parts
 * measure equal on screen, unequal parts measure unequal, and filled parts differ from empty
 * ones by fill and by a solid (not dashed) outline.
 */

// FRA.01.t3 (frac.partition pick), seed 1: "Which one is cut into halves?" (answer pic-2). The
// circle in two that is not cut fairly is the off-centre chord.
const pickHalves: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'pick-picture',
  options: [
    {
      id: 'pic-0',
      stimulus: { kind: 'fraction', shape: 'circle', parts: 2, shaded: 0, equalParts: false },
    },
    {
      id: 'pic-1',
      stimulus: { kind: 'fraction', shape: 'circle', parts: 4, shaded: 0, equalParts: true },
    },
    {
      id: 'pic-2',
      stimulus: { kind: 'fraction', shape: 'circle', parts: 2, shaded: 0, equalParts: true },
    },
  ],
};

// FRA.01.t3, seed 3: "Which one is cut into parts that are not the same size?" (answer pic-0,
// the off-centre cross).
const pickUnequalRects: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'pick-picture',
  options: [
    {
      id: 'pic-0',
      stimulus: { kind: 'fraction', shape: 'rect', parts: 4, shaded: 0, equalParts: false },
    },
    {
      id: 'pic-1',
      stimulus: { kind: 'fraction', shape: 'rect', parts: 2, shaded: 0, equalParts: true },
    },
    {
      id: 'pic-2',
      stimulus: { kind: 'fraction', shape: 'rect', parts: 4, shaded: 0, equalParts: true },
    },
  ],
};

// FRA.07.t4 (frac.partition fair-or-not), seed 1: a circle in two unequal parts (answer no).
const fairChord: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'fair-or-not',
  stimulus: { kind: 'fraction', shape: 'circle', parts: 2, shaded: 0, equalParts: false },
};

// FRA.07.t4, seed 2: a rect in three equal parts (answer yes).
const fairThirds: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'fair-or-not',
  stimulus: { kind: 'fraction', shape: 'rect', parts: 3, shaded: 0, equalParts: true },
};

// No generator builds these modes yet (frac.line / frac.equiv / frac.compare in K02): authored
// configs that pass the model's schema.
const namePads: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'name',
  stimulus: { kind: 'fraction', shape: 'circle', parts: 4, shaded: 3, equalParts: true },
  nameInput: 'pads',
};
const nameWords: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'name',
  stimulus: { kind: 'fraction', shape: 'bar', parts: 4, shaded: 1, equalParts: true },
  nameInput: 'words',
  options: [
    { id: 'w-0', label: 'one half' },
    { id: 'w-1', label: 'one fourth' },
    { id: 'w-2', label: 'three fourths' },
  ],
};
const compareSymbols: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'compare',
  options: [
    {
      id: 'a',
      label: '2/3',
      stimulus: { kind: 'fraction', shape: 'bar', parts: 3, shaded: 2, equalParts: true },
    },
    {
      id: 'b',
      label: '2/6',
      stimulus: { kind: 'fraction', shape: 'bar', parts: 6, shaded: 2, equalParts: true },
    },
    {
      id: 'c',
      label: '2/4',
      stimulus: { kind: 'fraction', shape: 'bar', parts: 4, shaded: 2, equalParts: true },
    },
  ],
};

const meta = {
  title: 'Widgets/Fraction pick',
  args: {
    config: pickHalves as WidgetConfig,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-fpick';
const cards = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-pick')];
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });

/** Each card's picture: part count, equal or not as the config says, measured on screen. */
async function expectPicturesTrue(root: HTMLElement, config: ConfigFor<'fraction-pick'>) {
  const shown = cards(root);
  for (const [i, o] of (config.options ?? []).entries()) {
    const s = o.stimulus;
    if (s?.kind !== 'fraction') continue;
    const card = shown[i] as HTMLElement;
    const view = card.querySelector('.ni-fraction') as HTMLElement;
    await expect(view).toHaveAttribute('data-parts', String(s.parts));
    const shares = measuredShares(view);
    if (s.equalParts) await expectEqualShares(shares, s.parts);
    else {
      await expect(shares).toHaveLength(s.parts);
      await expect(Math.max(...shares) / Math.min(...shares)).toBeGreaterThan(1.5);
    }
    const filled = view.querySelectorAll('[data-fraction="filled"]');
    await expect(filled).toHaveLength(s.shaded);
  }
}

/**
 * K, FRA.01.t3 seed 1: find the halves. Three K-sized, spaced picture cards; the pictures are
 * true (two equal halves, four equal fourths, and two parts that are not equal); tap, check.
 */
export const PickHalvesK: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const options = cards(root);
    await expect(options).toHaveLength(3);
    for (const o of options) await expectTargetSize(o, 'k');
    await expectTargetGaps(options);
    await expectPicturesTrue(root, pickHalves);
    // The cards are named by position only: a name never gives the answer away.
    await expect(options.map((o) => o.getAttribute('aria-label'))).toEqual([
      'Pick 1',
      'Pick 2',
      'Pick 3',
    ]);
    await expect(check(root)).toBeDisabled();
    await userEvent.click(options[0] as HTMLElement);
    await userEvent.click(options[2] as HTMLElement);
    await expect(options[2]).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'pic-2' });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:pic-0', 'tap:pic-2']);
    await expectTraceOrdered(trace);
  },
};

/** Tablet area (1226 × 493): FRA.01.t3 seed 3, rects. Fits with no scroll; the pictures are true. */
export const PickUnequalTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: pickUnequalRects },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(root, areaBox(canvasElement), 'k', [...cards(root), check(root)]);
    await expectPicturesTrue(root, pickUnequalRects);
    // The unequal cross: four parts, all different sizes.
    const cross = measuredShares(cards(root)[0] as HTMLElement);
    await expect(new Set(cross.map((x) => x.toFixed(2))).size).toBe(4);
    await userEvent.click(cards(root)[0] as HTMLElement);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'pic-0' });
  },
};

/** Smallest landscape area (906 × 373), K: everything fits, no scroll. */
export const PickLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(AREA.landscapeMin).toEqual({ width: 906, height: 373 });
    await expectFitsArea(root, areaBox(canvasElement), 'k', [...cards(root), check(root)]);
    await expectPicturesTrue(root, pickHalves);
  },
};

/**
 * FRA.07.t4 seed 1, smallest landscape area, K: a circle cut off-centre. Two answers, yes and no,
 * each an icon and a word; tapping speaks the word. The picture measures two unequal parts.
 */
export const FairOrNotLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: fairChord },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const yes = within(root).getByRole('button', { name: 'yes' });
    const no = within(root).getByRole('button', { name: 'no' });
    await expectFitsArea(root, areaBox(canvasElement), 'k', [yes, no, check(root)]);
    const picture = root.querySelector('.ni-fpick__stimulus .ni-fraction') as HTMLElement;
    await expect(picture).toHaveAttribute('role', 'img');
    await expect(picture).toHaveAttribute('aria-label', 'Look at the picture');
    const shares = measuredShares(picture);
    await expect(shares).toHaveLength(2);
    await expect(Math.max(...shares)).toBeGreaterThan(0.7);
    await userEvent.click(no);
    await expect(audio.say).toHaveBeenCalledWith('word.no', undefined);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'no' });
  },
};

/** FRA.07.t4 seed 2 at the tablet area: three equal parts measure equal; "yes". */
export const FairOrNotTablet: Story = {
  args: { config: fairThirds },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const yes = within(root).getByRole('button', { name: 'yes' });
    const no = within(root).getByRole('button', { name: 'no' });
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [yes, no, check(root)]);
    await expectEqualShares(
      measuredShares(root.querySelector('.ni-fpick__stimulus') as HTMLElement),
      3,
    );
    await userEvent.click(yes);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'yes' });
  },
};

/**
 * Name with pads (smallest landscape area): three of four parts filled. Tap the top box, type 3,
 * tap the bottom box, type 4; the boxes show 48 px digits; check answers numbers [3, 4].
 * Exactly 3 of the 4 equal parts are filled, and filled parts have a solid outline, empty dashed.
 */
export const NamePadsLandscapeMin: Story = {
  args: { config: namePads, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const top = canvas.getByRole('button', { name: 'Top number' });
    const bottom = canvas.getByRole('button', { name: 'Bottom number' });
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-fentry__key')];
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [
      top,
      bottom,
      ...keys,
      check(root),
    ]);
    const picture = root.querySelector('.ni-fpick__stimulus') as HTMLElement;
    await expectEqualShares(measuredShares(picture), 4);
    const filled = [...picture.querySelectorAll<SVGPathElement>('[data-fraction="filled"]')];
    const empty = [...picture.querySelectorAll<SVGPathElement>('[data-fraction="empty"]')];
    await expect(filled).toHaveLength(3);
    await expect(empty).toHaveLength(1);
    for (const p of filled) await expect(getComputedStyle(p).strokeDasharray).toBe('none');
    for (const p of empty) await expect(getComputedStyle(p).strokeDasharray).not.toBe('none');
    await userEvent.click(top);
    await userEvent.click(canvas.getByRole('button', { name: '3' }));
    await userEvent.click(bottom);
    await userEvent.click(canvas.getByRole('button', { name: '4' }));
    // Typed digits and pad digits are drawn ≥ 32 px tall.
    await expectNumeralInk(root.querySelectorAll('.ni-fentry__digits'));
    await expectNumeralInk(root.querySelectorAll('.ni-fentry__digit'));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [3, 4] });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:top',
      'tap:key-3',
      'tap:bottom',
      'tap:key-4',
    ]);
  },
};

/** Keyboard (06 §7) on the pads: digits type, ArrowDown moves to the bottom box, Enter checks. */
export const NamePadsKeyboard: Story = {
  args: { config: namePads, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const top = within(root).getByRole('button', { name: 'Top number' });
    top.focus();
    await userEvent.keyboard('3');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('4');
    await expect(within(root).getByRole('button', { name: 'Bottom number 4' })).toBeVisible();
    // Tab through the pad to Check (every key is reachable), then Enter.
    for (let i = 0; i < 20 && document.activeElement !== check(root); i += 1) {
      await userEvent.tab();
    }
    await expect(check(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:key-3',
      'tap:bottom',
      'tap:key-4',
    ]);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [3, 4] });
  },
};

/** Name with words: the bar in fourths, one filled; three word cards; tapping speaks nothing extra. */
export const NameWords: Story = {
  args: { config: nameWords },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cards(root)).toHaveLength(3);
    await expectTargetGaps(cards(root));
    await userEvent.click(within(root).getByRole('button', { name: 'one fourth' }));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'w-1' });
  },
};

/**
 * Abstract tier, compare: the symbols lead (stacked numerals, each digit ≥ 32 px, a bar
 * between), each with its strip small beside it, exact: 2 of 3, 2 of 6 and 2 of 4 filled.
 */
export const CompareAbstract: Story = {
  args: { config: compareSymbols, tier: 'abstract' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const options = cards(root);
    await expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['2/3', '2/6', '2/4']);
    await expectNumeralInk(root.querySelectorAll('.ni-frac-num > span'));
    await expectPicturesTrue(root, compareSymbols);
    // Compared pictures share one whole: every strip is drawn the same width.
    const strips = cards(root).map((c) =>
      Math.round((c.querySelector('svg') as SVGElement).getBoundingClientRect().width),
    );
    await expect(new Set(strips).size).toBe(1);
    await userEvent.click(options[0] as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.frac.over', { a: 2, b: 3 });
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'a' });
  },
};

/** Keyboard (06 §7): Tab to a card, Space picks it, Tab to check, Enter answers. */
export const Keyboard: Story = {
  args: { config: pickUnequalRects },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    (cards(root)[0] as HTMLElement).focus();
    await userEvent.tab();
    await userEvent.keyboard(' ');
    await expect(cards(root)[1]).toHaveAttribute('aria-pressed', 'true');
    await userEvent.tab();
    await userEvent.tab();
    await expect(check(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'pic-1' });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const c of cards(root)) await expect(c).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), FRA.07.t4 seed 2's solution: Pip counts the parts aloud (each part is
 * ringed in turn), lays a guide over the picture, then answers yes. Other ops throw.
 */
export const DemoMode: Story = {
  args: { config: fairThirds, disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const counting = demoController.play({ op: 'count-parts' });
    await waitFor(() => expect(root.querySelector('[data-counting="true"]')).not.toBeNull());
    await counting;
    await expect((audio.sayPhrases.mock.calls as unknown[][]).map((c) => c[0])).toEqual([
      [{ number: 1 }],
      [{ number: 2 }],
      [{ number: 3 }],
    ]);
    await demoController.play({ op: 'overlay', args: { a: 1, b: 3 } });
    await expect(root.querySelector('[data-overlay="1/3"]')).not.toBeNull();
    await demoController.play({ op: 'answer', args: { id: 'yes' } });
    await expect(within(root).getByRole('button', { name: 'yes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(demoController.play({ op: 'cut' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const typeController: WidgetDemo = createDemoController({ strict: true });

/** Demo `answer {values}` on the pads: Pip types 3, then 4, key by key. */
export const DemoTypesName: Story = {
  args: { config: namePads, tier: 'abstract', disabled: true, demo: typeController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await typeController.play({ op: 'answer', args: { values: [3, 4] } });
    await expect(within(root).getByRole('button', { name: 'Top number 3' })).toBeVisible();
    await expect(within(root).getByRole('button', { name: 'Bottom number 4' })).toBeVisible();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the card to tap (nothing is picked yet). */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'answer', args: { id: 'pic-2' } });
    await waitFor(() => expect(root.querySelector('.ni-pick.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-pick.ni-invite') as HTMLElement;
    await expect(invited).toHaveAttribute('data-id', 'pic-2');
    await expect(invited).toHaveAttribute('aria-pressed', 'false');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, invited, root);
    await expectSingleInvite(root);
    // The story ends in the invited state: the ring and Pip's hand stay visible.
    await expect(root.querySelector('.ni-hand') as HTMLElement).toBeVisible();
  },
};

const clearController: WidgetDemo = createDemoController({ strict: true });

/** An invite cleared with `invite(null)` takes away the ring and Pip's hand. */
export const DemoInviteCleared: Story = {
  args: { demo: clearController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    clearController.invite({ op: 'answer', args: { id: 'pic-1' } });
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    clearController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expect(root.querySelector('.ni-pick.ni-invite')).toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: counting and answering are instant state changes. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fairChord, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // The parts are not counted one by one: watch for the counting state while the op plays.
    let counting = 0;
    const seen = new MutationObserver(() => {
      if (root.querySelector('[data-counting="true"]')) counting += 1;
    });
    seen.observe(root, { attributes: true, subtree: true, attributeFilter: ['data-counting'] });
    await reducedController.play({ op: 'count-parts' });
    await reducedController.play({ op: 'answer', args: { id: 'no' } });
    seen.disconnect();
    await expect(counting).toBe(0);
    // Instant is checked by the effect, never by the clock: once the op resolves, the result is
    // drawn and nothing is still moving.
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running'),
    ).toHaveLength(0);
    await expect(within(root).getByRole('button', { name: 'no' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

// ---------- evidence audit: true scale, one invite, stress ----------

const bar = (parts: number, shaded: number) =>
  ({ kind: 'fraction', shape: 'bar', parts, shaded, equalParts: true }) as const;

// Authored (frac.equiv is K02): which strip shows the same amount as 1/2?
const equivalentBars: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'equivalent',
  stimulus: bar(2, 1),
  options: [
    { id: 'a', stimulus: bar(4, 2) },
    { id: 'b', stimulus: bar(3, 1) },
    { id: 'c', stimulus: bar(4, 3) },
  ],
};

/** The compared whole is drawn at the options' size: true relative scale (smallest landscape). */
export const EquivalentTrueScaleLandscapeMin: Story = {
  args: { config: equivalentBars },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [...cards(root), check(root)]);
    const widths = [
      root.querySelector('.ni-fpick__stimulus svg'),
      ...cards(root).map((c) => c.querySelector('svg')),
    ].map((s) => Math.round((s as SVGElement).getBoundingClientRect().width));
    await expect(new Set(widths).size).toBe(1);
    await userEvent.click(cards(root)[0] as HTMLElement);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'a' });
  },
};

const padInvite: WidgetDemo = createDemoController({ strict: true });

/** Invite on the pads: one ring, on the top box, 12 px clear of the other box, the pad and Check. */
export const DemoInviteNamePads: Story = {
  globals: { ageMode: 'k' },
  args: { config: namePads, tier: 'abstract', demo: padInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    padInvite.invite({ op: 'answer', args: { values: [3, 4] } });
    await waitFor(() => expect(root.querySelector('.ni-fentry__box.ni-invite')).not.toBeNull());
    const box = root.querySelector('.ni-fentry__box.ni-invite') as HTMLElement;
    await expect(box).toHaveAttribute('data-slot', '0');
    await expectSingleInvite(root);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, box, root);
    await expect(root.querySelector('.ni-hand') as HTMLElement).toBeVisible();
  },
};

// Stress (authored): six pictures, halves to twelfths of one circle.
const sixPictures: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'pick-picture',
  options: [2, 3, 4, 6, 8, 12].map((parts, i) => ({
    id: `pic-${i}`,
    stimulus: { kind: 'fraction', shape: 'circle', parts, shaded: 1, equalParts: true } as const,
  })),
};

async function expectSixFit(canvasElement: HTMLElement, ageMode: 'k' | 'g1-up') {
  const root = await findWidget(canvasElement, ROOT);
  await expect(cards(root)).toHaveLength(6);
  await expectFitsArea(root, areaBox(canvasElement), ageMode, [...cards(root), check(root)]);
  await expectPicturesTrue(root, sixPictures);
  // One whole, six cuts: every circle is drawn the same size.
  const widths = cards(root).map((c) =>
    Math.round((c.querySelector('svg') as SVGElement).getBoundingClientRect().width),
  );
  await expect(new Set(widths).size).toBe(1);
}

/** Stress: six picture options (to twelfths) at the tablet area, K. */
export const SixOptionsTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: sixPictures },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => expectSixFit(canvasElement, 'k'),
};

/** Stress: six picture options at the smallest landscape area. */
export const SixOptionsLandscapeMin: Story = {
  args: { config: sixPictures },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => expectSixFit(canvasElement, 'g1-up'),
};

// Stress (authored): two-digit stacked fractions.
const longLabels: ConfigFor<'fraction-pick'> = {
  format: 'fraction-pick',
  mode: 'compare',
  options: [
    { id: 'a', label: '11/12', stimulus: bar(12, 11) },
    { id: 'b', label: '7/12', stimulus: bar(12, 7) },
    { id: 'c', label: '10/12', stimulus: bar(12, 10) },
  ],
};

async function expectLongLabelsFit(canvasElement: HTMLElement) {
  const root = await findWidget(canvasElement, ROOT);
  await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [...cards(root), check(root)]);
  // The stacked numerals: their drawn digits are ≥ 32 px tall.
  await expectNumeralInk(root.querySelectorAll('.ni-frac-num > span'));
  // Every stacked numeral stays inside its card.
  for (const c of cards(root)) {
    const cr = c.getBoundingClientRect();
    const nr = (c.querySelector('.ni-frac-num') as HTMLElement).getBoundingClientRect();
    await expect(nr.left).toBeGreaterThanOrEqual(cr.left);
    await expect(nr.right).toBeLessThanOrEqual(cr.right);
  }
  await expectPicturesTrue(root, longLabels);
}

/** Stress: two-digit fractions (twelfths) in the abstract tier, tablet area. */
export const LongLabelsTablet: Story = {
  args: { config: longLabels, tier: 'abstract' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => expectLongLabelsFit(canvasElement),
};

/** Stress: two-digit fractions at the smallest landscape area. */
export const LongLabelsLandscapeMin: Story = {
  args: { config: longLabels, tier: 'abstract' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => expectLongLabelsFit(canvasElement),
};

// ---------- taking a pick back where it sits ----------

/** The picked card is un-picked by tapping it again, or with Enter on it; Check waits for a pick. */
export const PickTakenBack: Story = {
  args: { config: pickHalves },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const card = cards(root)[1] as HTMLElement;
    await userEvent.click(card);
    await expect(check(root)).toBeEnabled();
    await userEvent.click(card);
    await expect(check(root)).toBeDisabled();
    card.focus();
    await userEvent.keyboard('{Enter}');
    await expect(check(root)).toBeEnabled();
    await userEvent.keyboard('{Enter}');
    await expect(check(root)).toBeDisabled();
    await expect(
      traceOf(args.onInteract)
        .map((e) => e.t)
        .filter((t) => t === 'undo'),
    ).toHaveLength(2);
    // Another card can still be picked and checked.
    await userEvent.click(cards(root)[0] as HTMLElement);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
  },
};
