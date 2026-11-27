import type { ReactNode } from 'react';
import { Guide } from '../art/guides/Guide';
import { GuideNameTag } from '../art/guides/GuideNameTag';
import { GUIDES, guideLabel } from '../art/guides/registry';
import { useNarrationText, useSpeech } from '../preferences/UiProvider';
import { BigButton } from '../primitives/BigButton';
import { CheckIcon } from '../primitives/icons';
import { HomeButton, ReplayButton } from '../primitives/presets';

export interface GuideChooserProps {
  /** The guide picked so far (the current one when switching); null: nothing picked yet. */
  selected: string | null;
  onSelect: (guide: string) => void;
  /** Confirms `selected`. */
  onConfirm: () => void;
  /** Switching from the island: Home goes back without changing. Absent at first start. */
  onHome?: () => void;
  /** Behind the cards (the island scene). */
  backdrop?: ReactNode;
}

/**
 * The guide chooser (05 §1, §10): who plays with the child. Shown once per child before their
 * first session, and again whenever they tap their guide on the island. Built for a child who
 * cannot read yet (06 §5): the question is spoken and can be heard again, every guide is a big
 * card that says its name when tapped, and one big button confirms. Each card is a toggle button
 * (`aria-pressed`, like the profile picker's cards): Tab moves, Enter or Space picks.
 */
export function GuideChooser({
  selected,
  onSelect,
  onConfirm,
  onHome,
  backdrop,
}: GuideChooserProps) {
  const { say } = useSpeech();
  const text = useNarrationText();

  const pick = (id: string) => {
    onSelect(id);
    const guide = GUIDES.find((g) => g.id === id);
    if (guide) say(guide.nameLine);
  };

  return (
    <div
      className="relative h-dvh min-h-[600px] w-full overflow-hidden"
      data-testid="guide-chooser"
    >
      {backdrop}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(255_250_240/0.78),rgb(255_250_240/0.45)_55%,rgb(255_250_240/0.2))]" />
      <main className="relative flex h-full flex-col items-center gap-[clamp(0.75rem,3vh,2rem)] overflow-y-auto px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full items-center gap-5">
          <div className="flex w-24 shrink-0 justify-start">
            {onHome ? <HomeButton onPress={onHome} /> : null}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-5">
            <h1
              id="guide-chooser-title"
              className="text-center font-display text-[clamp(2rem,3.8vw,3.5rem)] leading-tight font-extrabold tracking-tight text-ink [text-shadow:0_3px_0_#fff]"
            >
              {text('ui.guide.choose')}
            </h1>
            <ReplayButton onPress={() => say('ui.guide.choose')} />
          </div>
          <div className="w-24 shrink-0" />
        </div>
        <ul
          aria-labelledby="guide-chooser-title"
          data-testid="guide-cards"
          className="my-auto flex flex-wrap content-center justify-center gap-8"
        >
          {GUIDES.map((g) => {
            const on = g.id === selected;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={guideLabel(g)}
                  data-guide={g.id}
                  onClick={() => pick(g.id)}
                  className={[
                    'ni-guide-card flex w-[clamp(14rem,24vw,17rem)] flex-col items-center gap-3 rounded-card px-4 pt-5 pb-5',
                    'transition-[transform,box-shadow] duration-200',
                    'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink',
                    on
                      ? 'motion-safe:-translate-y-1.5 shadow-lift'
                      : 'shadow-ledge active:shadow-ledge-pressed active:brightness-95',
                  ].join(' ')}
                  data-selected={on ? 'true' : undefined}
                >
                  <Guide
                    guide={g.id}
                    mood={on ? 'cheer' : 'idle'}
                    height={232}
                    className="pointer-events-none"
                  />
                  <GuideNameTag guide={g.id} decorative fontSize={30} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex w-full justify-end">
          <BigButton
            label="ui.guide.confirm"
            icon={<CheckIcon tone="light" />}
            tone="leaf"
            disabled={selected === null}
            onPress={onConfirm}
            showLabel
          />
        </div>
      </main>
    </div>
  );
}
