// Parent area: each child's guide (05 §1, §10). The child chooses on their own screen and can switch
// by tapping the guide on the island; a grown-up can set it here too. Parent copy is inline (02 §7).

import { GUIDES, Guide, guideById, Panel } from '@number-island/ui';
import { useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { ChildAvatar } from '@/app/picker/ChildAvatar';
import { useProfiles } from '@/data/hooks';
import { Notice } from './kit';

export function ParentGuides() {
  const { store } = useAppServices();
  const profiles = useProfiles();
  const [error, setError] = useState(false);
  const children = [...(profiles ?? [])].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  if (children.length === 0) return null;

  const choose = async (childId: string, guide: string) => {
    setError(false);
    try {
      await store.setGuide(childId, guide);
    } catch (e) {
      recordDiagnostic('parent.guide', e);
      setError(true);
    }
  };

  return (
    <Panel as="section" title="Guides">
      <p className="mt-2 text-base text-ink-soft">
        The friend who plays with each child. Children can also switch by tapping their guide on the
        island.
      </p>
      {error ? (
        <div className="mt-4">
          <Notice tone="error">That did not save. Please try again.</Notice>
        </div>
      ) : null}
      <ul className="mt-4 flex flex-col gap-3">
        {children.map((child, i) => {
          const current = child.guide === undefined ? null : guideById(child.guide).id;
          return (
            <li
              key={child.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-cloud px-4 py-3 ring-2 ring-sand-deep"
              data-testid={`guide-${child.name}`}
            >
              <ChildAvatar
                name={child.name}
                avatar={child.avatar}
                index={i}
                className="size-12 flex-none"
              />
              <p className="min-w-0 flex-1 truncate text-lg font-bold">
                {child.name}
                <span className="block text-base font-normal text-ink-soft">
                  {current === null ? 'Not chosen yet' : `Guide: ${guideById(current).name}`}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {GUIDES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={current === g.id}
                    aria-label={`${g.name}, the ${g.animal}, for ${child.name}`}
                    onClick={() => void choose(child.id, g.id)}
                    className={[
                      'flex min-h-12 items-center gap-2 rounded-full py-1 pr-5 pl-2 font-display text-lg font-bold ring-2',
                      'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink',
                      current === g.id
                        ? 'bg-sea-deep text-cloud ring-sea-dark'
                        : 'bg-paper text-ink ring-sand-deep',
                    ].join(' ')}
                  >
                    <Guide guide={g.id} mood="idle" height={40} />
                    {g.name}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
