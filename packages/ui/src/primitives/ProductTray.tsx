import type { NarrationKey } from '@number-island/shared';
import { type ReactNode, useEffect, useRef } from 'react';
import { useNarrationText, useUiPreferences } from '../preferences/UiProvider';

export interface TrayItem {
  id: string;
  /** The product picture (a plank, a brick, a lantern…). */
  icon: ReactNode;
}

export interface ProductTrayProps {
  /** Products earned so far, oldest first. */
  items: readonly TrayItem[];
  /** The request's goal: empty slots show how many are still to make (never "3/8", 06 §2). */
  goal?: number;
  label?: NarrationKey;
  /** Show the tray's name tag. Defaults to the provider's text mode. */
  showLabel?: boolean;
  className?: string;
}

const FRAME = 10;

/**
 * The workshop's product tray (05 §4 rule 3, 06 §2): every product lands in a slot, in ten-frames of
 * 2 × 5 so the amount is countable at a glance. Newly added products pop in.
 */
export function ProductTray({
  items,
  goal,
  label = 'ui.tray.label',
  showLabel,
  className,
}: ProductTrayProps) {
  const { textLabels } = useUiPreferences();
  const narrationText = useNarrationText();
  const name = narrationText(label);

  // Products present at first render don't pop; later arrivals do.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(items.map((i) => i.id));
  const known = seen.current;
  useEffect(() => {
    for (const i of items) known.add(i.id);
  }, [items, known]);

  const slots = Math.max(items.length, goal ?? 0);
  const frames = Math.max(1, Math.ceil(slots / FRAME));
  const empty = items.length === 0 && !goal;

  return (
    <section
      className={['ni-tray', className].filter(Boolean).join(' ')}
      aria-label={`${name}: ${items.length}`}
    >
      {(showLabel ?? textLabels) ? (
        <span className="ni-tray__label" aria-hidden="true">
          {name}
        </span>
      ) : null}
      {empty ? (
        <span className="ni-tray__empty">{narrationText('ui.tray.empty')}</span>
      ) : (
        Array.from({ length: frames }, (_, f) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
          <div key={f} className="ni-tray__frame" aria-hidden="true">
            {Array.from({ length: FRAME }, (_, s) => {
              const item = items[f * FRAME + s];
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                <div key={s} className="ni-tray__slot">
                  {item ? (
                    <span
                      className="ni-tray__item"
                      data-new={known.has(item.id) ? undefined : 'true'}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
