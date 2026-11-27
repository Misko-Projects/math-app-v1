// The picture of a representation hint (03 §5.8 level 3: "a ten-frame drawing beside a
// number-pad item"). A workshop shows it as a card over its area, so it never takes room from the
// widget: the child looks, closes it, and the widget is as they left it.

import type { StimulusSpec } from '@number-island/shared';
import { BigButton, icons, useNarrationText } from '@number-island/ui';
// Its own entry: the drawing code needs the engine's item core, which the shell must not load (02 §6a).
import { StimulusView } from '@number-island/ui/stimulus';
import { type CSSProperties, useLayoutEffect, useState } from 'react';

export default function HintPicture({
  spec,
  onClose,
}: {
  spec: StimulusSpec;
  onClose: () => void;
}) {
  const label = useNarrationText()('ui.pier.picture');
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  const [drawn, setDrawn] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!room) return;
    const measure = () => setBox({ width: room.clientWidth, height: room.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [room]);
  // A picture keeps its pieces at a size a child can count, so a crowded one can come out larger
  // than the room it was given: it is then drawn smaller as a whole, never cut off.
  useLayoutEffect(() => {
    if (!drawn || !box) return;
    const fit = () => {
      const w = drawn.offsetWidth;
      const h = drawn.offsetHeight;
      if (w > 0 && h > 0) setScale(Math.min(1, box.width / w, box.height / h));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(drawn);
    return () => observer.disconnect();
  }, [drawn, box]);
  return (
    <div
      role="dialog"
      aria-label={label}
      data-testid="pier-hint-picture"
      // A felt mat (primitives.css `ni-mat`) in the hint's warm colour, borderless.
      className="ni-mat absolute inset-0 z-10 flex flex-col items-center gap-3 rounded-card p-4"
      style={{ '--mat-bg': 'var(--color-sunshine-light)', '--mat-border': '0px' } as CSSProperties}
    >
      <div
        ref={setRoom}
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
      >
        {box && box.width > 0 && box.height > 0 && (
          <div ref={setDrawn} className="shrink-0" style={{ transform: `scale(${scale})` }}>
            <StimulusView spec={spec} maxWidth={box.width} maxHeight={box.height} label={label} />
          </div>
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
