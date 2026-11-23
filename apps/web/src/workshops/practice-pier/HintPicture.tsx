// The picture of a representation hint (03 §5.8 level 3: "a ten-frame drawing beside a
// number-pad item"). In the pier it is a card over the workshop area, so it never takes room from
// the widget: the child looks, closes it, and the widget is as they left it.

import type { StimulusSpec } from '@number-island/shared';
import { BigButton, icons, StimulusView, useNarrationText } from '@number-island/ui';
import { useLayoutEffect, useState } from 'react';

export default function HintPicture({
  spec,
  onClose,
}: {
  spec: StimulusSpec;
  onClose: () => void;
}) {
  const label = useNarrationText()('ui.pier.picture');
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return (
    <div
      role="dialog"
      aria-label={label}
      data-testid="pier-hint-picture"
      className="absolute inset-0 z-10 flex flex-col items-center gap-3 rounded-card bg-sunshine-light p-4"
    >
      <div ref={setEl} className="flex min-h-0 w-full flex-1 items-center justify-center">
        {box && box.width > 0 && box.height > 0 && (
          <StimulusView spec={spec} maxWidth={box.width} maxHeight={box.height} label={label} />
        )}
      </div>
      <BigButton
        label="ui.btn.okay"
        icon={<icons.CheckIcon tone="light" />}
        tone="leaf"
        onPress={onClose}
      />
    </div>
  );
}
