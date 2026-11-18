import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectOneInvite, targetsOf } from '../../test-support/inviteStory';
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
  areaBox,
  expectFitsArea,
  expectTraceOrdered,
  findWidget,
  inArea,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import type { AgeMode } from '../../tokens/tokens';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `number-bond` (03 §5.5): pictorial (a bond with blanks, filled from the numeral tray or the pad)
 * and concrete (counters split across the bond). Missing-part and missing-whole answer `number`;
 * split and new-way answer `{ parts }`. Responses come from the engine model. Fixtures mirror the
 * generated items (CPS.01.t4, CPS.03.t3, CPS.01.t5, CPS.08.t3, SUB.06.t1, CPS.07.t1, CPS.09.t3).
 */

type Config = ConfigFor<'number-bond'>;

/** CPS.01.t4 (K): 5 is 4 and what? */
const missing5: Config = {
  format: 'number-bond',
  whole: 5,
  parts: [4, null],
  mode: 'missing-part',
  counters: false,
  nonZero: false,
};

/** CPS.03.t3 (K): 10 is 6 and what? */
const missing10: Config = { ...missing5, whole: 10, parts: [6, null] };

/** CPS.01.t5 (K): split 5 into two parts. */
const split5: Config = {
  format: 'number-bond',
  whole: 5,
  parts: [null, null],
  mode: 'split',
  counters: false,
  nonZero: true,
};

/** CPS.08.t3 (G1): a new way to make 16 (two found already). */
const newWay16: Config = {
  ...split5,
  whole: 16,
  mode: 'new-way',
  found: [
    [10, 6],
    [15, 1],
  ],
};

/** SUB.06.t1 (concrete, G1): 3 and 1, how many in all? */
const wholeFromParts: Config = {
  format: 'number-bond',
  whole: null,
  parts: [3, 1],
  mode: 'missing-whole',
  counters: true,
  nonZero: true,
};

/** SUB.06.t1 at its largest: 5 and 5. */
const wholeFromParts55: Config = { ...wholeFromParts, parts: [5, 5] };

/** Concrete split of 6 with counters. */
const splitCounters6: Config = {
  format: 'number-bond',
  whole: 6,
  parts: [null, null],
  mode: 'split',
  counters: true,
  nonZero: false,
};

/** CPS.07.t1 (K): 17 is 10 and what? */
const teen17: Config = { ...missing5, whole: 17, parts: [10, null] };

/** CPS.09.t3 (G1): 100 is 40 and what? (the pad answers above 20) */
const hundred: Config = { ...missing5, whole: 100, parts: [40, null] };

const meta = {
  title: 'Widgets/Number bond',
  args: {
    config: missing5 as WidgetConfig,
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

const ROOT = '.ni-bondw';
const counter = (root: HTMLElement, id: number) =>
  root.querySelector(`[data-counter="${id}"]`) as HTMLElement;
const poolPad = (root: HTMLElement, slot: string) =>
  root.querySelector(`[data-pool="${slot}"] .ni-bondw__pad`) as HTMLElement;
const inPool = (root: HTMLElement, slot: string) =>
  root.querySelectorAll(`[data-pool="${slot}"] .ni-bondw__counter`).length;
const button = (root: HTMLElement, name: string) => within(root).getByRole('button', { name });
const circleCentre = (root: HTMLElement, slot: string) => {
  const r = (
    root.querySelector(`.ni-bondw__circle[data-slot="${slot}"]`) as HTMLElement
  ).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * Pictorial missing part (CPS.01.t4): the tray offers 0–5. Tapping the given 4 speaks it; picking
 * 1 fills the blank; check answers `{ kind: 'number', value: 1 }`. Maths truth: the whole sits
 * above, centred between its two parts, joined to each by a leg.
 */
export const MissingPart: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('group', { name: 'Look at the picture' })).toBeVisible();
    const whole = circleCentre(root, 'whole');
    const p0 = circleCentre(root, 'part-0');
    const p1 = circleCentre(root, 'part-1');
    await expect(whole.y).toBeLessThan(p0.y);
    await expect(Math.abs(p0.y - p1.y)).toBeLessThan(1);
    await expect(Math.abs(whole.x - (p0.x + p1.x) / 2)).toBeLessThan(1);
    await expect(root.querySelectorAll('.ni-bondw__legs line')).toHaveLength(2);
    await expect(root.querySelectorAll('.ni-pick')).toHaveLength(6);
    const check = button(root, 'Check');
    await expect(check).toBeDisabled();
    await userEvent.click(button(root, 'Part 1: 4'));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 4 }]);
    await userEvent.click(button(root, '1'));
    await expect(button(root, 'Part 2: 1')).toBeVisible();
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 1 }]);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 1 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:part-0', 'tap:opt-1']);
  },
};

/** K mode (CPS.03.t3): circles and numeral cards are ≥ 80 px and ≥ 12 px apart. */
export const MissingPartK: Story = {
  globals: { ageMode: 'k' },
  args: { config: missing10 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards).toHaveLength(11);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    const circles = [...root.querySelectorAll<HTMLElement>('.ni-bondw__circle')];
    for (const c of circles) await expectTargetSize(c, 'k');
    await expectTargetGaps(circles);
    await userEvent.click(button(root, '4'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
  },
};

/**
 * Split (CPS.01.t5): two blanks. Picking fills the active blank and moves on to the next; tapping
 * a blank makes it active again (an ink ring and a caret, not the teal invite ring).
 */
export const Split: Story = {
  args: { config: split5 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(button(root, 'Part 1:')).toHaveAttribute('aria-current', 'true');
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await userEvent.click(button(root, '2'));
    await expect(button(root, 'Part 2:')).toHaveAttribute('aria-current', 'true');
    await userEvent.click(button(root, '3'));
    await userEvent.click(button(root, 'Part 1: 2'));
    await userEvent.click(button(root, '1'));
    await expect(button(root, 'Part 1: 1')).toBeVisible();
    await userEvent.click(button(root, 'Part 2: 3'));
    await userEvent.click(button(root, '4'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { parts: [1, 4] } });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** new-way (CPS.08.t3): the ways already found are shown as small bonds beside the one to fill. */
export const NewWay: Story = {
  args: { config: newWay16 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const found = within(root).getByRole('region', { name: 'What you did' });
    await expect(within(found).getAllByRole('img')).toHaveLength(2);
    // Every numeral in the small bonds stays ≥ 32 px (05 §11).
    for (const n of found.querySelectorAll<HTMLElement>('.ni-bondw__num')) {
      await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await userEvent.click(button(root, '12'));
    await userEvent.click(button(root, '4'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { parts: [12, 4] },
    });
  },
};

/**
 * Concrete missing whole (SUB.06.t1), K mode: the counters start in the parts. Drag them up into
 * the whole (mouse, touch, tap-to-place); tap one there to send it home. Then pick 4.
 */
export const WholeFromPartsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: wholeFromParts, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(inPool(root, 'part-0')).toBe(3);
    await expect(inPool(root, 'part-1')).toBe(1);
    const counters = [...root.querySelectorAll<HTMLElement>('.ni-bondw__counter')];
    for (const c of counters) await expectTargetSize(c, 'k');
    await expectTargetGaps(counters);

    await pointerDrag(counter(root, 0), center(poolPad(root, 'whole')), 'mouse');
    await waitFor(() => expect(inPool(root, 'whole')).toBe(1));
    await pointerDrag(counter(root, 3), center(poolPad(root, 'whole')), 'touch');
    await waitFor(() => expect(inPool(root, 'whole')).toBe(2));
    await userEvent.click(counter(root, 1));
    await userEvent.click(poolPad(root, 'whole'));
    await waitFor(() => expect(inPool(root, 'whole')).toBe(3));
    await userEvent.click(button(root, 'Counter 4'));
    await waitFor(() => expect(inPool(root, 'part-1')).toBe(1));

    if (root.dataset.step === 'bond') await userEvent.click(button(root, 'Next'));
    await userEvent.click(button(root, '4'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
    const trace = traceOf(args.onInteract)
      .map((e) => `${e.t}:${e.target}`)
      .filter((e) => e !== 'tap:next');
    await expect(trace).toEqual([
      'drag:counter-0',
      'drop:whole',
      'drag:counter-3',
      'drop:whole',
      'tap:counter-1',
      'tap:whole',
      'undo:counter-3',
      'tap:opt-4',
    ]);
  },
};

/** Concrete split with the keyboard and a drag: the parts' badges show their live counts. */
export const SplitCounters: Story = {
  args: { config: splitCounters6, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    counter(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(poolPad(root, 'part-0')));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inPool(root, 'part-0')).toBe(1));
    counter(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inPool(root, 'part-1')).toBe(1));
    await pointerDrag(counter(root, 2), center(poolPad(root, 'part-1')), 'touch');
    await waitFor(() => expect(inPool(root, 'part-1')).toBe(2));
    await expect(root.querySelector('[data-pool="part-1"] .ni-bondw__badge')?.textContent).toBe(
      '2',
    );
    // Maths truth: whole = part + part, always (the counters never leave the bond).
    await expect(inPool(root, 'whole') + inPool(root, 'part-0') + inPool(root, 'part-1')).toBe(6);
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { parts: [1, 2] } });
  },
};

/**
 * CPS.09.t3: 100 is 40 and what? The pad answers (above 20). Enter on an empty answer does
 * nothing; a double Enter and Enter-then-Check inside 400 ms submit once (06 §4).
 */
export const HundredPad: Story = {
  args: { config: hundred },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    if (root.dataset.step === 'bond') await userEvent.click(button(root, 'Next'));
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('60');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 60 });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { config: splitCounters6, tier: 'concrete', disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(counter(root, 0));
    await userEvent.click(poolPad(root, 'part-0'));
    await expect(inPool(root, 'part-0')).toBe(0);
    await expect(button(root, 'Check')).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (pictorial): Pip highlights the whole and fills the parts; strict mode throws. */
export const DemoMode: Story = {
  args: { config: split5, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { slot: 'whole' } });
    await demoController.play({ op: 'split-counters', args: { left: 3, right: 2 } });
    await expect(button(root, 'Part 2: 2')).toBeVisible();
    await demoController.play({ op: 'fill', args: { slot: 'part-0', value: 1 } });
    await expect(button(root, 'Part 1: 1')).toBeVisible();
    await expect(demoController.play({ op: 'slide' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'fill', args: { slot: 'part-1', value: 4 } });
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Invites (K): `fill` a blank that isn't active → the blank itself; once it is active → the
 * numeral card; when the number is in → Check. One ring at a time, Pip's fingertip on it.
 */
export const DemoInviteK: Story = {
  globals: { ageMode: 'k' },
  args: { config: split5, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'fill', args: { slot: 'part-1', value: 4 } });
    const ringed = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    if (ringed.classList.contains('ni-bondw__circle')) {
      await expect(ringed.dataset.slot).toBe('part-1');
      await expectOneInvite(root, ringed);
      await userEvent.click(ringed);
    }
    const card = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-pick.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(card.dataset.id).toBe('opt-4');
    await expectOneInvite(root, card);
  },
};

const concreteController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (concrete): `split-counters` slides counters out of the whole into the parts. */
export const DemoConcrete: Story = {
  args: { config: splitCounters6, tier: 'concrete', demo: concreteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await concreteController.play({ op: 'split-counters', args: { left: 2, right: 1 } });
    await expect(inPool(root, 'part-0')).toBe(2);
    await expect(inPool(root, 'part-1')).toBe(1);
    concreteController.invite({ op: 'split-counters', args: { left: 2, right: 3 } });
    const ringed = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-bondw__counter.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(ringed.closest('[data-pool]')?.getAttribute('data-pool')).toBe('whole');
    await expectOneInvite(root, ringed);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: highlight and answer are instant, and `play` resolves after the commit. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: wholeFromParts, tier: 'concrete', disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'highlight', args: { slot: 'whole' } });
    await reducedController.play({ op: 'answer', args: { value: 4 } });
    await expect(performance.now() - started).toBeLessThan(500);
    if (root.dataset.step === 'ask') {
      await expect(button(root, '4')).toHaveAttribute('aria-pressed', 'true');
    } else {
      await expect(root.querySelector('[data-pool="whole"] .ni-bondw__badge')?.textContent).toBe(
        '4',
      );
    }
  },
};

// ---------- the real widget area (06 §1, §2): 960 × 600, portrait, tablet ----------

async function expectFits(canvasElement: HTMLElement, ageMode: AgeMode) {
  const root = await findWidget(canvasElement, ROOT);
  await waitForSettled(root);
  const parts = [
    ...root.querySelectorAll<HTMLElement>(
      '.ni-bondw__bond, .ni-bondw__pool, .ni-bondw__found, .ni-entry, .ni-bondw__act',
    ),
  ];
  // A pool's drop pad lies under its counters: the counters are the targets to measure.
  const targets = targetsOf(root).filter((el) => !el.classList.contains('ni-bondw__pad'));
  await expectFitsArea(areaBox(canvasElement), parts, targets, ageMode);
  return root;
}

async function throughSteps(root: HTMLElement, ageMode: AgeMode, canvasElement: HTMLElement) {
  if (root.dataset.step !== 'bond') return;
  button(root, 'Next').focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(root.dataset.step).toBe('ask'));
  await waitFor(() => expect(document.activeElement).toBe(button(root, 'Go back')));
  await expectFits(canvasElement, ageMode);
  await userEvent.click(button(root, 'Go back'));
  await waitFor(() => expect(root.dataset.step).toBe('bond'));
}

/** CPS.01.t4 in K at 960 × 600. */
export const AreaLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};

/** CPS.03.t3 (0–10) in K at 960 × 600: a tapped blank opens the answer step. */
export const AreaLandscapeMinTenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: missing10 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
    if (root.dataset.step === 'bond') {
      await userEvent.click(button(root, 'Part 2:'));
      await waitFor(() => expect(root.dataset.step).toBe('ask'));
    }
    await userEvent.click(button(root, '4'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
  },
};

/** CPS.08.t3 (new-way) in G1 at 960 × 600. */
export const AreaLandscapeMinNewWayG1: Story = {
  args: { config: newWay16 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** SUB.06.t1 (concrete, 3 and 1) in G1 at 960 × 600. */
export const AreaLandscapeMinConcreteG1: Story = {
  args: { config: wholeFromParts, tier: 'concrete' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** SUB.06.t1 (concrete, 5 and 5) in G1 on a tablet. */
export const AreaTabletConcreteG1: Story = {
  args: { config: wholeFromParts55, tier: 'concrete' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** CPS.07.t1 (0–17) in K, portrait. */
export const AreaPortraitK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen17 },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};

/** CPS.09.t3 (the pad) in G1 at 960 × 600. */
export const AreaLandscapeMinHundredG1: Story = {
  args: { config: hundred },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** CPS.03.t3 in K on a tablet. */
export const AreaTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: missing10 },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};
