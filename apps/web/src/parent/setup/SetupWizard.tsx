// The Setup Wizard (06 §3), in the spec's order: create the family (passphrase and PIN), add
// children, pair this device (`POST /setup`), show whether the server has AI keys, choose the AI
// features (all off by default, 07 §8.6). Parent-facing: inline copy (02 §7).

import { type ChildProfile, type Grade, type HealthResponse, newId } from '@number-island/shared';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { useDeviceRecord } from '@/app/hooks';
import { ApiError, describeApiError } from '../api';
import { Button, Field, Notice, OkIcon, TextInput, WarnIcon } from '../kit';
import { useParentApi, useParentGate } from '../ParentContext';
import { listNames } from '../ParentHome';
import {
  type AiChoices,
  CHILD_NAME_MAX,
  type FamilyDetails,
  type FamilyIds,
  guessDeviceName,
  type NewChild,
  recoverLostSetup,
  saveAiChoices,
  saveFamilyLocally,
  setupFamilyOnServer,
} from './family';

const STEPS = ['Family', 'Children', 'This device', 'AI helpers', 'Ready'] as const;
type Step = 0 | 1 | 2 | 3 | 4;

export const GRADE_LABELS: Partial<Record<Grade, string>> = {
  K: 'Kindergarten',
  '1': '1st grade',
  '2': '2nd grade',
  '3': '3rd grade',
};
const GRADES = Object.keys(GRADE_LABELS) as Grade[];

function StepTrack({ step }: { step: Step }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Setup steps">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={current ? 'step' : undefined}
          >
            <span
              className={[
                'grid size-9 flex-none place-items-center rounded-full font-display text-lg font-extrabold ring-2',
                current
                  ? 'bg-sea-deep text-cloud ring-sea-dark'
                  : done
                    ? 'bg-paper text-ink ring-leaf-deep'
                    : 'bg-paper text-ink-soft ring-sand-deep',
              ].join(' ')}
            >
              {done ? <OkIcon /> : i + 1}
            </span>
            <span className={current ? 'font-bold text-ink' : 'text-ink-soft'}>
              {label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
            {i < STEPS.length - 1 ? (
              <span aria-hidden="true" className="mx-1 h-0.5 w-5 rounded bg-sand-deep" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- step 1: family ----------

interface FamilyErrors {
  familyName?: string;
  passphrase?: string;
  passphrase2?: string;
  pin?: string;
  pin2?: string;
}

export function validateFamily(
  f: FamilyDetails & { passphrase2: string; pin2: string },
): FamilyErrors {
  const errors: FamilyErrors = {};
  if (!f.familyName.trim()) errors.familyName = 'Give your family a name.';
  else if (f.familyName.trim().length > 60)
    errors.familyName = 'Keep it to 60 characters or fewer.';
  if (f.passphrase.length < 10) errors.passphrase = 'Use at least 10 characters.';
  else if (f.passphrase.length > 256) errors.passphrase = 'Keep it to 256 characters or fewer.';
  if (!errors.passphrase && f.passphrase2 !== f.passphrase)
    errors.passphrase2 = 'The two passphrases don’t match.';
  if (!/^\d{4,6}$/.test(f.pin)) errors.pin = 'Use 4 to 6 digits.';
  if (!errors.pin && f.pin2 !== f.pin) errors.pin2 = 'The two PINs don’t match.';
  return errors;
}

function FamilyStep({
  initial,
  onNext,
}: {
  initial: FamilyDetails;
  onNext: (f: FamilyDetails) => void;
}) {
  const [familyName, setFamilyName] = useState(initial.familyName);
  const [passphrase, setPassphrase] = useState(initial.passphrase);
  const [passphrase2, setPassphrase2] = useState(initial.passphrase);
  const [pin, setPin] = useState(initial.pin);
  const [pin2, setPin2] = useState(initial.pin);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<FamilyErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const next = validateFamily({ familyName, passphrase, passphrase2, pin, pin2 });
        setErrors(next);
        if (Object.keys(next).length > 0) {
          requestAnimationFrame(() =>
            formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(),
          );
          return;
        }
        onNext({ familyName: familyName.trim(), passphrase, pin });
      }}
    >
      <h2 className="font-display text-3xl font-extrabold">Create your family</h2>
      <Field
        label="Family name"
        error={errors.familyName}
        hint="Shown in the parent area, like “The Garcias”."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={errors.familyName ? true : undefined}
            value={familyName}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setFamilyName(e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Parent passphrase"
          error={errors.passphrase}
          hint="At least 10 characters. You’ll use it to sign in on parent devices."
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={errors.passphrase ? true : undefined}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          )}
        </Field>
        <Field label="Passphrase again" error={errors.passphrase2}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={errors.passphrase2 ? true : undefined}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={passphrase2}
              onChange={(e) => setPassphrase2(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Parent PIN"
          error={errors.pin}
          hint="4 to 6 digits, for the quick grown-up lock inside the game."
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={errors.pin ? true : undefined}
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        <Field label="PIN again" error={errors.pin2}>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={errors.pin2 ? true : undefined}
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
      </div>
      <label className="flex min-h-12 w-max cursor-pointer items-center gap-3 text-lg">
        <input
          type="checkbox"
          className="size-6 accent-[var(--color-sea-deep)]"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
        />
        Show what I typed
      </label>
      <div className="flex justify-end">
        <Button type="submit">Next: children</Button>
      </div>
    </form>
  );
}

// ---------- step 2: children ----------

function ChildForm({
  initial,
  onSave,
  onCancel,
  thisYear,
}: {
  initial: NewChild | null;
  /** The child as entered; a new child gets its id from the caller. */
  onSave: (c: Omit<NewChild, 'id'>) => void;
  onCancel?: () => void;
  thisYear: number;
}) {
  const years = Array.from({ length: 12 }, (_, i) => thisYear - 3 - i);
  const [name, setName] = useState(initial?.name ?? '');
  const [birthYear, setBirthYear] = useState(initial?.birthYear ?? thisYear - 6);
  const [grade, setGrade] = useState<Grade>(initial?.grade ?? 'K');
  const [advanced, setAdvanced] = useState(initial?.advanced ?? false);
  const [nameError, setNameError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-sand/50 p-5 ring-2 ring-sand-deep">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field
          label="First name or nickname"
          error={nameError}
          hint="Stays in your family. It is never sent to an AI service."
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={nameError ? true : undefined}
              value={name}
              maxLength={CHILD_NAME_MAX}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Birth year">
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              className="min-h-12 w-full rounded-2xl border-2 border-sand-deep bg-cloud px-4 text-lg text-ink focus:border-sea-deep focus:outline-none focus-visible:ring-4 focus-visible:ring-sea-deep/40"
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="font-bold">Grade</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {GRADES.map((g) => (
            <label
              key={g}
              className={[
                'flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-5 text-lg ring-2',
                'has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
                grade === g
                  ? 'bg-sea-deep font-bold text-cloud ring-sea-dark'
                  : 'bg-cloud text-ink ring-sand-deep',
              ].join(' ')}
            >
              <input
                type="radio"
                name="grade"
                value={g}
                checked={grade === g}
                onChange={() => setGrade(g)}
                className="sr-only"
              />
              {grade === g ? (
                <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
                  <path
                    d="m5 10.5 3.2 3L15 6.5"
                    className="fill-none stroke-cloud"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              {GRADE_LABELS[g]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-start gap-3 text-lg">
        <input
          type="checkbox"
          className="mt-1 size-6 flex-none accent-[var(--color-sea-deep)]"
          checked={advanced}
          onChange={(e) => setAdvanced(e.target.checked)}
        />
        <span>
          <span className="font-bold">Working above grade level</span>
          <span className="block text-base text-ink-soft">
            The first placement adventure starts a little higher.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            if (!name.trim()) {
              setNameError('Add a name.');
              return;
            }
            onSave({ name: name.trim(), birthYear, grade, advanced });
          }}
        >
          {initial ? 'Save' : 'Add child'}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ChildrenStep({
  kids,
  setKids,
  onBack,
  onNext,
}: {
  kids: NewChild[];
  setKids: (k: NewChild[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const thisYear = new Date().getFullYear();
  // The row being edited, by the child's id (a removal never shifts it onto another child).
  const [editing, setEditing] = useState<string | 'new' | null>(kids.length === 0 ? 'new' : null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-3xl font-extrabold">Who will play?</h2>
      <p className="text-lg">Add each child. You can change these later in the parent area.</p>
      {kids.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Children">
          {kids.map((k) =>
            editing === k.id ? (
              <li key={k.id}>
                <ChildForm
                  thisYear={thisYear}
                  initial={k}
                  onSave={(c) => {
                    setKids(kids.map((x) => (x.id === k.id ? { ...c, id: k.id } : x)));
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-4 rounded-3xl bg-cloud px-5 py-4 ring-2 ring-sand-deep"
              >
                <span
                  aria-hidden="true"
                  className="grid size-12 flex-none place-items-center rounded-full bg-sunshine font-display text-2xl font-extrabold text-ink ring-2 ring-sunshine-deep"
                >
                  {k.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-display text-2xl font-bold">
                    {k.name}
                  </span>
                  <span className="block text-base text-ink-soft">
                    {GRADE_LABELS[k.grade]} · born {k.birthYear}
                    {k.advanced ? ' · working above grade' : ''}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    onClick={() => setEditing(k.id)}
                    aria-label={`Edit ${k.name}`}
                  >
                    Edit
                  </Button>
                  {/* Secondary to Edit: a text action, still a full-size target (06 §4). */}
                  <Button
                    variant="quiet"
                    className="px-3"
                    onClick={() => setKids(kids.filter((x) => x.id !== k.id))}
                    aria-label={`Remove ${k.name}`}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {editing === 'new' ? (
        <ChildForm
          thisYear={thisYear}
          initial={null}
          onSave={(c) => {
            setKids([...kids, { ...c, id: newId() }]);
            setEditing(null);
            setError(null);
          }}
          {...(kids.length > 0 ? { onCancel: () => setEditing(null) } : {})}
        />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setEditing('new')}>
            + Add another child
          </Button>
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={() => {
            if (kids.length === 0) {
              setError('Add at least one child to continue.');
              return;
            }
            if (editing !== null) {
              setError('Save or cancel the child you are editing first.');
              return;
            }
            onNext();
          }}
        >
          Next: this device
        </Button>
      </div>
    </div>
  );
}

// ---------- step 3: this device ----------

export function DeviceStep({
  onBack,
  onCreate,
  serverDone,
}: {
  onBack: () => void;
  onCreate: (deviceName: string) => Promise<string | null>;
  /** The family exists on the server already; only this device's part is left to retry. */
  serverDone: boolean;
}) {
  const [deviceName, setDeviceName] = useState(() => guessDeviceName());
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-3xl font-extrabold">Pair this device</h2>
      <p className="text-lg">
        This creates your family on the island server and remembers this device, so progress syncs
        between your devices.
      </p>
      <Field
        label="Name for this device"
        error={nameError}
        hint="Like “Kitchen tablet” or “Mia’s tablet”."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={nameError ? true : undefined}
            maxLength={60}
            value={deviceName}
            readOnly={serverDone || busy}
            onChange={(e) => setDeviceName(e.target.value)}
          />
        )}
      </Field>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack} disabled={busy || serverDone}>
          Back
        </Button>
        {closed ? (
          // The server has a family already: creating can't succeed, joining is the way on.
          <span className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" disabled>
              Create our island
            </Button>
            <Button className="whitespace-nowrap" onClick={() => navigate('/join')}>
              Join with a code
            </Button>
          </span>
        ) : (
          <Button
            disabled={busy}
            onClick={async () => {
              // The name only matters for `/setup`; a retry after it reuses the server's answer.
              if (!serverDone && !deviceName.trim()) {
                setNameError('Give this device a name.');
                return;
              }
              setNameError(null);
              setBusy(true);
              const failure = await onCreate(deviceName.trim());
              if (failure) {
                setError(failure);
                setClosed(failure.startsWith('This server already has a family'));
                setBusy(false);
              }
            }}
          >
            {busy ? 'Creating your island…' : serverDone ? 'Try again' : 'Create our island'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- step 4: AI helpers ----------

const AI_FEATURES: {
  key: keyof AiChoices;
  title: string;
  body: string;
  provider: keyof HealthResponse['ai'];
  keyName: string;
}[] = [
  {
    key: 'feedback',
    title: 'Glim’s friendly tips',
    body: 'A short, personal encouragement line after an answer. Only the math (never names or ages) is sent.',
    provider: 'feedback',
    keyName: 'OPENAI_API_KEY',
  },
  {
    key: 'parentSummary',
    title: 'Weekly summary for you',
    body: 'A plain-language summary of the week’s progress in the parent area.',
    provider: 'summary',
    keyName: 'OPENAI_API_KEY',
  },
  {
    key: 'avatarPhoto',
    title: 'Make a character from a photo',
    body: 'In the parent area, a photo suggests a look for the character creator. The photo is never stored.',
    provider: 'vision',
    keyName: 'ANTHROPIC_API_KEY',
  },
];

export function AiStep({ onDone }: { onDone: (choices: AiChoices) => Promise<void> }) {
  const api = useParentApi();
  const [health, setHealth] = useState<HealthResponse | null | 'unknown'>(null);
  const [choices, setChoices] = useState<AiChoices>({
    feedback: false,
    parentSummary: false,
    avatarPhoto: false,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    // Only the current check speaks: one this effect's cleanup replaced (StrictMode, a new `api`)
    // changes nothing, so Save stays disabled until the current one settles.
    let current = true;
    // Save waits for this answer (see below), so keep the wait short.
    const timeout = setTimeout(() => ctl.abort(), 5000);
    api.health(ctl.signal).then(
      (h) => {
        clearTimeout(timeout);
        if (!current) return;
        setHealth(h);
        // A choice made while the keys were being checked does not survive a missing key.
        setChoices((c) => ({
          feedback: c.feedback && h.ai.feedback,
          parentSummary: c.parentSummary && h.ai.summary,
          avatarPhoto: c.avatarPhoto && h.ai.vision,
        }));
      },
      () => {
        clearTimeout(timeout);
        if (current) setHealth('unknown');
      },
    );
    return () => {
      current = false;
      clearTimeout(timeout);
      ctl.abort();
    };
  }, [api]);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-3xl font-extrabold">AI helpers (optional)</h2>
      <p className="text-lg">
        Everything works without AI. These extras need a key on the island server, and they start
        off until you turn them on.
      </p>
      {health === 'unknown' ? (
        <Notice tone="info">
          Couldn’t check the server’s keys right now. You can change these later.
        </Notice>
      ) : null}
      <ul className="flex flex-col gap-3">
        {AI_FEATURES.map((f) => {
          const hasKey = health && health !== 'unknown' ? health.ai[f.provider] : null;
          const disabled = hasKey === false;
          // Without a key there is no control to label: a plain row with an "Off" mark.
          const Row = disabled ? 'div' : 'label';
          return (
            <li key={f.key} className="rounded-3xl bg-cloud p-5 ring-2 ring-sand-deep">
              <Row
                className={['flex items-start gap-4', disabled ? '' : 'cursor-pointer'].join(' ')}
              >
                {disabled ? (
                  // Not available: a plain "Off" label rather than a faint disabled checkbox.
                  <span className="mt-0.5 flex-none rounded-full bg-pebble px-3 py-1 font-display text-base font-bold text-ink ring-2 ring-pebble-deep">
                    Off
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    className="mt-1 size-7 flex-none accent-[var(--color-sea-deep)]"
                    checked={choices[f.key]}
                    disabled={busy}
                    onChange={(e) => setChoices({ ...choices, [f.key]: e.target.checked })}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-xl font-bold">{f.title}</span>
                  <span className="block text-base text-ink-soft">{f.body}</span>
                  <span className="mt-2 flex items-start gap-2 text-base font-bold">
                    {hasKey === null ? (
                      <span className="text-ink-soft">Checking the server…</span>
                    ) : hasKey ? (
                      <>
                        <OkIcon />
                        <span>Key found on the server</span>
                      </>
                    ) : (
                      <>
                        <WarnIcon />
                        <span>
                          Needs <code className="font-mono">{f.keyName}</code> in the server’s
                          secrets file.
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button
          // Saving waits for the key check (at most 5 s), so the saved choices are the ones shown.
          disabled={busy || health === null}
          onClick={async () => {
            if (health === null) return;
            setBusy(true);
            // Save exactly what the wizard shows: a feature whose key is missing is Off.
            const keyFor = (k: keyof AiChoices) =>
              health && health !== 'unknown'
                ? health.ai[AI_FEATURES.find((f) => f.key === k)?.provider ?? 'feedback']
                : true;
            setSaveError(null);
            try {
              await onDone({
                feedback: choices.feedback && keyFor('feedback'),
                parentSummary: choices.parentSummary && keyFor('parentSummary'),
                avatarPhoto: choices.avatarPhoto && keyFor('avatarPhoto'),
              });
            } catch (e) {
              // The device's storage refused the write (quota, a failed transaction): say so and
              // keep the choices, so Save and finish can be tried again.
              recordDiagnostic('setup.ai-choices', e);
              setSaveError('Those choices didn’t save on this device. Please try again.');
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : health === null ? 'Checking the server…' : 'Save and finish'}
        </Button>
      </div>
      {saveError ? <Notice tone="error">{saveError}</Notice> : null}
    </div>
  );
}

// ---------- step 5: ready ----------

function ReadyStep({ kids }: { kids: ChildProfile[] }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <svg viewBox="0 0 64 64" className="size-20" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r="28"
          className="fill-sunshine stroke-sunshine-deep"
          strokeWidth="3"
        />
        <path
          d="m20 33 8 8 16-17"
          className="fill-none stroke-ink"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h2 className="font-display text-4xl font-extrabold">Your island is ready!</h2>
      <p className="max-w-lg text-lg">
        {listNames(kids.map((c) => c.name))} can start playing now. Each child makes their own
        character the first time they play.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => navigate('/', { replace: true })}>Start playing</Button>
        <Button variant="secondary" onClick={() => navigate('/parent/devices/pair')}>
          Pair another device
        </Button>
      </div>
    </div>
  );
}

// ---------- the wizard ----------

export function SetupWizard() {
  const services = useAppServices();
  const api = useParentApi();
  const gate = useParentGate();
  const device = useDeviceRecord();
  const [startedUnpaired, setStartedUnpaired] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [family, setFamily] = useState<FamilyDetails>({ familyName: '', passphrase: '', pin: '' });
  const [kids, setKids] = useState<NewChild[]>([]);
  const [created, setCreated] = useState<ChildProfile[]>([]);
  const [serverIds, setServerIds] = useState<FamilyIds | null>(null);
  const headingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (device !== undefined && startedUnpaired === null) setStartedUnpaired(!device.deviceToken);
  }, [device, startedUnpaired]);
  // Move focus to the new step's heading (screen readers, keyboards).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each step change
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  if (startedUnpaired === null) return null;
  // A device that already belongs to a family has nothing to set up.
  if (!startedUnpaired) return <Navigate to="/parent" replace />;

  const go = (s: Step) => setStep(s);

  return (
    <main className="min-h-dvh w-full bg-sand px-6 py-8 font-body text-ink">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-4">
          <p className="font-display text-2xl font-extrabold">Number Island setup</p>
          <StepTrack step={step} />
        </header>
        <section
          ref={headingRef}
          tabIndex={-1}
          className="rounded-[2rem] bg-paper p-6 shadow-[0_6px_0_var(--color-sand-deep)] ring-2 ring-sand-deep sm:p-8 focus:outline-none"
          aria-label={STEPS[step]}
        >
          {step === 0 ? (
            <FamilyStep
              initial={family}
              onNext={(f) => {
                setFamily(f);
                go(1);
              }}
            />
          ) : step === 1 ? (
            <ChildrenStep kids={kids} setKids={setKids} onBack={() => go(0)} onNext={() => go(2)} />
          ) : step === 2 ? (
            <DeviceStep
              onBack={() => go(1)}
              serverDone={serverIds !== null}
              onCreate={async (deviceName) => {
                // `POST /setup` succeeds once per server: its ids are kept the moment it answers,
                // and a retry after any local failure only repeats this device's part (adopting
                // the ids and saving the children, both idempotent).
                let ids = serverIds;
                if (!ids) {
                  try {
                    ids = await setupFamilyOnServer({ api, gate }, { ...family, deviceName });
                  } catch (e) {
                    // Refused because the family exists: if it is this setup's own (its answer was
                    // lost), the passphrase just chosen signs in, and setup carries on with these
                    // children. Otherwise it is another family's server.
                    if (!(e instanceof ApiError && e.code === 'setup_closed')) {
                      return describeApiError(e);
                    }
                    try {
                      ids = await recoverLostSetup(
                        { services, api, gate },
                        { passphrase: family.passphrase, deviceName },
                      );
                    } catch (recovery) {
                      recordDiagnostic('setup.recover', recovery);
                      return describeApiError(recovery);
                    }
                    if (!ids) return describeApiError(e);
                  }
                  setServerIds(ids);
                }
                try {
                  setCreated(await saveFamilyLocally(services, ids, kids));
                } catch (e) {
                  recordDiagnostic('setup', e);
                  return 'Your island was created, but this device couldn’t finish saving it. Try again.';
                }
                go(3);
                return null;
              }}
            />
          ) : step === 3 ? (
            <AiStep
              onDone={async (choices) => {
                await saveAiChoices(services, choices);
                go(4);
              }}
            />
          ) : (
            <ReadyStep kids={created} />
          )}
        </section>
      </div>
    </main>
  );
}
