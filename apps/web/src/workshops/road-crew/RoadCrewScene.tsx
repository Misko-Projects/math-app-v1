// What Road Crew draws around the shared workshop screen (05 §4 W1, rules 3 and 6), without the
// runner or the store: the stones the request has made, in the bottom row beside its beads, and
// the request-complete parade. The fit check renders the bottom row with every K–1 template of
// the workshop's formats.
//
// The bottom row is as tall as the Practice Pier's (the beads' own height), so the workshop area
// keeps all the room the pier gives a widget.

import { materialArt, useNarrationText } from '@number-island/ui';
import { Beads } from '../play/PlayScreen';

const Stone = materialArt.stone;

/** The stones made so far: one picture per stone, countable, the newest one dropping in. */
export function StoneTray({ made }: { made: number }) {
  const label = useNarrationText()('ui.roadcrew.tray', { n: made });
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-7 items-center gap-1"
      data-testid="road-crew-tray"
      data-made={made}
    >
      {Array.from({ length: made }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: stones have no identity beyond their place
          key={i}
          aria-hidden="true"
          className={`size-7 ${i === made - 1 ? 'motion-safe:animate-[ni-stone-in_500ms_ease-out_1]' : ''}`}
        >
          <Stone />
        </span>
      ))}
    </div>
  );
}

/** The bottom row of a Road Crew task: the request's beads in the middle, its stones beside them. */
export function RoadCrewBottom({
  done,
  total,
  made,
}: {
  done: number;
  total: number;
  made: number;
}) {
  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <span />
      <Beads done={done} total={total} />
      <div className="flex min-w-0 justify-end overflow-hidden">
        <StoneTray made={made} />
      </div>
    </div>
  );
}

/**
 * The request-complete parade: the stones the request made pass by in a line. The one that goes
 * onto the road carries its number (a numeral a child reads, 32 px); the others go to the
 * Storehouse.
 */
export function StoneParade({
  made,
  laid,
}: {
  made: number;
  /** The number of the road stone laid; null when none was, undefined while it is being laid. */
  laid: number | null | undefined;
}) {
  const narrationText = useNarrationText();
  const stored = laid == null ? made : made - 1;
  return (
    <div
      className="flex min-h-20 max-w-full flex-wrap items-center justify-center gap-4 motion-safe:animate-[ni-parade_1200ms_ease-out_1]"
      data-testid="road-crew-parade"
      data-made={made}
      data-laid={laid === undefined ? 'pending' : (laid ?? 'none')}
    >
      {laid != null && (
        <span
          role="img"
          aria-label={narrationText('ui.roadcrew.laid', { n: laid })}
          className="flex size-20 flex-none items-center justify-center rounded-full border-4 border-wood-deep bg-sand font-display text-[2rem] leading-none font-bold text-ink"
          data-testid="road-crew-laid"
        >
          {laid}
        </span>
      )}
      <div
        role="img"
        aria-label={narrationText('ui.roadcrew.tray', { n: stored })}
        className="flex flex-wrap items-center justify-center gap-3"
        data-testid="road-crew-stored"
        data-stones={stored}
      >
        {Array.from({ length: stored }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stones have no identity beyond their place
          <span key={i} aria-hidden="true" className="size-16 flex-none">
            <Stone />
          </span>
        ))}
      </div>
    </div>
  );
}
