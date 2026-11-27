// The child's home at `/play/:childId`: the island hub (`IslandHub`) while the session runs, and
// the calm sunset when it winds down ("Great playing! See you next time!", no guilt, 05 §7), after
// which the picker returns.

import type { ChildProfile } from '@number-island/shared';
import { BigButton, icons, ReplayButton, SpeechBubble, useSpeech } from '@number-island/ui';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ChildUi, useAppServices } from '@/app/AppServices';
import { recordDiagnostic } from '@/app/diagnostics';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { GuideScreen } from './GuideScreen';
import { IslandHub } from './IslandHub';
import { emptyRecap, type Recap, recapPhrases, sessionRecap } from './recap';

const WindDownRecap = lazy(() => import('./WindDownRecap'));

/**
 * The sunset stays this long before the picker comes back (a tap on "okay" goes sooner): from
 * the start of the goodbye, or from the end of the recap when there is one to say.
 */
export const SUNSET_MS = 9000;

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ChildHomePage() {
  const { childId = '' } = useParams();
  const profiles = useProfiles();
  const { session } = useSession();
  // The session that wound down: it is over by the time the sunset shows.
  const [sunset, setSunset] = useState<ActiveSession | null>(null);
  const windDown = useCallback(() => setSunset(session), [session]);
  // Switching guides (tap the guide on the island, 05 §10); a child with no guide yet chooses first.
  const [choosing, setChoosing] = useState(false);
  const chooseGuide = useCallback(() => setChoosing(true), []);
  if (profiles === undefined) return null;
  const index = [...profiles]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .findIndex((p) => sameId(p.id, childId));
  const child = profiles.find((p) => sameId(p.id, childId));
  // Only a started session plays here: a reload or a typed URL goes back to the picker.
  const playing = session !== null && sameId(session.childId, childId);
  if (!child || (!playing && sunset === null)) return <Navigate to="/" replace />;
  return (
    <ChildUi ageMode={child.grade === 'K' ? 'k' : 'g1-up'} guide={child.guide}>
      {sunset ? (
        <SunsetScreen child={child} session={sunset} />
      ) : choosing || child.guide === undefined ? (
        <GuideScreen child={child} onDone={() => setChoosing(false)} onWindDown={windDown} />
      ) : (
        <IslandHub
          child={child}
          index={Math.max(0, index)}
          onWindDown={windDown}
          onChangeGuide={chooseGuide}
        />
      )}
    </ChildUi>
  );
}

/**
 * The wind-down sunset (06 §2): warm, slow and short, then back to the picker. It shows and says
 * what the child made and built in the session (`recap.ts`), then the goodbye; with nothing made
 * or built, the goodbye alone.
 */
export function SunsetScreen({ child, session }: { child: ChildProfile; session: ActiveSession }) {
  const { say } = useSpeech();
  const { store, content, audio } = useAppServices();
  const navigate = useNavigate();
  const { gameData } = content.store;
  // undefined while the log is read; null with nothing to recap.
  const [recap, setRecap] = useState<Recap | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    store.events().then(
      (events) => {
        const found = sessionRecap(events, gameData, child.id, session);
        if (alive) setRecap(emptyRecap(found) ? null : found);
      },
      (e) => {
        recordDiagnostic('winddown.recap', e);
        if (alive) setRecap(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [store, gameData, child.id, session]);

  const speak = useCallback(
    () =>
      recap
        ? audio.sayPhrases(recapPhrases(recap, gameData)).catch(() => {})
        : Promise.resolve(say('ui.winddown.done')),
    [recap, audio, gameData, say],
  );
  useEffect(() => {
    if (recap === undefined) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const leaveLater = () => {
      if (alive) timer = setTimeout(() => navigate('/', { replace: true }), SUNSET_MS);
    };
    const spoken = speak();
    // The goodbye alone: the time runs from its start. A recap is heard to its end first.
    if (recap === null) leaveLater();
    else void spoken.then(leaveLater);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [recap, speak, navigate]);

  return (
    <div className="relative h-dvh min-h-[600px] w-full overflow-hidden" data-testid="sunset">
      <SunsetArt className="absolute inset-0 size-full" />
      <main className="relative flex h-full flex-col items-center justify-end gap-4 px-6 pb-[clamp(1rem,5vh,5rem)]">
        {recap ? (
          <Suspense fallback={null}>
            <WindDownRecap
              recap={recap}
              gameData={gameData}
              mode={child.grade === 'K' ? 'ten-frames' : 'base-ten'}
            />
          </Suspense>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-5">
          <SpeechBubble say="ui.winddown.done" tail="none" tone="sun" showText />
          <ReplayButton onPress={() => void speak()} />
          <BigButton
            label="ui.btn.okay"
            icon={<icons.CheckIcon tone="light" />}
            tone="leaf"
            showLabel
            onPress={() => navigate('/', { replace: true })}
          />
        </div>
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
