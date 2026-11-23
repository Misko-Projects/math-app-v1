// The naming step (05 §10 step 3; #22 part 4), loaded when the island's sign is opened: six
// names to choose from, each a button that says its name when tapped, and "Okay" to keep the one
// chosen. Nothing is typed.

import { BigButton, icons, ReplayButton, Sheet, SpeechBubble, useSpeech } from '@number-island/ui';
import { useState } from 'react';
import { ISLAND_NAMES, type IslandName, nameLine } from './names';

export default function NameSheet({
  open,
  onClose,
  onName,
}: {
  open: boolean;
  onClose: () => void;
  onName: (name: IslandName) => void;
}) {
  const { say } = useSpeech();
  const [chosen, setChosen] = useState<IslandName | null>(null);
  return (
    <Sheet open={open} onClose={onClose} label="ui.island.name.open" placement="center">
      <div className="flex flex-col items-center gap-5" data-testid="name-sheet">
        <div className="flex items-center gap-4">
          <SpeechBubble say="ui.island.name.pick" tail="none" showText />
          <ReplayButton onPress={() => say('ui.island.name.pick')} />
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {ISLAND_NAMES.map((name) => (
            <li key={name}>
              <button
                type="button"
                className={`min-h-[72px] w-full cursor-pointer rounded-[20px] bg-paper px-5 py-3 font-body text-[1.5rem] font-bold text-ink shadow-soft ring-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  chosen === name ? 'ring-sunshine' : 'ring-sand-deep'
                }`}
                aria-pressed={chosen === name}
                data-island-name={name}
                onClick={() => {
                  setChosen(name);
                  say(nameLine(name));
                }}
              >
                {name}
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
