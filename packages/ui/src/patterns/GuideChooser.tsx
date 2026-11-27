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

  // Plain CSS classes (primitives.css), not Tailwind utilities: the app's Tailwind does not scan
  // this package, so a utility used only here would never be generated.
  return (
    <div className="ni-guide-chooser" data-testid="guide-chooser">
      {backdrop}
      <div className="ni-guide-chooser__veil" />
      <main className="ni-guide-chooser__main">
        <div className="ni-guide-chooser__top">
          <div className="ni-guide-chooser__side">
            {onHome ? <HomeButton onPress={onHome} /> : null}
          </div>
          <div className="ni-guide-chooser__ask">
            <h1 id="guide-chooser-title" className="ni-guide-chooser__title">
              {text('ui.guide.choose')}
            </h1>
            <ReplayButton onPress={() => say('ui.guide.choose')} />
          </div>
          <div className="ni-guide-chooser__side" />
        </div>
        <ul
          aria-labelledby="guide-chooser-title"
          data-testid="guide-cards"
          className="ni-guide-chooser__cards"
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
                  className="ni-guide-card"
                >
                  <Guide guide={g.id} mood={on ? 'cheer' : 'idle'} height={232} />
                  <GuideNameTag guide={g.id} decorative fontSize={30} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="ni-guide-chooser__go">
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
