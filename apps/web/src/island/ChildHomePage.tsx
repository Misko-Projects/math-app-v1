// The child home at `/play/:childId`: a placeholder until the island hub (I01) lands. The island
// scene, Pip's greeting (spoken once, with a replay button), a Home button that ends the session
// and returns to the Profile Picker, and the small parent-gate entry in the corner.
//
// Wind-down (04 §6.4, 05 §8): when the session signals it, the current item finishes first. There
// are no items here yet, so the session ends at once with the signal's reason and the calm
// sunset plays ("Great playing! See you next time!", no guilt, 05 §7), then the picker returns.

import type { ChildProfile } from '@number-island/shared';
import {
  BigButton,
  HomeButton,
  icons,
  ReplayButton,
  SpeechBubble,
  useSpeech,
} from '@number-island/ui';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ChildUi } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import { ChildAvatar } from '@/app/picker/ChildAvatar';
import type { SessionController, WindDownReason } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { HoldToOpen } from '@/parent/HoldToOpen';
import type { GateHeldState } from '@/parent/ParentGateScreen';
import { IslandScene } from './IslandScene';

/** The sunset stays this long before the picker comes back (a tap on "okay" goes sooner). */
export const SUNSET_MS = 9000;

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ChildHomePage() {
  const { childId = '' } = useParams();
  const profiles = useProfiles();
  const { session } = useSession();
  const [sunset, setSunset] = useState<WindDownReason | null>(null);
  if (profiles === undefined) return null;
  const index = [...profiles]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .findIndex((p) => sameId(p.id, childId));
  const child = profiles.find((p) => sameId(p.id, childId));
  // Only a started session plays here: a reload or a typed URL goes back to the picker.
  const playing = session !== null && sameId(session.childId, childId);
  if (!child || (!playing && sunset === null)) return <Navigate to="/" replace />;
  return (
    <ChildUi ageMode={child.grade === 'K' ? 'k' : 'g1-up'}>
      {sunset ? (
        <SunsetScreen />
      ) : (
        <ChildHome child={child} index={Math.max(0, index)} onWindDown={setSunset} />
      )}
    </ChildUi>
  );
}

/** Ends the running session when the page goes away mid-session (the browser's back button). */
function useEndOnLeave(controller: SessionController, sessionId: string) {
  useEffect(() => {
    mountedIds.add(sessionId);
    return () => {
      mountedIds.delete(sessionId);
      // StrictMode's simulated unmount is followed at once by a remount; a real one is not.
      setTimeout(() => {
        if (mountedIds.has(sessionId)) return;
        const snap = controller.getSnapshot();
        if (snap.status === 'active' && snap.session.sessionId === sessionId) {
          void controller.end('child-exit').catch((e) => recordDiagnostic('session.end', e));
        }
      }, 0);
    };
  }, [controller, sessionId]);
}

/** Sessions whose home is mounted right now (StrictMode remounts re-add theirs). */
const mountedIds = new Set<string>();

function ChildHome({
  child,
  index,
  onWindDown,
}: {
  child: ChildProfile;
  index: number;
  onWindDown: (reason: WindDownReason) => void;
}) {
  const { say } = useSpeech();
  const navigate = useNavigate();
  const { session, controller } = useSession();
  const sessionId = session?.sessionId ?? '';
  useEndOnLeave(controller, sessionId);

  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    say('ui.home.hello');
  }, [say]);

  // The wind-down hook: no item is ever in progress here yet, so end now and show the sunset.
  useEffect(
    () =>
      controller.onWindDown((reason, s) => {
        if (s.sessionId !== sessionId) return;
        onWindDown(reason);
        void controller.end(reason).catch((e) => recordDiagnostic('session.end', e));
      }),
    [controller, sessionId, onWindDown],
  );

  const goHome = async () => {
    try {
      await controller.end('child-exit');
    } catch (e) {
      recordDiagnostic('session.end', e);
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="relative h-dvh min-h-[600px] w-full" data-testid="child-home">
      <main className="absolute inset-0">
        <IslandScene
          className="absolute inset-0 size-full"
          title="A sunny little island with palm trees, a workshop hut and friendly shore critters."
        />
        {/* Top left: Home (back to "Who is playing?", 06 §2 Island hub) and who is playing. The
            top right stays clear for the scene's sun. */}
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-10 flex items-center gap-4">
          <HomeButton onPress={() => void goHome()} />
          <div className="flex items-center gap-3 rounded-pill bg-paper/90 py-2 pr-6 pl-2 shadow-soft ring-4 ring-sand-deep">
            <ChildAvatar
              name={child.name}
              avatar={child.avatar}
              index={index}
              className="size-16"
            />
            <span className="max-w-[12rem] truncate font-body text-[1.5rem] font-bold text-ink">
              {child.name}
            </span>
          </div>
        </div>
        <div className="pointer-events-none relative flex items-center justify-center gap-5 px-6 pt-[clamp(6.5rem,16vh,9rem)] *:pointer-events-auto">
          <SpeechBubble say="ui.home.hello" tail="none" showText />
          <ReplayButton onPress={() => say('ui.home.hello')} />
        </div>
      </main>
      <footer className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))]">
        <HoldToOpen
          onOpen={() =>
            navigate('/parent', { state: { gateHeldAt: Date.now() } satisfies GateHeldState })
          }
        />
      </footer>
    </div>
  );
}

/** The wind-down sunset (06 §2): warm, slow and short, then back to the picker. */
export function SunsetScreen() {
  const { say } = useSpeech();
  const navigate = useNavigate();
  useEffect(() => {
    say('ui.winddown.done');
    const t = setTimeout(() => navigate('/', { replace: true }), SUNSET_MS);
    return () => clearTimeout(t);
  }, [say, navigate]);
  return (
    <div className="relative h-dvh min-h-[600px] w-full overflow-hidden" data-testid="sunset">
      <SunsetArt className="absolute inset-0 size-full" />
      <main className="relative flex h-full flex-col items-center justify-end gap-6 px-6 pb-[clamp(2rem,9vh,5rem)]">
        <div className="flex items-center gap-5">
          <SpeechBubble say="ui.winddown.done" tail="none" tone="sun" showText />
          <ReplayButton onPress={() => say('ui.winddown.done')} />
        </div>
        <BigButton
          label="ui.btn.okay"
          icon={<icons.CheckIcon tone="light" />}
          tone="leaf"
          showLabel
          onPress={() => navigate('/', { replace: true })}
        />
      </main>
    </div>
  );
}

function SunsetArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      role="img"
      aria-label="The sun sets over the sea behind the island."
    >
      <defs>
        <linearGradient id="sunset-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6aa8" />
          <stop offset="0.45" stopColor="#d98aa0" />
          <stop offset="0.8" stopColor="#f6b07a" />
          <stop offset="1" stopColor="#fbd48f" />
        </linearGradient>
        <linearGradient id="sunset-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a6fa3" />
          <stop offset="1" stopColor="#2f4d73" />
        </linearGradient>
      </defs>
      <rect width="1600" height="640" fill="url(#sunset-sky)" />
      <g fill="#fff6e0" opacity={0.85}>
        <circle cx={220} cy={120} r={4} />
        <circle cx={420} cy={70} r={3} />
        <circle cx={1180} cy={90} r={4} />
        <circle cx={1380} cy={160} r={3} />
        <circle cx={760} cy={50} r={3} />
      </g>
      <g className="motion-entrance" style={{ animation: 'ni-sunset 4s ease-out both' }}>
        <circle cx={800} cy={600} r={170} fill="#fbc96b" opacity={0.35} />
        <circle cx={800} cy={600} r={130} fill="#f9b24e" stroke="#e08a2e" strokeWidth={6} />
      </g>
      <rect y="600" width="1600" height="400" fill="url(#sunset-sea)" />
      <g stroke="#fbd48f" strokeWidth={8} strokeLinecap="round" opacity={0.75}>
        <path d="M700 622h200M740 646h120" />
      </g>
      <g fill="none" stroke="#a9a3cf" strokeWidth={5} strokeLinecap="round" opacity={0.6}>
        <path d="M160 700q20-14 40 0t40 0 40 0" />
        <path d="M1260 760q20-14 40 0t40 0 40 0" />
        <path d="M380 840q20-14 40 0t40 0 40 0" />
      </g>
      {/* the island in silhouette, with a palm */}
      <path d="M1040 612c60-60 260-70 360 0Z" fill="#3a3560" />
      <path
        d="M1210 600c-6-60 2-110 26-150"
        fill="none"
        stroke="#3a3560"
        strokeWidth={16}
        strokeLinecap="round"
      />
      <g fill="#3a3560">
        <path d="M1236 452c-30-30-80-30-110 0 40-10 70-8 110 0Z" />
        <path d="M1236 452c30-34 84-30 110 4-40-12-72-10-110-4Z" />
        <path d="M1236 452c-36 4-60 30-66 64 22-28 40-46 66-64Z" />
        <path d="M1236 452c36 2 62 26 70 60-24-26-44-44-70-60Z" />
      </g>
    </svg>
  );
}
