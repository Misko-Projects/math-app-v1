import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectHandsLeaveNumerals, expectNumeralsSolid } from '../../test-support/clockChecks';
import { expectControls, expectOneInvite } from '../../test-support/controlChecks';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { expectFitsArea, inArea } from '../../test-support/widgetArea';
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
 * `clock-set` (03 §5.5, concrete): turn the geared hands to a time. Configs are real generated
 * items (`generateItem(template, seed)` on the compiled #84 TIM templates).
 */

/** TIM.04.t1 seed 4: set 8:30 (spoken), no digital readout. */
const eightThirty: ConfigFor<'clock-set'> = {
  format: 'clock-set',
  target: { h: 8, m: 30 },
  start: { h: 12, m: 0 },
  precision: 5,
  showDigital: false,
  prompt: 'spoken',
};

/** TIM.01.t2 seed 2: match the digital clock 11:00, with the hands' readout. */
const matchDigital: ConfigFor<'clock-set'> = {
  format: 'clock-set',
  target: { h: 11, m: 0 },
  start: { h: 12, m: 0 },
  precision: 5,
  showDigital: true,
  prompt: 'digital',
};

/** TIM.09.t1 seed 2: set 5:30, with the readout. */
const fiveThirty: ConfigFor<'clock-set'> = {
  format: 'clock-set',
  target: { h: 5, m: 30 },
  start: { h: 12, m: 0 },
  precision: 5,
  showDigital: true,
  prompt: 'spoken',
};

const meta = {
  title: 'Widgets/Clock set',
  args: {
    config: eightThirty as WidgetConfig,
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

const ROOT = '.ni-cset';
const pad = (root: HTMLElement) => root.querySelector('.ni-cset__pad') as HTMLElement;
const handBtn = (root: HTMLElement, h: 'hour' | 'minute') =>
  root.querySelector(`.ni-cset__handbtn[data-hand="${h}"]`) as HTMLElement;
const hand = (root: HTMLElement, h: 'hour' | 'minute') =>
  root.querySelector(`.ni-clock__hand[data-hand="${h}"]`) as SVGGElement;
const shown = (root: HTMLElement) =>
  (root.querySelector('.ni-clock') as SVGSVGElement).getAttribute('data-time');

/** Maths truth: the hands agree with the one time the clock shows (geared, 03 §5.5). */
async function expectGeared(root: HTMLElement, h: number, m: number) {
  await expect(shown(root)).toBe(`${h}:${String(m).padStart(2, '0')}`);
  await expect(root.dataset.time).toBe(`${h}:${String(m).padStart(2, '0')}`);
  await expect(Number(hand(root, 'hour').dataset.angle)).toBeCloseTo((h % 12) * 30 + m * 0.5, 2);
  await expect(Number(hand(root, 'minute').dataset.angle)).toBeCloseTo(m * 6, 2);
  // The readout (when shown) says what the hands say.
  const yours = root.querySelector('[data-card="yours"] .ni-digital');
  if (yours) await expect(yours.getAttribute('data-time')).toBe(shown(root));
}

/** A point on the face: `deg` clockwise from 12, `r` px from the centre. */
function facePoint(root: HTMLElement, deg: number, r: number) {
  const b = pad(root).getBoundingClientRect();
  const a = (deg * Math.PI) / 180;
  return { x: b.left + b.width / 2 + r * Math.sin(a), y: b.top + b.height / 2 - r * Math.cos(a) };
}

let pointerSeq = 40;
/** Turns a hand: press at `from`° (`r` px out), move round to `to`° in small steps, release. */
async function turn(
  root: HTMLElement,
  r: number,
  from: number,
  to: number,
  pointerType: 'mouse' | 'touch',
) {
  const el = pad(root);
  const pointerId = pointerType === 'mouse' ? 1 : ++pointerSeq;
  const ev = (type: string, deg: number, buttons: number) => {
    const p = facePoint(root, deg, r);
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType,
      isPrimary: true,
      clientX: p.x,
      clientY: p.y,
      button: 0,
      buttons,
    });
  };
  el.dispatchEvent(ev('pointerdown', from, 1));
  const steps = Math.max(4, Math.ceil(Math.abs(to - from) / 10));
  for (let i = 1; i <= steps; i++) {
    el.dispatchEvent(ev('pointermove', from + ((to - from) * i) / steps, 1));
    await new Promise<void>((res) => requestAnimationFrame(() => res()));
  }
  el.dispatchEvent(ev('pointerup', to, 0));
  await new Promise<void>((res) => requestAnimationFrame(() => res()));
}

/** Taps the face at `deg`° clockwise from 12. */
async function tapFace(root: HTMLElement, deg: number, r = 110) {
  const p = facePoint(root, deg, r);
  await userEvent.pointer({
    keys: '[MouseLeft]',
    target: pad(root),
    coords: { clientX: p.x, clientY: p.y },
  });
}

/**
 * Tap-to-place: tap "the long hand" (it is named and lights up), tap the 6: 12:30. Tap "the short
 * hand", tap halfway between 8 and 9: 8:30, the long hand still at 6. Sizes: the hand buttons and
 * the face ≥ 64 px, ≥ 12 px apart.
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectGeared(root, 12, 0);
    const targets = [handBtn(root, 'minute'), handBtn(root, 'hour'), pad(root)];
    for (const el of targets) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps([handBtn(root, 'minute'), handBtn(root, 'hour')]);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();

    await userEvent.click(handBtn(root, 'minute'));
    await expect(audio.say).toHaveBeenLastCalledWith('ui.clock.long-hand', undefined);
    await expect(hand(root, 'minute')).toHaveAttribute('data-lit', 'true');
    await tapFace(root, 180);
    await expectGeared(root, 12, 30);
    await userEvent.click(handBtn(root, 'hour'));
    await tapFace(root, 255, 50);
    await expectGeared(root, 8, 30);
    await expect(Number(hand(root, 'hour').dataset.angle)).toBe(255);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { h: 8, m: 30 } });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:hand-minute',
      'tap:face',
      'tap:hand-hour',
      'tap:face',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Drag: turn the long hand round from 12 to 3 (12:15), then on round past 12 to 1 (1:05: the short
 * hand moved on an hour by itself). Turn the short hand a quarter turn by touch: three hours on,
 * the long hand wound round with it (4:05). At every stop the hands agree.
 */
export const DragGeared: Story = {
  args: { config: fiveThirty },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await turn(root, 115, 0, 90, 'mouse');
    await expectGeared(root, 12, 15);
    await turn(root, 115, 90, 390, 'mouse');
    await expectGeared(root, 1, 5);
    await turn(root, 35, 30, 120, 'touch');
    await expectGeared(root, 4, 5);
    // And back past 12 the other way: the long hand from 1 back to 11 rewinds an hour.
    await turn(root, 115, 30, -30, 'touch');
    await expectGeared(root, 3, 55);
    await expectNumeralsSolid(root.querySelector('.ni-clock') as SVGSVGElement);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { h: 3, m: 55 } });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'drag:hand-minute',
      'drop:face',
      'drag:hand-minute',
      'drop:face',
      'drag:hand-hour',
      'drop:face',
      'drag:hand-minute',
      'drop:face',
    ]);
  },
};

/**
 * Keyboard: the long hand's button turns it five minutes an arrow (back past 12 rewinds the
 * hour); the short hand's an hour. Enter chooses a hand and moves focus to the face.
 */
export const Keyboard: Story = {
  args: { config: matchDigital },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    handBtn(root, 'minute').focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await expectGeared(root, 12, 15);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await expectGeared(root, 11, 55);
    await userEvent.keyboard('{ArrowRight}');
    await expectGeared(root, 12, 0);
    handBtn(root, 'hour').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expectGeared(root, 11, 0);
    await userEvent.keyboard('{Enter}');
    await expect(document.activeElement).toBe(pad(root));
    await userEvent.keyboard('{Escape}');
    await expect(root.querySelector('[data-card="target"] .ni-digital')).toHaveAttribute(
      'data-time',
      '11:00',
    );
    within(root).getByRole('button', { name: 'Check' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { h: 11, m: 0 } });
    await expect(traceOf(args.onInteract).map((e) => e.t)).toContain('move');
  },
};

/**
 * A press takes hold of the hand under it, wherever along the hand. At 3:00 the long hand points
 * up: pressed near the middle (40 px out, inside the short hand's zone) and turned to the 3, it is
 * the long hand that turns (3:15). The short hand held by its tip (60 px out) turns the hour. Off
 * the hands, the middle still turns the short hand and the ring the long one.
 */
export const GrabAHandWhereItSits: Story = {
  args: { config: { ...fiveThirty, start: { h: 3, m: 0 } } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectGeared(root, 3, 0);
    // The long hand, held near the middle, to the 3.
    await turn(root, 40, 0, 90, 'touch');
    await expectGeared(root, 3, 15);
    // The short hand (now a little past the 3, at 97.5°), held by its tip, on to the 5.
    await turn(root, 60, 97.5, 157.5, 'touch');
    await expectGeared(root, 5, 15);
    // Off both hands: the middle turns the short hand (back two hours), the ring the long one.
    await turn(root, 40, 300, 240, 'mouse');
    await expectGeared(root, 3, 15);
    await turn(root, 115, 200, 180, 'mouse');
    await expectGeared(root, 3, 10);
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'drag:hand-minute',
      'drop:face',
      'drag:hand-hour',
      'drop:face',
      'drag:hand-hour',
      'drop:face',
      'drag:hand-minute',
      'drop:face',
    ]);
  },
};

/**
 * A hand is its own undo: turned back where it was (by finger, or by the arrow keys on its
 * button) the clock shows the start time again, the readout follows, and the answer sent is what
 * the hands show. Each turn is traced.
 */
export const TurnBack: Story = {
  args: { config: fiveThirty },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await turn(root, 115, 0, 180, 'touch');
    await expectGeared(root, 12, 30);
    await turn(root, 115, 180, 0, 'touch');
    await expectGeared(root, 12, 0);
    handBtn(root, 'hour').focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expectGeared(root, 2, 0);
    await userEvent.keyboard('{ArrowLeft}');
    await expectGeared(root, 1, 0);
    handBtn(root, 'minute').focus();
    await userEvent.keyboard('{ArrowRight}');
    await expectGeared(root, 1, 5);
    await userEvent.keyboard('{ArrowLeft}');
    await expectGeared(root, 1, 0);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { h: 1, m: 0 } });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'drag:hand-minute',
      'drop:face',
      'drag:hand-minute',
      'drop:face',
      'move:hand-hour',
      'move:hand-hour',
      'move:hand-hour',
      'move:hand-minute',
      'move:hand-minute',
    ]);
  },
};

/**
 * The digital readouts are in the accessibility tree by their time (PR #101 review 1): the time
 * to make, the elapsed prompt's start time, and the hands' own reading, which follows an
 * arrow-key turn (it is a polite live region, so the new time is announced).
 */
export const DigitalReadoutsAreNamed: Story = {
  args: { config: matchDigital },
  render: (args) => (
    <div style={{ display: 'grid', gap: 24 }}>
      {renderWidget(args)}
      {renderWidget({
        ...args,
        config: {
          format: 'clock-set',
          target: { h: 15, m: 30 },
          start: { h: 12, m: 0 },
          precision: 5,
          showDigital: true,
          prompt: 'elapsed',
          elapsed: { from: { h: 14, m: 45 }, minutes: 45 },
        } as WidgetConfig,
      })}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const roots = await waitFor(() => {
      const els = [...canvasElement.querySelectorAll<HTMLElement>(ROOT)];
      if (els.length < 2) throw new Error('no widgets yet');
      return els;
    });
    const [digital, elapsed] = roots as [HTMLElement, HTMLElement];
    const card = (root: HTMLElement, name: string) =>
      root.querySelector(`[data-card="${name}"]`) as HTMLElement;
    // "Make this time" is followed by the time itself.
    await expect(card(digital, 'target')).toHaveTextContent('Make this time');
    await expect(within(card(digital, 'target')).getByRole('img', { name: '11:00' })).toBeVisible();
    await expect(within(card(digital, 'yours')).getByRole('img', { name: '12:00' })).toBeVisible();
    await expect(card(digital, 'yours')).toHaveAttribute('aria-live', 'polite');
    // An arrow-key turn: the reading's name is the new time.
    handBtn(digital, 'minute').focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(within(card(digital, 'yours')).getByRole('img', { name: '12:05' })).toBeVisible();
    handBtn(digital, 'hour').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(within(card(digital, 'yours')).getByRole('img', { name: '11:05' })).toBeVisible();
    // The elapsed prompt: its start time is named too (2:45, the face hour of 14:45).
    await expect(within(card(elapsed, 'elapsed')).getByRole('img', { name: '2:45' })).toBeVisible();
    await expect(card(elapsed, 'elapsed')).toHaveTextContent('Add 45 minutes');
    // No readout is hidden from the tree.
    for (const el of canvasElement.querySelectorAll('.ni-cset__card .ni-digital')) {
      await expect(el).not.toHaveAttribute('aria-hidden');
    }
  },
};

/** Tapping the face with no hand chosen says the number nearest the tap (06 §5). */
export const TapNumberSpeaks: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await tapFace(root, 92);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 3 }]);
    await tapFace(root, 2);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 12 }]);
    // A tap is not a move: the hands stay put.
    await expectGeared(root, 12, 0);
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual([
      'numeral-3',
      'numeral-12',
    ]);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(handBtn(root, 'minute'));
    await turn(root, 115, 0, 90, 'mouse');
    await expectGeared(root, 12, 0);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (#84's solution): light the long hand, sweep it to 6 (12:30), light the short hand and
 * sweep it to 3: 3:30, the short hand exactly halfway between 3 and 4. Then count the long hand's
 * way by fives, and invite the child to turn the long hand.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight-hand', args: { hand: 'minute' } });
    await demoController.play({ op: 'drag-minute', args: { to: 30 } });
    await expectGeared(root, 12, 30);
    await demoController.play({ op: 'highlight-hand', args: { hand: 'hour' } });
    await demoController.play({ op: 'drag-hour', args: { to: 3 } });
    await expectGeared(root, 3, 30);
    await expect(Number(hand(root, 'hour').dataset.angle)).toBe(105);
    clearSpies(audio);
    await demoController.play({ op: 'count-fives', args: { from: 0, to: 30 } });
    const counted = (audio.sayPhrases.mock.calls as unknown as [{ number: number }[]][]).map(
      ([p]) => p[0]?.number,
    );
    await expect(counted).toEqual([5, 10, 15, 20, 25, 30]);
    await expect(demoController.play({ op: 'point-hour' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'drag-minute', args: { to: 45 } });
    await waitFor(() => expect(root.querySelector('.ni-cset__handbtn.ni-invite')).not.toBeNull());
    await expect(hand(root, 'minute')).toHaveAttribute('data-lit', 'true');
    await expectPointerOn(
      root.querySelector('.ni-invite-hand') as HTMLElement,
      handBtn(root, 'minute'),
      root,
    );
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: the hands jump straight to the time (no sweep). */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fiveThirty, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Every angle the long hand is drawn at while the demo plays: with no sweep it is only ever
    // where it started (12) or where it lands (6), never a frame in between.
    const seen = new Set<number>();
    const long = hand(root, 'minute');
    const watch = new MutationObserver(() => seen.add(Number(hand(root, 'minute').dataset.angle)));
    watch.observe(long.parentElement ?? long, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-angle'],
    });
    await reducedController.play({ op: 'drag-minute', args: { to: 30 } });
    await reducedController.play({ op: 'drag-hour', args: { to: 5 } });
    watch.disconnect();
    await expect([...seen].filter((a) => a !== 0 && a !== 180)).toEqual([]);
    // Reduced motion is judged by its effect, not by a stopwatch: no glide, pop or sweep was
    // started (a control's own colour transition is not motion).
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)),
    ).toHaveLength(0);
    await expectGeared(root, 5, 30);
  },
};

/** Tablet area: the digital card to match and the readout, no scroll. */
export const TabletArea: Story = {
  args: { config: matchDigital },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
  },
};

/**
 * The densest clock-set, in the smallest area: an elapsed prompt (the start time and the longest
 * "add … minutes" line, `CLOCK_ELAPSED_MAX`) with the hands' own readout, at single-minute
 * precision. Nothing clips or scrolls, the readout says what the hands show, and the hands still
 * turn to the minute (two minutes back past 12 rewinds the hour).
 */
export const ElapsedDensestLandscapeMin: Story = {
  args: {
    config: {
      format: 'clock-set',
      target: { h: 11, m: 58 },
      start: { h: 12, m: 0 },
      precision: 1,
      showDigital: true,
      prompt: 'elapsed',
      elapsed: { from: { h: 11, m: 59 }, minutes: 719 },
    },
  },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('[data-card="elapsed"]')).toHaveTextContent('719');
    await expectFitsArea(canvasElement, root);
    await turn(root, 115, 0, -12, 'touch');
    await expectGeared(root, 11, 58);
    await expectFitsArea(canvasElement, root);
  },
};

/** The smallest landscape area, both cards: no scroll. */
export const LandscapeMinArea: Story = {
  args: { config: matchDigital },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
    await turn(root, 115, 0, 330, 'touch');
    await expectGeared(root, 12, 55);
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo invite (03 §6.3): Pip invites the child to turn the long hand: its button is ringed (the hand on the clock glows) and Pip's hand hangs under it. The story ends in the invited state, so the settled
 * picture shows the ring and the hand.
 */
export const DemoInvite: Story = {
  args: { disabled: true, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'drag-minute', args: { to: 30 } });
    await waitFor(() => expect(root.querySelector('.ni-cset__handbtn.ni-invite')).not.toBeNull());
    await waitFor(() => expect(root.querySelector('.ni-invite-hand')).not.toBeNull());
    const hand = root.querySelector('.ni-invite-hand') as HTMLElement;
    await expect(hand).toBeVisible();
    await expectPointerOn(
      hand,
      root.querySelector('.ni-cset__handbtn.ni-invite') as HTMLElement,
      root,
    );
    await expectOneInvite(root);
    // The invited hand glows; the glow leaves the number it points at (12) readable.
    await expect(root.querySelector('.ni-clock__hand[data-lit="true"]')).not.toBeNull();
    await expectHandsLeaveNumerals(root.querySelector('.ni-clock') as SVGSVGElement);
  },
};

/**
 * Evidence audit (06 §4): in K every control is at least 80 px both ways and 12 px from every
 * other control.
 */
export const SizesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: matchDigital },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectControls(root, 'k');
  },
};

/** Evidence audit: in G1+ every control is at least 64 px both ways and 12 px apart. */
export const SizesG1: Story = {
  args: { config: matchDigital },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectControls(root, 'g1-up');
  },
};
