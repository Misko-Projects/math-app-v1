import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectFitsArea,
  expectHandStays,
  expectNumeralsAtLeast32,
  inArea,
} from '../../test-support/areaStory';
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
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `compare-length` (03 §5.5): objects from one start line on one scale. Configs are real
 * generated items (mea.length; template and seed in each comment).
 */

type Config = ConfigFor<'compare-length'>;

/** MEA.01.t1 seed 1: which ribbon is longer? The short one starts 2 units past the line. */
const misaligned: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'ribbon', length: 6, offset: 2 },
    { id: 'obj-1', sprite: 'ribbon', length: 10, offset: 0 },
  ],
  ask: 'longer',
  aligned: false,
};

/** MEA.01.t2 seed 1: which vine is shorter? */
const shorter: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'vine', length: 10, offset: 0 },
    { id: 'obj-1', sprite: 'vine', length: 6, offset: 0 },
  ],
  ask: 'shorter',
  aligned: true,
};

/** MEA.07.t1 seed 7: shortest first; the 2-unit rope starts 3 units past the line. */
const order: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'rope', length: 6, offset: 0 },
    { id: 'obj-1', sprite: 'rope', length: 2, offset: 3 },
    { id: 'obj-2', sprite: 'rope', length: 9, offset: 0 },
  ],
  ask: 'order',
  aligned: false,
};

/** MEA.01.t4 seed 3 (pictorial): longest first. */
const orderPictorial: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'plank', length: 9, offset: 0 },
    { id: 'obj-1', sprite: 'plank', length: 6, offset: 0 },
    { id: 'obj-2', sprite: 'plank', length: 3, offset: 0 },
  ],
  ask: 'order',
  aligned: true,
};

/** MEA.07.t2 seed 1: the logs cannot move; lay a string on each. */
const indirect: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'log', length: 5, offset: 0 },
    { id: 'obj-1', sprite: 'log', length: 8, offset: 2 },
  ],
  ask: 'indirect',
  aligned: false,
};

/** How much longer (MEA.10, K02; no template yet): a hand-made config the schema accepts. */
const difference: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'plank', length: 7, offset: 0 },
    { id: 'obj-1', sprite: 'plank', length: 4, offset: 0 },
  ],
  ask: 'how-much-longer',
  aligned: true,
};

const meta = {
  title: 'Widgets/Compare length',
  args: {
    config: misaligned as WidgetConfig,
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

const ROOT = '.ni-clen';
const obj = (root: HTMLElement, id: string) =>
  root.querySelector(`.ni-clen__obj[data-id="${id}"]`) as HTMLElement;
const art = (root: HTMLElement, id: string) =>
  obj(root, id).querySelector('svg.ni-len') as SVGSVGElement;
const unitPx = (root: HTMLElement) =>
  Number((root.querySelector('.ni-clen__lanes') as HTMLElement).dataset.unitPx);
const line = (root: HTMLElement) => center(root.querySelector('.ni-clen__line') as HTMLElement).x;

/** Every object is drawn to scale from where it starts: left end at start, width length × unit. */
async function expectToScale(root: HTMLElement, config: Config) {
  const u = unitPx(root);
  for (const o of config.objects) {
    const el = obj(root, o.id);
    await waitForSettled(el);
    const r = art(root, o.id).getBoundingClientRect();
    await expect(r.width, `${o.id} width`).toBeCloseTo(o.length * u, 0);
    const start = Number(el.dataset.start);
    await expect(r.left - line(root), `${o.id} start`).toBeCloseTo(start * u, 0);
  }
}

/**
 * K concrete (MEA.01.t1): the short ribbon starts 2 units past the line. Drag it to the line to
 * line it up (touch), then tap the longer one (it says its name). Both drawn to scale.
 */
export const LongerSlideToLineK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, misaligned);
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '2');
    for (const id of ['obj-0', 'obj-1']) await expectTargetSize(obj(root, id), 'k');
    await expectTargetGaps([obj(root, 'obj-0'), obj(root, 'obj-1')]);
    // Slide it left to the start line (touch).
    const r = obj(root, 'obj-0').getBoundingClientRect();
    await pointerDrag(
      obj(root, 'obj-0'),
      { x: r.left + r.width / 2 - 2 * unitPx(root), y: r.top + r.height / 2 },
      'touch',
    );
    await waitFor(() => expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0'));
    await expectToScale(root, misaligned);
    await userEvent.click(obj(root, 'obj-1'));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.ribbon', undefined);
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:obj-0',
      'drop:start',
      'tap:obj-1',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** A slide that stops short of the line goes back; ← on the object lines it up (keyboard). */
export const SlideKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = obj(root, 'obj-0').getBoundingClientRect();
    await pointerDrag(obj(root, 'obj-0'), { x: r.left + r.width / 2 - 20, y: r.top + 10 }, 'mouse');
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '2');
    obj(root, 'obj-0').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0');
    await userEvent.keyboard(' ');
    await expect(obj(root, 'obj-0')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-0' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:obj-0',
      'drop:none',
      'move:obj-0',
      'tap:obj-0',
    ]);
  },
};

/** MEA.01.t2 (pictorial): unit ticks on the floor; tap the shorter vine. */
export const ShorterPictorial: Story = {
  args: { config: shorter, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, shorter);
    await expect(root.querySelector('.ni-clen__floor')).not.toBeNull();
    await userEvent.click(obj(root, 'obj-1'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
  },
};

const badge = (root: HTMLElement, n: number) =>
  root.querySelector(`.ni-clen__badge[data-badge="${n}"]`) as HTMLElement;
const lanePad = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-lane="${id}"] > .ni-clen__pad`) as HTMLElement;

/**
 * MEA.07.t1 (concrete, K): shortest first. Badge 1 by touch drag, badge 2 by tap-then-tap, badge
 * 3 by keyboard. Check answers the lengths in badge order.
 */
export const OrderBadgesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: order },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, order);
    const badges = [0, 1, 2].map((n) => badge(root, n));
    for (const b of badges) await expectTargetSize(b, 'k');
    await expectTargetGaps(badges);
    await expectNumeralsAtLeast32(root, '.ni-clen__badge');
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await pointerDrag(badge(root, 0), center(lanePad(root, 'obj-1')), 'touch');
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-1"] .ni-clen__badge')).toHaveAttribute(
        'data-badge',
        '0',
      ),
    );
    await userEvent.click(badge(root, 1));
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-0"] .ni-clen__badge')).not.toBeNull(),
    );
    badge(root, 2).focus();
    await userEvent.keyboard('{Enter}');
    // Focus jumps to the first object; move to the last one and drop.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-2"] .ni-clen__badge')).not.toBeNull(),
    );
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [2, 6, 9] });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** A badge moved to another object, and one sent back to the tray. */
export const OrderMoveBadge: Story = {
  args: { config: orderPictorial, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(badge(root, 0));
    await userEvent.click(obj(root, 'obj-1'));
    // Badge 1 moves from the 6-plank to the 9-plank.
    await userEvent.click(root.querySelector('[data-lane="obj-1"] .ni-clen__badge') as HTMLElement);
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-1"] .ni-clen__badge')).toBeNull(),
    );
    await userEvent.click(badge(root, 1));
    await userEvent.click(obj(root, 'obj-1'));
    await userEvent.click(badge(root, 2));
    await userEvent.click(obj(root, 'obj-2'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [9, 6, 3] });
  },
};

/** Tablet widget area, K: the three ropes, badges and Check fit with no scroll. */
export const OrderTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: order },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-clen__badge, .ni-clen__lane'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectToScale(root, order);
  },
};

/** Smallest landscape area, K: lanes, badges and Check fit with no scroll; still to scale. */
export const OrderLandscapeMinK: Story = {
  ...OrderTabletK,
  render: inArea('landscapeMin'),
};

/**
 * MEA.07.t2: the logs cannot move. Drag the string onto each (or tap it, then a log); the
 * strings show side by side from one line, exactly as long as the logs. Then tap the longer log.
 */
export const IndirectStrings: Story = {
  globals: { ageMode: 'k' },
  args: { config: indirect },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const spool = within(root).getByRole('button', { name: 'String' });
    await expectTargetSize(spool, 'k');
    // The logs do not slide.
    const r = obj(root, 'obj-1').getBoundingClientRect();
    await pointerDrag(obj(root, 'obj-1'), { x: r.left - 100, y: r.top + 20 }, 'mouse');
    await expect(obj(root, 'obj-1')).toHaveAttribute('data-start', '2');
    await pointerDrag(spool, center(lanePad(root, 'obj-1')), 'touch');
    await waitFor(() => expect(root.querySelector('[data-string-row="obj-1"]')).not.toBeNull());
    await userEvent.click(spool);
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() => expect(root.querySelector('[data-string-row="obj-0"]')).not.toBeNull());
    const u = unitPx(root);
    for (const o of indirect.objects) {
      const s = root.querySelector(`[data-string-row="${o.id}"] .ni-string`) as SVGElement;
      await expect(s.getBoundingClientRect().width).toBeCloseTo(o.length * u, 0);
      await expect(s.getBoundingClientRect().left).toBeCloseTo(line(root), 0);
    }
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-clen__strings'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await userEvent.click(obj(root, 'obj-1'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual(
      expect.arrayContaining(['drag:string', 'drop:obj-1', 'tap:string', 'tap:obj-0', 'tap:obj-1']),
    );
  },
};

/**
 * MEA.07.t2 (review CR-1.5): the child lays a string along each log first (03 §5.5). Before both
 * strings are laid, tapping a log picks nothing and Check stays off; afterwards the pick submits,
 * and both string placements are in the trace before the pick.
 */
export const IndirectNeedsBothStrings: Story = {
  args: { config: indirect },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const check = within(root).getByRole('button', { name: 'Check' });
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeDisabled();
    const spool = within(root).getByRole('button', { name: 'String' });
    await userEvent.click(spool);
    await userEvent.click(obj(root, 'obj-1'));
    await userEvent.click(obj(root, 'obj-0'));
    await expect(obj(root, 'obj-0')).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeDisabled();
    await userEvent.click(spool);
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() => expect(root.querySelectorAll('[data-string-row]')).toHaveLength(2));
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    const lastLay = Math.max(trace.lastIndexOf('tap:obj-0'), trace.indexOf('tap:obj-1'));
    await expect(trace.filter((e) => e === 'tap:string')).toHaveLength(2);
    await expect(trace.lastIndexOf('tap:obj-1')).toBeGreaterThan(lastLay - 1);
  },
};

/** How much longer: type the difference on the pad (smallest landscape area, compact pad). */
export const HowMuchLongerLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: difference, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, difference);
    await userEvent.click(within(root).getByRole('button', { name: '3' }));
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-pad__key, .ni-entry__box'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectNumeralsAtLeast32(root, '.ni-entry__text, .ni-pad__digit');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 3 });
  },
};

/**
 * Tap-only mode (06 §7, review CR-1.6): dragging the misaligned ribbon does nothing; a tap still
 * picks, and ← on the keyboard still lines it up.
 */
export const TapOnlyNoSlide: Story = {
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = obj(root, 'obj-0').getBoundingClientRect();
    await pointerDrag(
      obj(root, 'obj-0'),
      { x: r.left + r.width / 2 - 2 * unitPx(root), y: r.top + r.height / 2 },
      'touch',
    );
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '2');
    await expect(traceOf(args.onInteract).map((e) => e.t)).not.toContain('drag');
    obj(root, 'obj-0').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0');
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
  },
};

/** `disabled`: objects cannot be picked or slid. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoAlign: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (the MEA.01.t1 solution): line up the short ribbon, mark the part that sticks out (exactly
 * the 4 units past the short one's end), then pick the longer one.
 */
export const DemoAlignDifference: Story = {
  args: { disabled: true, demo: demoAlign },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoAlign.play({ op: 'align', args: { id: 'obj-0' } });
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0');
    await demoAlign.play({ op: 'highlight-difference' });
    const diff = root.querySelector('.ni-clen__diff') as HTMLElement;
    await expect(Number(diff.dataset.diffUnits)).toBe(4);
    await expect(diff.getBoundingClientRect().width).toBeCloseTo(4 * unitPx(root), 0);
    await demoAlign.play({ op: 'answer', args: { id: 'obj-1' } });
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(demoAlign.play({ op: 'drag' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
  },
};

const demoStrings: WidgetDemo = createDemoController({ strict: true });

/** Demo (MEA.07.t2): strings on both logs, then the answer. */
export const DemoStrings: Story = {
  args: { config: indirect, disabled: true, demo: demoStrings },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoStrings.play({ op: 'lay-string', args: { id: 'obj-1' } });
    await demoStrings.play({ op: 'lay-string', args: { id: 'obj-0' } });
    await expect(root.querySelectorAll('[data-string-row]')).toHaveLength(2);
    await demoStrings.play({ op: 'answer', args: { id: 'obj-1' } });
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
  },
};

const demoOrder: WidgetDemo = createDemoController({ strict: true });

/** Demo: `answer {values}` puts the badges on the objects in that order. */
export const DemoOrderAnswer: Story = {
  args: { config: orderPictorial, tier: 'pictorial', disabled: true, demo: demoOrder },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoOrder.play({ op: 'answer', args: { values: [9, 6, 3] } });
    for (const [lane, n] of [
      ['obj-0', '0'],
      ['obj-1', '1'],
      ['obj-2', '2'],
    ]) {
      await expect(root.querySelector(`[data-lane="${lane}"] .ni-clen__badge`)).toHaveAttribute(
        'data-badge',
        n,
      );
    }
  },
};

const inviteDemo: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the object to line up. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'align', args: { id: 'obj-0' } });
    await waitFor(() => expect(obj(root, 'obj-0')).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, obj(root, 'obj-0'), root);
    await expectHandStays(root, () => obj(root, 'obj-0'));
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: lining up is instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedDemo.play({ op: 'align', args: { id: 'obj-0' } });
    await expect(performance.now() - started).toBeLessThan(400);
    await expect(getComputedStyle(obj(root, 'obj-0')).transitionDuration).toBe('0s');
    await expectToScale(root, misaligned);
  },
};
