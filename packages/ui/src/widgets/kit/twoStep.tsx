import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import type { TraceRecorder } from '../../interaction/trace';
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, BackIcon } from '../../primitives/icons';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { overflow, type Size } from './arrange';
import { CheckButton, type PadKey } from './controls';
import { useOncePerKeyPress } from './keyPress';
import { type EntryLayout, entryGroups, entrySize, NumberEntry, padParts } from './NumberEntry';
import type { WidgetRoom } from './room';
import { Stepper } from './Stepper';
import './kit.css';

/**
 * A manipulative that is followed by a typed answer, in two steps (06 §1, §2: the widget area is
 * short, about 906 × 373 at the smallest landscape screen):
 *
 * 1. **build**: the manipulative has the whole room, with one action, Next;
 * 2. **ask**: a small, static picture of what was built, the kit `NumberEntry`, Back and Check.
 *
 * A widget whose picture is only read (no manipulative) shows the ask step alone (`back: false`).
 * The parts here are shared: the step state (`useTwoStep`), the actions (`StepActions`), the ask
 * step's plan (`planAsk`: which answer control, where the actions go, the box left for the
 * picture) and its frame (`AskStep`). The build step's layout is the widget's own: it plans
 * inside `buildRoom(room, button)`, the room less the action column.
 */

export type Step = 'build' | 'ask';

/** Between the parts of a step (the picture, the answer, the actions). */
export const STEP_GAP = 24;
/** Between two stacked action buttons (their 6 px ledge adds), and two in a row. */
export const ACT_GAP_Y = 16;
export const ACT_GAP_X = 24;
/** A host that grows with its content (a plain story stage) gets this height to plan in. */
export const UNBOUNDED_H = 560;

/** The measured room as a box to plan in (before the first measure: a tablet-sized guess). */
export function roomBox(room: WidgetRoom | null): Size {
  return {
    w: room?.width ?? 1178,
    h: room && Number.isFinite(room.height) ? room.height : UNBOUNDED_H,
  };
}

/** The build step's room: everything left of the action column (one button wide). */
export function buildRoom(room: Size, button: Size): Size {
  return { w: room.w - STEP_GAP - button.w, h: room.h };
}

export interface TwoStep {
  step: Step;
  /** The child's Next or Back: once per key press, traced (`next`, `back`), focus handed on. */
  goTo: (s: Step) => void;
  /** A demo's step change (no trace, no focus move). */
  show: (s: Step) => void;
}

/**
 * The step state. Next and Back replace each other, so the focus is handed from one to the other
 * and a held Enter acts once (`useOncePerKeyPress`).
 */
export function useTwoStep(
  rootRef: RefObject<HTMLElement | null>,
  opts: { interactive: boolean; trace: TraceRecorder },
): TwoStep {
  const [step, setStep] = useState<Step>('build');
  const oncePerPress = useOncePerKeyPress();
  const refocus = useRef<'next' | 'back' | null>(null);
  const goTo = (s: Step) => {
    if (!opts.interactive || !oncePerPress()) return;
    opts.trace('tap', s === 'ask' ? 'next' : 'back');
    const focused = document.activeElement?.closest('[data-cue]');
    refocus.current = focused ? (s === 'ask' ? 'back' : 'next') : null;
    setStep(s);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step's button is replaced
  useLayoutEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want) return;
    rootRef.current?.querySelector<HTMLElement>(`.ni-steps [data-cue="${want}"] button`)?.focus();
  }, [step]);
  return { step, goTo, show: setStep };
}

export type StepCue = 'next' | 'back' | 'check';

export interface StepActionsProps {
  /** Measured by `useActionSize` (the buttons carry `data-cue`). */
  actRef?: RefObject<HTMLDivElement | null>;
  /** `build`: Next. `ask`: Back (when `back`) and Check. */
  step: Step;
  /** Whether the ask step has a build step to go back to. */
  back: boolean;
  dir?: 'row' | 'column';
  interactive: boolean;
  /** Whether Check has something to send. */
  ready: boolean;
  onStep: (s: Step) => void;
  onCheck: () => void;
  /** The demo's one ring. */
  invited?: StepCue | null;
  /** Icon-only buttons (their labels stay their names and are spoken), for a short room. */
  compact?: boolean;
}

/** A room this short gets the compact actions (the 906 × 373 widget area is 319 px inside). */
export const COMPACT_ROOM_H = 400;

export function StepActions({
  actRef,
  step,
  back,
  dir = 'column',
  interactive,
  ready,
  onStep,
  onCheck,
  invited = null,
  compact = false,
}: StepActionsProps) {
  const stepClass = (cue: StepCue) =>
    [compact ? 'ni-check--compact' : '', invited === cue ? 'ni-invite' : '']
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="ni-steps" ref={actRef} data-dir={dir} data-step={step}>
      {step === 'build' ? (
        <span className="ni-steps__btn" data-cue="next">
          <BigButton
            label="ui.btn.next"
            icon={<ArrowIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => onStep('ask')}
            showLabel={compact ? false : undefined}
            className={stepClass('next')}
          />
        </span>
      ) : null}
      {step === 'ask' && back ? (
        <span className="ni-steps__btn" data-cue="back">
          <BigButton
            label="ui.btn.close"
            icon={<BackIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => onStep('build')}
            showLabel={compact ? false : undefined}
            className={stepClass('back')}
          />
        </span>
      ) : null}
      {step === 'ask' ? (
        <span className="ni-steps__btn" data-cue="check">
          <CheckButton
            onPress={onCheck}
            disabled={!interactive || !ready}
            invited={invited === 'check'}
            compact={compact}
          />
        </span>
      ) : null}
    </div>
  );
}

/** The actions' box: `n` buttons of one size in a row or a column. */
export const actionsSize = (button: Size, n: number, dir: 'row' | 'column'): Size =>
  dir === 'row'
    ? { w: n * button.w + (n - 1) * ACT_GAP_X, h: button.h }
    : { w: button.w, h: n * button.h + (n - 1) * ACT_GAP_Y };

/** The largest answer the one-more / one-less `Stepper` is offered for. */
export const STEPPER_MAX = 20;
/** The stepper's box: the number over its two keys (stepper.css). */
export function stepperSize(ageMode: AgeMode): Size {
  const t = MIN_TARGET_PX[ageMode];
  return { w: 2 * t + TARGET_GAP_PX, h: Math.max(t, 100) + TARGET_GAP_PX + t };
}

/** How the ask step's parts are arranged: all in one row, or the picture above the rest. */
export type AskArrangement = 'row' | 'stack';

export interface AskPlan {
  arrangement: AskArrangement;
  /** The `NumberEntry` layout (null: the widget's own answer control, `AskInput.control`). */
  entry: EntryLayout | null;
  /**
   * The answer is the kit `Stepper` (one more, one less): where neither the numeral tray nor the
   * pad leaves room for a legible picture (kindergarten sizes in a short room), for answers up to
   * `STEPPER_MAX`.
   */
  stepper: boolean;
  /**
   * The actions in a row or a column after the answer control, or `aside`: under the entered
   * number, beside the pad's keys (the widget passes them to `NumberEntry` as `aside`).
   */
  act: 'row' | 'column' | 'aside';
  /** The box the picture may use (null: no legible picture fits; Back returns to the build). */
  picture: Size | null;
  /** Whether everything fits the room (false: the least overflowing plan). */
  fits: boolean;
}

export interface AskInput {
  ageMode: AgeMode;
  /** The largest number the answer control offers (0 … max). */
  max: number;
  /** The widget's own answer control (two choice cards, say) instead of a `NumberEntry`. */
  control?: Size;
  /** One action button, as measured (`useActionSize`). */
  button: Size;
  /** Back and Check (2) or Check alone (1). */
  actions: 1 | 2;
  room: Size;
  /**
   * How well the widget's picture can be drawn in `box`: 0 when it is not legible there,
   * otherwise larger is better (for example the size of one item).
   */
  pictureScore: (box: Size) => number;
}

/** Whether key `a` sorts strictly before `b` (compared entry by entry; equal keys: no). */
function before(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d < 0;
  }
  return false;
}

/**
 * The ask step's plan. Every candidate keeps the answer control and the actions at full size and
 * gives the picture what is left. A legible picture wins over none; then the numeral tray over
 * the compact tray over the number pad (`entryGroups`); then the best picture.
 */
export function planAsk(input: AskInput): AskPlan {
  const { room, button } = input;
  let best: { plan: AskPlan; key: number[] } | null = null;
  let least: { plan: AskPlan; over: number } | null = null;
  const numeric: (EntryLayout | null)[][] = entryGroups(input.max);
  const groups: (EntryLayout | null)[][] = input.control
    ? [[null]]
    : [...numeric, ...(input.max <= STEPPER_MAX ? [[null]] : [])];
  for (const [g, group] of groups.entries()) {
    const stepper = !input.control && g === numeric.length;
    for (const entry of group) {
      if (!entry && !input.control && !stepper) continue;
      const e = entry
        ? entrySize(input.max, entry, input.ageMode)
        : stepper
          ? stepperSize(input.ageMode)
          : (input.control as Size);
      for (const arrangement of ['row', 'stack'] as const) {
        for (const act of ['column', 'row', 'aside'] as const) {
          const aside = act === 'aside';
          if (aside && !(entry?.kind === 'pad' && entry.padLayout === 'beside')) continue;
          const a = actionsSize(button, input.actions, aside ? 'column' : act);
          const pad = aside ? padParts(input.max, entry?.compact ?? false, input.ageMode) : null;
          const fixed: Size = pad
            ? {
                w: Math.max(pad.display.w, a.w) + pad.gap + pad.keys.w,
                h: Math.max(pad.keys.h, pad.display.h + ACT_GAP_Y + a.h),
              }
            : { w: e.w + STEP_GAP + a.w, h: Math.max(e.h, a.h) };
          const box: Size =
            arrangement === 'row'
              ? { w: room.w - fixed.w - STEP_GAP, h: room.h }
              : { w: room.w, h: room.h - fixed.h - STEP_GAP };
          const over = overflow(fixed, room);
          const plan = (picture: Size | null): AskPlan => ({
            arrangement,
            entry,
            stepper,
            act,
            picture,
            fits: over === 0,
          });
          if (over > 0) {
            if (!least || over < least.over) least = { plan: plan(null), over };
            continue;
          }
          const score = box.w > 0 && box.h > 0 ? input.pictureScore(box) : 0;
          // Lower is better: no picture last, then the entry group, then the bigger picture.
          const key = [score > 0 ? 0 : 1, g, -score];
          if (!best || before(key, best.key)) {
            best = { plan: plan(score > 0 ? box : null), key };
          }
        }
      }
    }
  }
  if (best) return best.plan;
  if (least) return least.plan;
  throw new Error('no answer layout');
}

export interface AskEntryProps {
  plan: AskPlan;
  /** The largest number the answer control offers (the `max` the plan was made for). */
  max: number;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** Demo highlight: a numeral card (tray) or a key (pad). */
  highlighted?: number | PadKey | null;
  trace?: TraceRecorder;
  /** Desktop Enter on the pad (the widget's check). */
  onEnter?: () => void;
  /** The widget's `StepActions`: drawn under the entered number when the plan's act is `aside`. */
  actions: ReactNode;
}

/**
 * The ask step's numeric answer control as planned: the kit `NumberEntry` (tray or pad), or the
 * `Stepper`. Trace targets: `opt-<n>`, `key-<k>`, `step-more`, `step-less`.
 */
export function AskEntry({
  plan,
  max,
  value,
  onChange,
  disabled,
  highlighted = null,
  trace,
  onEnter,
  actions,
}: AskEntryProps) {
  if (plan.stepper) {
    return (
      <Stepper
        value={value}
        onChange={onChange}
        max={max}
        disabled={disabled}
        highlighted={highlighted === null ? null : 'more'}
        onPress={(key) => trace?.('tap', `step-${key}`)}
      />
    );
  }
  if (!plan.entry) return null;
  return (
    <NumberEntry
      {...plan.entry}
      max={max}
      value={value}
      onChange={onChange}
      disabled={disabled}
      highlighted={highlighted}
      trace={trace}
      captureKeyboard={plan.entry.kind === 'pad'}
      onEnter={onEnter}
      aside={plan.act === 'aside' ? actions : undefined}
    />
  );
}

export interface AskStepProps {
  plan: AskPlan;
  /** The widget's static picture, drawn to fit `plan.picture` (omitted when that is null). */
  picture: ReactNode;
  /** The widget's `NumberEntry` (in `plan.entry`). */
  entry: ReactNode;
  /** The widget's `StepActions` (in `plan.act`; with `aside` the entry holds them). */
  actions: ReactNode;
}

/** The ask step's frame: the picture, the answer control and the actions as planned. */
export function AskStep({ plan, picture, entry, actions }: AskStepProps) {
  return (
    <div className="ni-ask" data-arrangement={plan.arrangement}>
      {plan.picture ? (
        <div
          className="ni-ask__picture"
          style={{ maxWidth: plan.picture.w, maxHeight: plan.picture.h }}
        >
          {picture}
        </div>
      ) : null}
      <div className="ni-ask__answer">
        {entry}
        {plan.act === 'aside' ? null : actions}
      </div>
    </div>
  );
}
