// The Profile Picker (06 §2, 05 §2: the core loop starts here). Big avatar cards; tapping one
// speaks the child's name, then opens their picture-password pad (if they have one) or starts the
// session. "Who is playing?" plays once on entry and has a replay button. The small parent-gate
// entry sits in the corner. Child screens show no network status (06 §8).
//
// Audio unlocks on the first tap here (06 §5): while the AudioContext is locked, a full-screen
// "Tap to start" covers the picker, and its tap unlocks audio and then asks who is playing.

import type { ChildProfile } from '@number-island/shared';
import { ReplayButton, useNarrationText, useSpeech } from '@number-island/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProfiles } from '@/data/hooks';
import { IslandScene } from '@/island/IslandScene';
import { HoldToOpen } from '@/parent/HoldToOpen';
import type { GateHeldState } from '@/parent/ParentGateScreen';
import { ChildUi, useAppServices } from '../AppServices';
import { recordDiagnostic } from '../diagnostics';
import { useAudioState } from '../hooks';
import type { BlockedReason } from '../session/SessionController';
import { useSession } from '../session/SessionProvider';
import { ChildAvatar } from './ChildAvatar';
import { PicturePad } from './PicturePad';
import { RestingOverlay } from './RestingOverlay';
import { TapToStart } from './TapToStart';

/** How long a tapped card waits for its name to be spoken before moving on. */
export const NAME_WAIT_MS = 1400;

type Phase =
  | { kind: 'pick' }
  | { kind: 'password'; child: ChildProfile }
  | { kind: 'resting'; reason: BlockedReason };

/** Balanced rows: 1–4 in one row, 5–6 as 3 + 3, 7–8 as 4 + 4 (no scroll at 1280×800 for ≤ 6). */
export function pickerColumns(n: number): number {
  if (n <= 4) return Math.max(1, n);
  if (n <= 6) return 3;
  return 4;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function ProfilePicker() {
  return (
    <ChildUi ageMode="k">
      <PickerScreen />
    </ChildUi>
  );
}

function PickerScreen() {
  const { audio } = useAppServices();
  const audioState = useAudioState();
  const locked = audioState === 'locked';
  const { say } = useSpeech();
  const text = useNarrationText();
  const navigate = useNavigate();
  const session = useSession();
  const profiles = useProfiles();
  const children = useMemo(
    () =>
      [...(profiles ?? [])]
        .filter((p) => p.deletedAt === undefined)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
    [profiles],
  );
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [selected, setSelected] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  // Back on the picker: no one is playing. A session left running (the browser's back button)
  // ends as a child exit, and sessions this device never closed are closed as abandoned.
  const { controller } = session;
  useEffect(() => {
    mounted.current = true;
    if (controller.getSnapshot().status === 'active') {
      void controller.end('child-exit').catch((e) => recordDiagnostic('session.end', e));
    }
    void controller.closeAbandoned().catch((e) => recordDiagnostic('session.abandoned', e));
    return () => {
      mounted.current = false;
    };
  }, [controller]);

  // "Who is playing?" once on entry; while audio is locked it waits for Tap to start.
  const asked = useRef(false);
  useEffect(() => {
    if (locked || asked.current) return;
    asked.current = true;
    say('ui.profile.who-is-playing');
  }, [locked, say]);

  const unlock = () => {
    // unlock() must start inside the tap (06 §5); the question follows once audio runs.
    const unlocking = audio.unlock();
    asked.current = true;
    void unlocking.then(() => say('ui.profile.who-is-playing'));
  };

  // Never rejects: a failed session write (storage full, a child deleted by sync while the pad
  // was open) returns to the picker, so the child can tap again rather than face a stuck pad.
  const begin = useCallback(
    async (child: ChildProfile) => {
      try {
        const result = await session.start(child.id, 'child');
        if (!mounted.current) return;
        if (result.ok) {
          navigate(`/play/${child.id}`);
        } else if (result.reason === 'elsewhere') {
          // Another window kept playing (it didn't yield in time): back to the picker, nothing
          // started. A tap tries again.
          recordDiagnostic('picker.start', new Error('another window is still playing'));
          setSelected(null);
          setPhase({ kind: 'pick' });
        } else {
          setSelected(null);
          setPhase({ kind: 'resting', reason: result.reason });
        }
      } catch (e) {
        recordDiagnostic('picker.start', e);
        if (!mounted.current) return;
        setSelected(null);
        setPhase({ kind: 'pick' });
      }
    },
    [navigate, session],
  );

  const choose = async (child: ChildProfile) => {
    // Only from the open picker: never under Tap to start (audio unlocks first, 06 §5) or an
    // overlay. The covered cards are also inert, so they can't take focus or a key press.
    if (busy.current || locked || phase.kind !== 'pick') return;
    busy.current = true;
    setSelected(child.id);
    try {
      audio.cancelSpeech();
      // Names aren't pre-rendered: on-device Web Speech says them (02 §5.5).
      await Promise.race([audio.sayText(child.name, { voice: 'narrator' }), delay(NAME_WAIT_MS)]);
      const allowed = await session.canStart(child.id);
      if (!mounted.current) return;
      if (!allowed.ok) {
        setSelected(null);
        setPhase({ kind: 'resting', reason: allowed.reason });
      } else if (child.picturePasswordHash) {
        setPhase({ kind: 'password', child });
      } else {
        await begin(child);
      }
    } catch (e) {
      recordDiagnostic('picker.start', e);
      if (mounted.current) setSelected(null);
    } finally {
      busy.current = false;
    }
  };

  const backToPicker = () => {
    setSelected(null);
    setPhase({ kind: 'pick' });
  };

  const columns = pickerColumns(children.length);
  const indexOf = (id: string) => children.findIndex((c) => c.id === id);

  return (
    <div className="relative h-dvh min-h-[600px] w-full overflow-hidden">
      <IslandScene
        className="absolute inset-0 size-full"
        title="A sunny little island with palm trees and friendly shore critters."
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(255_250_240/0.72),rgb(255_250_240/0.35)_55%,rgb(255_250_240/0.1))]" />
      <main
        className="relative flex h-full flex-col items-center gap-[clamp(1rem,4vh,2.5rem)] overflow-y-auto px-6 pt-[clamp(1.25rem,5vh,3rem)] pb-28"
        inert={phase.kind !== 'pick' || locked}
      >
        <div className="flex items-center gap-5">
          <h1 className="font-display text-[clamp(2.75rem,5.5vw,4.25rem)] leading-none font-extrabold tracking-tight text-ink [text-shadow:0_3px_0_#fff]">
            {text('ui.profile.who-is-playing')}
          </h1>
          <ReplayButton onPress={() => say('ui.profile.who-is-playing')} />
        </div>
        <ul
          aria-label={text('ui.profile.who-is-playing')}
          data-testid="profile-cards"
          data-columns={columns}
          className="flex flex-wrap content-center justify-center gap-6 my-auto"
          style={{ maxWidth: `calc(${columns} * 13rem + ${columns - 1} * 1.5rem)` }}
        >
          {children.map((child, i) => (
            <li key={child.id}>
              <ProfileCard
                child={child}
                index={i}
                selected={selected === child.id}
                dimmed={selected !== null && selected !== child.id}
                onPress={() => void choose(child)}
              />
            </li>
          ))}
        </ul>
      </main>

      {phase.kind === 'password' ? (
        <PicturePad
          child={phase.child}
          index={indexOf(phase.child.id)}
          onClose={backToPicker}
          onUnlock={() => void begin(phase.child)}
        />
      ) : null}
      {phase.kind === 'resting' ? (
        <RestingOverlay reason={phase.reason} onDone={backToPicker} />
      ) : null}
      {locked ? <TapToStart onStart={unlock} /> : null}

      <footer className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30">
        <HoldToOpen
          onOpen={() =>
            navigate('/parent', { state: { gateHeldAt: Date.now() } satisfies GateHeldState })
          }
        />
      </footer>
    </div>
  );
}

function ProfileCard({
  child,
  index,
  selected,
  dimmed,
  onPress,
}: {
  child: ChildProfile;
  index: number;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={child.name}
      aria-pressed={selected}
      data-child={child.id}
      className={[
        'group flex w-[13rem] flex-col items-center gap-2 rounded-card bg-paper px-3 pt-4 pb-4',
        'ring-4 transition-[transform,opacity,box-shadow] duration-200',
        'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink',
        selected
          ? 'motion-entrance animate-pop-in -translate-y-1 ring-sea-deep shadow-[0_10px_0_var(--color-sea-dark)]'
          : 'ring-sand-deep shadow-[0_8px_0_var(--color-sand-deep)] active:translate-y-[5px] active:shadow-[0_3px_0_var(--color-sand-deep)]',
        dimmed ? 'opacity-60' : '',
      ].join(' ')}
    >
      <ChildAvatar
        name={child.name}
        avatar={child.avatar}
        index={index}
        className="size-[168px] flex-none"
      />
      <span
        className={[
          'line-clamp-2 w-full px-1 text-center font-body leading-[1.15] font-bold [overflow-wrap:break-word] text-ink',
          child.name.length > 10 ? 'text-[1.5rem]' : 'text-[1.75rem]',
        ].join(' ')}
      >
        {child.name}
      </span>
    </button>
  );
}
