// Parent area: picture passwords (06 §2, §3 Settings). Each child can have three pictures, in
// order, that they tap on the Profile Picker. A light, local lock (08 §3), not a security feature.
// Setting one asks for the pictures twice. Normal-density parent UI; parent copy is inline (02 §7).

import type { ChildProfile } from '@number-island/shared';
import { Panel } from '@number-island/ui';
import { useState } from 'react';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { ChildAvatar } from '@/app/picker/ChildAvatar';
import { hashPicturePassword, isCompletePassword } from '@/app/picker/picturePassword';
import { PICTURE_IDS, PICTURES, PictureArt, type PictureId } from '@/app/picker/pictures';
import { useProfiles } from '@/data/hooks';
import { Button, Notice } from './kit';

type Editing =
  | { childId: string; mode: 'set'; step: 'first' | 'confirm'; first: PictureId[] }
  | { childId: string; mode: 'remove' };

export function PicturePasswords() {
  const { store } = useAppServices();
  const profiles = useProfiles();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const children = [...(profiles ?? [])].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );

  const save = async (child: ChildProfile, hash: string | null, done: string) => {
    setSaving(true);
    try {
      await store.putProfile({ ...child, picturePasswordHash: hash });
      setNotice({ tone: 'success', text: done });
      setEditing(null);
    } catch (e) {
      recordDiagnostic('parent.picture-password', e);
      setNotice({ tone: 'error', text: 'That didn’t save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel as="section" title="Picture passwords" aria-label="Picture passwords">
      <p className="mt-2 text-lg">
        A picture password keeps a brother or sister from playing as someone else: your child taps
        three pictures, in order, on the “Who is playing?” screen. It’s a light lock on this device,
        not a security feature.
      </p>
      {notice ? (
        <div className="mt-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}
      {profiles === undefined ? (
        <p className="mt-4 text-lg">Loading…</p>
      ) : children.length === 0 ? (
        <p className="mt-4 text-lg">No children yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {children.map((child, i) => {
            const on = child.picturePasswordHash !== null;
            const open = editing?.childId === child.id ? editing : null;
            return (
              <li
                key={child.id}
                className="rounded-2xl bg-cloud px-4 py-3 ring-2 ring-sand-deep"
                data-testid={`picture-password-${child.name}`}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <ChildAvatar
                    name={child.name}
                    avatar={child.avatar}
                    index={i}
                    className="size-12 flex-none"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{child.name}</p>
                    <p className="flex items-center gap-1.5 text-base text-ink-soft">
                      <LockMark on={on} />
                      {on ? 'Picture password on' : 'No picture password'}
                    </p>
                  </div>
                  {open ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={on ? 'secondary' : 'primary'}
                        onClick={() => {
                          setNotice(null);
                          setEditing({ childId: child.id, mode: 'set', step: 'first', first: [] });
                        }}
                        aria-label={`${on ? 'Change' : 'Set'} ${child.name}’s picture password`}
                      >
                        {on ? 'Change' : 'Set'}
                      </Button>
                      {on ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setNotice(null);
                            setEditing({ childId: child.id, mode: 'remove' });
                          }}
                          aria-label={`Remove ${child.name}’s picture password`}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
                {open?.mode === 'remove' ? (
                  <div className="mt-3 rounded-2xl bg-sand/60 p-4 ring-2 ring-sand-deep">
                    <p className="text-lg font-bold">Remove {child.name}’s picture password?</p>
                    <p className="mt-1 text-base">
                      {child.name} will start playing with one tap on their picture.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button
                        variant="danger"
                        disabled={saving}
                        onClick={() =>
                          void save(child, null, `${child.name}’s picture password is off.`)
                        }
                      >
                        Remove
                      </Button>
                      <Button variant="secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                {open?.mode === 'set' ? (
                  <PictureSequenceInput
                    key={open.step}
                    heading={
                      open.step === 'first'
                        ? `Choose 3 pictures for ${child.name}, in order`
                        : 'Choose the same 3 pictures again, in the same order'
                    }
                    submitLabel={open.step === 'first' ? 'Next' : 'Save'}
                    error={
                      open.step === 'first' && open.first.length > 0
                        ? 'Those didn’t match the first time. Choose 3 pictures again.'
                        : null
                    }
                    busy={saving}
                    onCancel={() => setEditing(null)}
                    onSubmit={async (seq) => {
                      if (open.step === 'first') {
                        setEditing({ ...open, step: 'confirm', first: seq });
                        return;
                      }
                      if (seq.join() !== open.first.join()) {
                        // Back to the start; `first` non-empty shows why.
                        setEditing({ ...open, step: 'first' });
                        return;
                      }
                      let hash: string;
                      try {
                        hash = await hashPicturePassword(child.id, seq);
                      } catch (e) {
                        recordDiagnostic('parent.picture-password', e);
                        setNotice({ tone: 'error', text: 'That didn’t save. Please try again.' });
                        return;
                      }
                      await save(
                        child,
                        hash,
                        `${child.name}’s picture password is on: ${seq
                          .map((id) => PICTURES[id].label)
                          .join(', then ')}.`,
                      );
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function PictureSequenceInput({
  heading,
  submitLabel,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  error: string | null;
  busy: boolean;
  onSubmit: (seq: PictureId[]) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [seq, setSeq] = useState<PictureId[]>([]);
  const complete = isCompletePassword(seq);
  return (
    <fieldset className="mt-3 rounded-2xl bg-paper p-4 ring-2 ring-sand-deep">
      {/* float keeps the legend inside the rounded box instead of on its border */}
      <legend className="float-left w-full text-lg font-bold">{heading}</legend>
      {error ? (
        <div className="clear-both pt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="clear-both flex flex-wrap items-start gap-6 pt-3">
        <div>
          <p className="text-base text-ink-soft">Chosen</p>
          <ol className="mt-1 flex gap-2" aria-label="Chosen pictures" data-testid="parent-slots">
            {[0, 1, 2].map((i) => {
              const id = seq[i];
              return (
                <li
                  key={i}
                  className={[
                    'grid size-16 place-items-center rounded-xl',
                    id
                      ? 'bg-cloud ring-2 ring-sea-deep'
                      : 'border-2 border-dashed border-pebble-deep',
                  ].join(' ')}
                >
                  {id ? (
                    <>
                      <PictureArt id={id} className="size-12" />
                      <span className="sr-only">
                        {i + 1}: {PICTURES[id].label}
                      </span>
                    </>
                  ) : (
                    <span className="sr-only">{i + 1}: empty</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-9" aria-label="Pictures">
          {PICTURE_IDS.map((id) => {
            const used = seq.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={used}
                  disabled={used || seq.length >= 3}
                  onClick={() => setSeq((s) => (s.length < 3 && !s.includes(id) ? [...s, id] : s))}
                  className={[
                    'flex w-[4.75rem] flex-col items-center gap-0.5 rounded-xl bg-cloud px-1 pt-1.5 pb-1 ring-2 ring-sand-deep',
                    'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    'disabled:cursor-not-allowed',
                    used ? 'opacity-45' : '',
                  ].join(' ')}
                >
                  <PictureArt id={id} className="size-11" />
                  <span className="text-sm font-bold leading-tight">{PICTURES[id].label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={!complete || busy} onClick={() => complete && void onSubmit(seq)}>
          {submitLabel}
        </Button>
        <Button
          variant="secondary"
          disabled={seq.length === 0}
          onClick={() => setSeq((s) => s.slice(0, -1))}
        >
          Undo
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}

function LockMark({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 flex-none" aria-hidden="true">
      {on ? (
        <>
          <path
            d="M6.5 9V6.8a3.5 3.5 0 0 1 7 0V9"
            className="fill-none stroke-ink"
            strokeWidth="2"
          />
          <rect
            x="4"
            y="8.5"
            width="12"
            height="9"
            rx="2.5"
            className="fill-sunshine stroke-ink"
            strokeWidth="1.6"
          />
        </>
      ) : (
        <>
          <path
            d="M6.5 9V6.8a3.5 3.5 0 0 1 6.6-1.6"
            className="fill-none stroke-ink-soft"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect
            x="4"
            y="8.5"
            width="12"
            height="9"
            rx="2.5"
            className="fill-none stroke-ink-soft"
            strokeWidth="1.6"
          />
        </>
      )}
    </svg>
  );
}
