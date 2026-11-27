// The workshop screen every workshop shares (06 §2 workshop layout), without the runner: the
// frame, the item's row of controls and the widget in the workshop area. `RequestPlay` plays a
// request in it; the fit check (`practice-pier/pierFit.browser.test.tsx`) renders every template
// in it and measures the area. A themed workshop names itself on the frame (`workshop`) and puts
// what it has made in the bottom row (`bottom`), which is as tall as the pier's.
//
// After a wrong answer (06 §6, #20 part 2) the cue is at the widget: the workshop area sways once
// and takes a sunshine edge with a look-again badge on it. The line being spoken (the feedback,
// a hint, a step of the worked solution) takes the prompt's place in the bubble while it plays.
// A hint's picture is a card over the area, and the lightbulb asks for the next hint.
//
// A lesson step (03 §6, #20 part 3) plays in the same frame: the step's line in the bubble, the
// example's widget driven in demo mode, a speaker that says the step again, and from grade 1 "I can try".
// On the child's turn the widget takes input; nothing points at the answer.

import type {
  InteractionEvent,
  NarrationKey,
  PresentedItem,
  ResponseValue,
  StimulusSpec,
  Tier,
  WidgetConfig,
  WorkshopId,
} from '@number-island/shared';
import {
  BigButton,
  Guide,
  HintButton,
  HomeButton,
  icons,
  ReplayButton,
  SpeechBubble,
  useGuide,
  useNarrationText,
  VisuallyHidden,
  type WidgetDemo,
  WidgetHost,
} from '@number-island/ui';
import { lazy, type ReactNode, Suspense } from 'react';
import { storyBeingTold } from './tellItem';

// Only a representation hint shows a picture. It is drawn by the widget kit, whose code (and the
// engine's item core under it, loaded at boot, 02 §6a) the widgets already share: it is a chunk of
// its own beside the runner, not part of a workshop's chunk.
const HintPicture = lazy(() => import('@/runner/HintPicture'));

export type Cue = { kind: 'right' | 'again' | 'onward'; say: NarrationKey | undefined };

export type Phase =
  | 'prompt' // the prompt is being spoken; no input yet
  | 'answer' // item ready: the widget takes input
  | 'checking' // an answer is being checked and written
  | 'hint' // a feedback line, a hint or the worked solution is playing; no input
  | 'lesson' // a lesson step is being shown; no input
  | 'turn' // the child's turn in a faded example: the widget takes input
  | 'feedback'; // resolved: "next" moves on

/** A line being spoken in place of the prompt. */
export interface SpokenLine {
  say: NarrationKey;
  vars?: Record<string, string | number>;
}

/** What the workshop area shows: an item, or the example of a lesson step with the step's line. */
export interface PierStage {
  widget: WidgetConfig;
  prompt: { narration: NarrationKey; vars?: Record<string, string | number> };
}

/** The lesson's own controls, while a lesson step is on screen. */
export interface LessonControls {
  /** The speaker: the current step's line once more. */
  onReplay: () => void;
  /** "I can try" (grade 1 up, 03 §6.2); null when not on offer. */
  onSkip: (() => void) | null;
}

/** One item on screen: Home, the prompt, the cue and "next", the widget, the request's beads. */
/**
 * The guide's height in the play header (05 §1): inside the header row's own 96 px, so the widget
 * area keeps every pixel it had.
 */
const GUIDE_IN_HEADER = 88;

export function PlayItemScreen({
  workshop,
  bottom,
  item,
  lesson = null,
  tier,
  itemKey,
  phase,
  cue,
  line = null,
  picture = null,
  demo,
  progress,
  onLeave,
  onNext,
  onHint,
  onReplayPrompt,
  onClosePicture,
  onWidgetMount,
  onResponse,
  onInteract,
}: {
  /** A themed workshop's id, on the frame. */
  workshop?: WorkshopId;
  /** The bottom row, in place of the beads alone. */
  bottom?: ReactNode;
  /** Null while the request loads. */
  item: PresentedItem | PierStage | null;
  /** Set while a lesson step is on screen. */
  lesson?: LessonControls | null;
  tier: Tier;
  itemKey: number | string;
  phase: Phase;
  cue: Cue | null;
  /** The line playing now (feedback, hint or solution step); null shows the prompt. */
  line?: SpokenLine | null;
  /** A representation hint's picture, shown over the workshop area until closed. */
  picture?: StimulusSpec | null;
  /** Drives the widget for a hint's actions and the worked solution. */
  demo?: WidgetDemo;
  progress: { done: number; total: number };
  onLeave: () => void;
  onNext: () => void;
  /** The lightbulb: the next hint. Shown while the item takes an answer. */
  onHint?: () => void;
  /**
   * Brings the item's instruction back: said again, and back in the bubble in place of the
   * hint's line. While a hint's line has the bubble, this speaker is the way back to the
   * instruction (06 §5: every instruction has a replay).
   */
  onReplayPrompt?: () => void;
  onClosePicture?: () => void;
  /** An item's widget is mounted: its code is loaded and it is on screen. */
  onWidgetMount?: () => void;
  onResponse: (response: ResponseValue) => void;
  onInteract: (event: InteractionEvent) => void;
}) {
  const guide = useGuide();
  return (
    <PlayFrame
      testId="pier"
      workshop={workshop}
      phase={item ? phase : 'loading'}
      lookAgain={cue?.kind === 'again'}
      over={
        picture &&
        picture.kind !== 'none' && (
          <Suspense fallback={null}>
            <HintPicture spec={picture} onClose={onClosePicture ?? (() => {})} />
          </Suspense>
        )
      }
      top={
        <>
          <HomeButton onPress={onLeave} />
          {item && (
            // While a story is being told the bubble takes no touch: nothing speaks over the
            // story (`storyBeingTold`). The child's guide says the prompt (05 §1): it stands in
            // the header's own height, and the bubble's tail points at it.
            <div
              className="flex min-w-0 flex-1 items-center gap-1"
              inert={storyBeingTold(phase, item)}
              data-telling={storyBeingTold(phase, item) ? 'true' : undefined}
            >
              <Guide
                guide={guide}
                mood={phase === 'lesson' ? 'point' : line ? 'cheer' : 'talk'}
                height={GUIDE_IN_HEADER}
                className="shrink-0"
              />
              {line ? (
                <SpeechBubble say={line.say} vars={line.vars} tail="left" tone="sun" />
              ) : (
                <SpeechBubble say={item.prompt.narration} vars={item.prompt.vars} tail="left" />
              )}
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-4">
            {item && line && phase === 'answer' && onReplayPrompt && !picture && (
              <ReplayButton onPress={onReplayPrompt} />
            )}
            {item && lesson && <ReplayButton onPress={lesson.onReplay} />}
            {item && lesson?.onSkip && phase === 'lesson' && (
              <BigButton
                label="ui.lesson.try"
                icon={<icons.ArrowIcon tone="light" />}
                tone="sun"
                showLabel
                onPress={lesson.onSkip}
              />
            )}
            <CueBadge cue={cue} />
            {item && phase === 'answer' && onHint && !picture && <HintButton onPress={onHint} />}
            {phase === 'feedback' && (
              <BigButton
                label="ui.btn.next"
                icon={<icons.ArrowIcon tone="light" />}
                tone="leaf"
                onPress={onNext}
              />
            )}
          </div>
        </>
      }
      bottom={bottom ?? <Beads done={progress.done} total={progress.total} />}
    >
      {item && (
        <WidgetHost
          className="size-full"
          config={item.widget}
          tier={tier}
          itemKey={itemKey}
          disabled={(phase !== 'answer' && phase !== 'turn') || Boolean(picture)}
          demo={demo}
          onWidgetMount={onWidgetMount}
          onResponse={onResponse}
          onInteract={onInteract}
        />
      )}
    </PlayFrame>
  );
}

/** The workshop frame: a top row, the widget area (a bounded box the widget measures) and a bottom row. */
export function PlayFrame({
  top,
  bottom,
  testId,
  workshop,
  phase,
  lookAgain = false,
  over,
  children,
}: {
  top: ReactNode;
  bottom?: ReactNode;
  testId: string;
  workshop?: WorkshopId;
  /** Where the item on screen is (tests wait on it instead of on time). */
  phase?: string;
  /** The look-again cue at the widget (06 §6: a diegetic cue, never a red X). */
  lookAgain?: boolean;
  /** A card over the workshop area. */
  over?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="grid h-dvh min-h-[600px] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden bg-sand px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid={testId}
      data-workshop={workshop}
      data-phase={phase}
    >
      <header className="flex min-h-24 items-center gap-4">{top}</header>
      <div className="relative grid min-h-0 grid-rows-[minmax(0,1fr)]">
        <main
          // The edge is a ring, not a wider border: the widget keeps its room and does not move.
          // `ni-mat` draws the felt and its stitch without changing the content box.
          className={`ni-mat relative grid min-h-0 overflow-auto rounded-card border-[3px] p-6 ${
            lookAgain
              ? 'border-wood-deep ring-[6px] ring-sunshine motion-safe:animate-[ni-wiggle_450ms_ease-in-out_1]'
              : 'border-sand-deep'
          }`}
          data-testid="pier-stage"
          data-look-again={lookAgain ? 'true' : undefined}
        >
          {children}
        </main>
        {lookAgain && (
          <span
            aria-hidden="true"
            data-testid="pier-stage-cue"
            className="pointer-events-none absolute top-0 left-1/2 z-20 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-wood-deep bg-sunshine-light"
          >
            <span className="size-7">
              <LookAgainIcon />
            </span>
          </span>
        )}
        {over}
      </div>
      <footer className="flex min-h-7 items-center justify-center">{bottom}</footer>
    </div>
  );
}

/** Progress through the request: one bead per item, filled when done (shape and fill, not colour alone). */
export function Beads({ done, total }: { done: number; total: number }) {
  const label = useNarrationText()('ui.pier.progress');
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="flex items-center gap-2"
      data-testid="pier-progress"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: beads have no identity beyond their place
          key={i}
          aria-hidden="true"
          className="ni-bead"
          data-done={i < done ? 'true' : undefined}
        />
      ))}
    </div>
  );
}

const CUE_TONE: Record<Cue['kind'], string> = {
  right: 'bg-leaf border-leaf-deep',
  again: 'bg-sunshine-light border-wood-deep',
  onward: 'bg-sky border-sea-deep',
};

/** The right / look-again cue (06 §6: never a red X): a picture, with the spoken line as its text. */
function CueBadge({ cue }: { cue: Cue | null }) {
  const narrationText = useNarrationText();
  return (
    <div role="status" data-testid="pier-cue" data-cue={cue?.kind ?? 'none'}>
      {cue && (
        <span
          className={`flex size-16 items-center justify-center rounded-full border-4 ${CUE_TONE[cue.kind]}`}
        >
          <span className="size-9" aria-hidden="true">
            {cue.kind === 'right' ? (
              <icons.StarIcon />
            ) : cue.kind === 'again' ? (
              <LookAgainIcon />
            ) : (
              <icons.ArrowIcon />
            )}
          </span>
          <VisuallyHidden>{cue.say ? narrationText(cue.say) : null}</VisuallyHidden>
        </span>
      )}
    </div>
  );
}

function LookAgainIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d="M38 24a14 14 0 1 1-4.6-10.4"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M36 5v11H25"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The break offer after an easy item (04 §6.4 rule 4): keep playing, or stop here with the celebration. */
export function BreakOffer({
  workshop,
  onKeep,
  onBreak,
  onLeave,
}: {
  workshop?: WorkshopId;
  onKeep: () => void;
  onBreak: () => void;
  onLeave: () => void;
}) {
  return (
    <PlayFrame top={<HomeButton onPress={onLeave} />} testId="pier-break" workshop={workshop}>
      <div className="flex h-full flex-col items-center justify-center gap-8">
        <SpeechBubble say="ui.pier.break" tail="none" tone="sun" showText />
        <div className="flex flex-wrap items-center justify-center gap-6">
          <BigButton
            label="ui.pier.break.no"
            icon={<icons.ArrowIcon tone="light" />}
            tone="leaf"
            showLabel
            onPress={onKeep}
          />
          <BigButton
            label="ui.pier.break.yes"
            icon={<icons.HomeIcon />}
            tone="cloud"
            showLabel
            onPress={onBreak}
          />
        </div>
      </div>
    </PlayFrame>
  );
}
