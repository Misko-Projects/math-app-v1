// The naming step (05 §10 step 3; #22 part 4), loaded when the island's sign is opened: the game
// data's names to choose from, each a button that says its name when tapped, and "Okay" to keep
// the one chosen. Nothing is typed.

import {
  BigButton,
  icons,
  ReplayButton,
  Sheet,
  SpeechBubble,
  useNarrationText,
  useSpeech,
} from '@number-island/ui';
import { useState } from 'react';
import type { IslandNameChoice } from './names';

export default function NameSheet({
  open,
  choices,
  onClose,
  onName,
}: {
  open: boolean;
  choices: readonly IslandNameChoice[];
  onClose: () => void;
  onName: (choice: IslandNameChoice) => void;
}) {
  const { say } = useSpeech();
  const text = useNarrationText();
  const [chosen, setChosen] = useState<IslandNameChoice | null>(null);
  return (
    <Sheet open={open} onClose={onClose} label="ui.island.name.open" placement="center">
      <div className="flex flex-col items-center gap-5" data-testid="name-sheet">
        <div className="flex items-center gap-4">
          <SpeechBubble say="ui.island.name.pick" tail="none" showText />
          <ReplayButton onPress={() => say('ui.island.name.pick')} />
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {choices.map((choice) => (
            <li key={choice.name}>
              <button
                type="button"
                className={`min-h-[72px] w-full cursor-pointer rounded-[20px] bg-paper px-5 py-3 font-body text-[1.5rem] font-bold text-ink shadow-soft ring-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  chosen?.name === choice.name ? 'ring-sunshine' : 'ring-sand-deep'
                }`}
                aria-pressed={chosen?.name === choice.name}
                data-island-name={choice.name}
                onClick={() => {
                  setChosen(choice);
                  say(choice.say);
                }}
              >
                {text(choice.say)}
              </button>
            </li>
          ))}
        </ul>
        <BigButton
          label="ui.btn.okay"
          icon={<icons.CheckIcon tone="light" />}
          tone="leaf"
          showLabel
          disabled={chosen === null}
          onPress={() => chosen && onName(chosen)}
        />
      </div>
    </Sheet>
  );
}
