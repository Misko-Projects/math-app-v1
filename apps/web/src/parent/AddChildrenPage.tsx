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

import { Panel } from '@number-island/ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
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
      recordDiagnostic('add-children', e);
      saving.current = false;
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold">Add your children</h1>
      {added ? (
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
