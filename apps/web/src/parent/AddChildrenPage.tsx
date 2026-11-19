// Add children from the parent area (06 §3), behind the parent gate. The Setup Wizard adds the
// first children; this page is for a family that has none, which happens when setup's answer was
// lost on the way: the server made the family, the parent joined it with the passphrase, and the
// wizard never saved its children. The page reuses the wizard's children step and writes only the
// profiles (`addChildren`, all in one transaction), never the family's settings. Editing children
// is P01's Settings.
//
// A save never navigates by itself. When it is done the form is replaced by what was added and a
// Done button, so nothing a save does can override where the parent went meanwhile, and no saved
// child is left behind as an editable draft.
//
// The form is only for a family with no children: the page reads the stored profiles, and once
// there are any (this page saved them, another tab did, or the parent came back with Back or a
// reload) it says who plays here instead. The save itself is refused in its own transaction when
// children are already stored (`family_has_children`), so a first roster is never saved twice.

import { Panel } from '@number-island/ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { useProfiles } from '@/data/hooks';
import { DataStoreError } from '@/data/store';
import { Button, Notice } from './kit';
import { listNames } from './ParentHome';
import { addChildren, type NewChild } from './setup/family';
import { ChildrenStep } from './setup/SetupWizard';

export function AddChildrenPage() {
  const services = useAppServices();
  const navigate = useNavigate();
  const [kids, setKids] = useState<NewChild[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The names just saved: the form is gone and the page says so. */
  const [added, setAdded] = useState<string[] | null>(null);
  const profiles = useProfiles();
  /** False once the page is gone (the parent left, or Lock closed the area). */
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);
  /** Set at once (not on the next render): the draft being saved never changes under the save. */
  const saving = useRef(false);
  const changeKids = (next: NewChild[]) => {
    if (!saving.current) setKids(next);
  };

  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      await addChildren(services, kids);
    } catch (e) {
      saving.current = false;
      if (e instanceof DataStoreError && e.code === 'family_has_children') {
        // Children were saved elsewhere meanwhile: the page shows who plays here instead.
        if (shown.current) setBusy(false);
        return;
      }
      recordDiagnostic('add-children', e);
      if (!shown.current) return;
      // Nothing was written (one transaction): the same draft can be saved again.
      setError('Those children didn’t save on this device. Please try again.');
      setBusy(false);
      return;
    }
    if (!shown.current) return;
    // Saved, all of them. The draft is gone: what was saved is shown as done, not editable.
    setAdded(kids.map((k) => k.name.trim()));
    setKids([]);
    setBusy(false);
  };

  // The stored children (live). While a save runs, the form stays (its own children appear here
  // as it commits); after it, the confirmation shows.
  const stored = !added && !busy && profiles !== undefined && profiles.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold">Add your children</h1>
      {profiles === undefined && !added ? (
        <p className="text-lg">Loading…</p>
      ) : stored ? (
        <Panel as="section" title="Your children are here">
          <div className="mt-3 flex flex-col items-start gap-4">
            <p className="text-lg" role="status">
              {listNames(
                [...(profiles ?? [])].sort((a, b) => a.createdAt - b.createdAt).map((p) => p.name),
              )}{' '}
              {profiles?.length === 1 ? 'plays' : 'play'} on this island already.
            </p>
            <Button onClick={() => navigate('/parent')}>Back to the parent area</Button>
          </div>
        </Panel>
      ) : added ? (
        <Panel as="section" title="Children added">
          <div className="mt-3 flex flex-col items-start gap-4">
            <p className="text-lg" role="status">
              {listNames(added)} can start playing now.
            </p>
            <Button onClick={() => navigate('/parent')}>Done</Button>
          </div>
        </Panel>
      ) : (
        <section className="rounded-[2rem] bg-paper p-6 shadow-[0_6px_0_var(--color-sand-deep)] ring-2 ring-sand-deep sm:p-8">
          <ChildrenStep
            kids={kids}
            setKids={changeKids}
            onBack={() => navigate('/parent')}
            onNext={() => void save()}
            nextLabel={busy ? 'Saving…' : 'Save children'}
            intro="Add each child who plays on this island. Each gets their own profile and progress."
            busy={busy}
          />
          {error ? (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
