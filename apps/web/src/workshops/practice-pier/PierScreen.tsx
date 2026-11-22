// The Practice Pier's screen (06 §2 workshop layout), without the runner: the frame, the item's
// row of controls and the widget in the workshop area. `PierPage` plays a request in it; the fit
// check (`pierFit.browser.test.tsx`) renders every template in it and measures the area.

import type {
  InteractionEvent,
  NarrationKey,
  PresentedItem,
  ResponseValue,
  Tier,
} from '@number-island/shared';
import {
  BigButton,
  HomeButton,
  icons,
  SpeechBubble,
  useNarrationText,
  VisuallyHidden,
  WidgetHost,
} from '@number-island/ui';
import type { ReactNode } from 'react';

export type Cue = { kind: 'right' | 'again' | 'onward'; say: NarrationKey | undefined };

export type Phase =
  | 'prompt' // the prompt is being spoken; no input yet
  | 'answer' // item ready: the widget takes input
  | 'checking' // an answer is being checked and written
  | 'feedback'; // resolved: "next" moves on

/** One item on screen: Home, the prompt, the cue and "next", the widget, the request's beads. */
export function PierItemScreen({
  item,
  tier,
  itemKey,
  phase,
  cue,
  progress,
  onLeave,
  onNext,
  onResponse,
  onInteract,
}: {
  /** Null while the request loads. */
  item: PresentedItem | null;
  tier: Tier;
  itemKey: number;
  phase: Phase;
  cue: Cue | null;
  progress: { done: number; total: number };
  onLeave: () => void;
  onNext: () => void;
  onResponse: (response: ResponseValue) => void;
  onInteract: (event: InteractionEvent) => void;
}) {
  return (
    <PierFrame
      testId="pier"
      phase={item ? phase : 'loading'}
      top={
        <>
          <HomeButton onPress={onLeave} />
          {item && (
            <div className="flex min-w-0 flex-1 items-center">
              <SpeechBubble say={item.prompt.narration} vars={item.prompt.vars} tail="left" />
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-4">
            <CueBadge cue={cue} />
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
      bottom={<Beads done={progress.done} total={progress.total} />}
    >
      {item && (
        <WidgetHost
          className="size-full"
          config={item.widget}
          tier={tier}
          itemKey={itemKey}
          disabled={phase !== 'answer'}
          onResponse={onResponse}
          onInteract={onInteract}
        />
      )}
    </PierFrame>
  );
}

/** The workshop frame: a top row, the widget area (a bounded box the widget measures) and a bottom row. */
export function PierFrame({
  top,
  bottom,
  testId,
  phase,
  children,
}: {
  top: ReactNode;
  bottom?: ReactNode;
  testId: string;
  /** Where the item on screen is (tests wait on it instead of on time). */
  phase?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid h-dvh min-h-[600px] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden bg-sky-light px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid={testId}
      data-phase={phase}
    >
      <header className="flex min-h-24 items-center gap-4">{top}</header>
      <main
        className="grid min-h-0 overflow-auto rounded-card border-[3px] border-sand-deep bg-sand p-6 shadow-soft"
        data-testid="pier-stage"
      >
        {children}
      </main>
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
          className={
            i < done
              ? 'size-6 rounded-full border-[3px] border-leaf-deep bg-leaf'
              : 'size-4 rounded-full border-[3px] border-sand-deep bg-paper'
          }
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
