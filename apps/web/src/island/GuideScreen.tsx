// The guide chooser on the child's route (05 §1, §10): before a child's first island visit when
// their profile has no guide yet, and whenever they tap their guide on the island to switch.

import type { ChildProfile } from '@number-island/shared';
import { GuideChooser, isKnownGuide, useSpeech } from '@number-island/ui';
import { useEffect, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { IslandScene } from './IslandScene';

export function GuideScreen({
  child,
  onDone,
}: {
  child: ChildProfile;
  /** After a choice is saved, or (switching) Home without a change. */
  onDone: () => void;
}) {
  const { store } = useAppServices();
  const { say } = useSpeech();
  const switching = child.guide !== undefined;
  const [selected, setSelected] = useState<string | null>(
    isKnownGuide(child.guide) ? (child.guide ?? null) : null,
  );
  const busy = useRef(false);

  // The question is spoken as the screen opens (06 §5: no required reading).
  useEffect(() => say('ui.guide.choose'), [say]);

  const confirm = async () => {
    if (selected === null || busy.current) return;
    busy.current = true;
    try {
      if (selected !== child.guide) await store.setGuide(child.id, selected);
      onDone();
    } catch (e) {
      recordDiagnostic('guide.choose', e);
    } finally {
      busy.current = false;
    }
  };

  return (
    <GuideChooser
      selected={selected}
      onSelect={setSelected}
      onConfirm={() => void confirm()}
      {...(switching ? { onHome: onDone } : {})}
      backdrop={
        <IslandScene
          className="absolute inset-0 size-full"
          title="A sunny little island with palm trees and friendly shore critters."
        />
      }
    />
  );
}
