// Practice Pier at `/play/:childId/pier` (05 §4): the plain workshop that hosts every format.
// #20 part 1: one request, played item by item through the TaskRunner.
//
// The screen (06 §2 workshop layout): Home, the prompt in a speech bubble with a replay button,
// the widget in the workshop area, a right / look-again cue beside "next", and the request's
// progress as beads. At the end a short summary, then back to the child home (which plays the
// sunset when the session is winding down).
//
// One item on screen: the prompt is spoken first and the widget takes no input until it has
// finished (item ready: latency is measured from there, 04 §2.3). After a wrong first try the same
// widget stays, with the child's work in it, for the second try.
//
// `?browse` with the dev flag (`localStorage['ni.dev'] = '1'`) opens the content browser instead:
// pick any skill and play one item of each of its templates.

import type {
  ChildProfile,
  InteractionEvent,
  NarrationKey,
  PlannedRequest,
  ResponseValue,
  RunnerTask,
} from '@number-island/shared';
import {
  BigButton,
  HomeButton,
  icons,
  ReplayButton,
  SpeechBubble,
  useNarrationText,
  VisuallyHidden,
  WidgetHost,
} from '@number-island/ui';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ChildUi, useAppServices } from '@/app/AppServices';
import { devFlag } from '@/app/devFlag';
import { recordDiagnostic } from '@/app/diagnostics';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { childContext } from '@/runner/childContext';
import { createTaskRunner, type PierTaskRunner, type RequestSummary } from '@/runner/TaskRunner';
import { createVisibleClock, type VisibleClock } from '@/runner/visibleClock';
import {
  type BrowsePick,
  browseRequest,
  browseSkills,
  pierMisfit,
  pierPlayable,
  planPierRequest,
} from './pierRequest';

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function PierPage() {
  const { childId = '' } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const profiles = useProfiles();
  const { session } = useSession();
  const [browsing, setBrowsing] = useState<BrowsePick | null>(null);
  if (profiles === undefined) return null;
  const child = profiles.find((p) => sameId(p.id, childId));
  // Only a started session plays here, like the child home.
  if (!child || session === null || !sameId(session.childId, childId)) {
    return <Navigate to="/" replace />;
  }
  const home = () => navigate(`/play/${child.id}`, { replace: true });
  const browser = query.has('browse') && devFlag();
  let screen: ReactNode;
  if (!browser) {
    screen = <PierRequest key="plan" child={child} session={session} skill={null} onLeave={home} />;
  } else if (browsing === null) {
    screen = <ContentBrowser onPick={setBrowsing} onLeave={home} />;
  } else {
    screen = (
      <PierRequest
        key={`${browsing.skillId}:${browsing.templateId}`}
        child={child}
        session={session}
        skill={browsing}
        onLeave={() => setBrowsing(null)}
      />
    );
  }
  return <ChildUi ageMode={child.grade === 'K' ? 'k' : 'g1-up'}>{screen}</ChildUi>;
}

type ItemTask = Extract<RunnerTask, { kind: 'item' }>;

type Cue = { kind: 'right' | 'again' | 'onward'; say: NarrationKey | undefined };

type Phase =
  | 'prompt' // the prompt is being spoken; no input yet
  | 'answer' // item ready: the widget takes input
  | 'checking' // an answer is being checked and written
  | 'feedback'; // resolved: "next" moves on

/** Throws `error` from render, so the route's error screen shows it (never a silent stall). */
function useRaise(): (error: unknown) => void {
  const [, set] = useState<null>(null);
  return useCallback((error: unknown) => {
    set(() => {
      throw error;
    });
  }, []);
}

function PierRequest({
  child,
  session,
  skill,
  onLeave,
}: {
  child: ChildProfile;
  session: ActiveSession;
  /** The content browser's pick; null plays the planner's request. */
  skill: BrowsePick | null;
  onLeave: () => void;
}) {
  const services = useAppServices();
  const { controller } = useSession();
  const raise = useRaise();
  const { store, audio, content } = services;

  const [runner, setRunner] = useState<PierTaskRunner | null>(null);
  const [task, setTask] = useState<ItemTask | null>(null);
  const [phase, showPhase] = useState<Phase>('prompt');
  // The phase as of now, for handlers: two taps can land before the next render (a double tap on
  // "next" must not skip an item).
  const phaseNow = useRef<Phase>('prompt');
  const setPhase = useCallback((p: Phase) => {
    phaseNow.current = p;
    showPhase(p);
  }, []);
  const [cue, setCue] = useState<Cue | null>(null);
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  const readyAt = useRef(0);
  // Latency counts visible time only: a tablet asleep mid-item adds nothing (04 §2.3, §7).
  const clock = useRef<VisibleClock | null>(null);
  useEffect(() => {
    const c = createVisibleClock();
    clock.current = c;
    return () => {
      clock.current = null;
      c.dispose();
    };
  }, []);
  const clockNow = useCallback(() => clock.current?.now() ?? 0, []);
  const trace = useRef<InteractionEvent[]>([]);

  // One runner per mounted request. The ref outlives StrictMode's simulated remount, so the
  // request is accepted (and its event written) once.
  const starting = useRef<Promise<PierTaskRunner> | null>(null);
  useEffect(() => {
    let alive = true;
    starting.current ??= (async () => {
      const engine = await import('@number-island/engine');
      const graph = content.store.graph;
      const ctx = childContext(child, await store.childSettings(child.id));
      const budgetMs = session.budgetMinutes * 60_000;
      let request: PlannedRequest | null;
      if (skill !== null) {
        request = browseRequest(graph, skill, store.now() % 1_000_000);
      } else {
        const state = await store.skillStates(child.id);
        if (!state) throw new Error(`Practice Pier: no learner state for ${child.id}`);
        request = planPierRequest(engine, {
          child: ctx,
          state,
          graph,
          island: await store.island(),
          now: store.now(),
          minutes: Math.max(1, Math.ceil((budgetMs - controller.activeMs()) / 60_000)),
        });
        if (!request) throw new Error('Practice Pier: the plan holds nothing the pier can play');
      }
      return createTaskRunner({
        engine,
        store,
        graph,
        child: ctx,
        request,
        hosts: pierPlayable,
        session: {
          sessionId: session.sessionId,
          budgetMs,
          elapsedMs: () => controller.activeMs(),
          windingDown: () => {
            const snap = controller.getSnapshot();
            return snap.status === 'active' && snap.windDown !== null;
          },
          recordMath: (ms) => controller.recordMath(ms),
          recordItem: () => controller.recordItem(),
        },
      });
    })();
    starting.current.then((r) => {
      if (!alive) return;
      setRunner(r);
      const first = r.current();
      if (first?.kind === 'item') setTask(first);
      else void r.finish().then((s) => alive && setSummary(s), raise);
    }, raise);
    return () => {
      alive = false;
    };
  }, [child, session, skill, store, content, controller, raise]);

  // A new item: speak the prompt, then the item is ready.
  const item = task?.item ?? null;
  // One widget instance per presented item: it stays mounted through the second try and the
  // feedback, with the child's work in it, and a new item (even the same one again) remounts.
  const presented = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new item is what advances the key
  const itemKey = useMemo(() => {
    presented.current += 1;
    return presented.current;
  }, [item]);
  useEffect(() => {
    if (!item) return;
    let alive = true;
    trace.current = [];
    setCue(null);
    setPhase('prompt');
    const ready = () => {
      if (!alive) return;
      readyAt.current = clockNow();
      setPhase('answer');
    };
    audio.say(item.prompt.narration, item.prompt.vars).then(ready, ready);
    return () => {
      alive = false;
    };
  }, [item, audio, setPhase, clockNow]);

  // Leaving another way than Home (the browser's back button) still completes the request.
  // StrictMode's simulated unmount is followed at once by a remount; a real one is not.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current) return;
        void starting.current
          ?.then((r) => r.finish())
          .catch((e) => recordDiagnostic('pier.finish', e));
      }, 0);
    };
  }, []);

  const speak = useCallback(
    (key: NarrationKey | undefined) => {
      if (key) void audio.say(key).catch(() => {});
    },
    [audio],
  );

  const end = useCallback(
    (r: PierTaskRunner) => {
      setTask(null);
      r.finish().then((s) => {
        setSummary(s);
        speak('ui.pier.done');
      }, raise);
    },
    [raise, speak],
  );

  const onResponse = (response: ResponseValue) => {
    if (!runner || phaseNow.current !== 'answer') return;
    // Only the placeholder answers a skip: the widget is missing, or it failed to load or render.
    // That is not the child's answer, so nothing is logged and the request ends here.
    if (response.kind === 'skip') {
      setPhase('checking');
      end(runner);
      return;
    }
    setPhase('checking');
    const latencyMs = clockNow() - readyAt.current;
    runner.submit(response, { latencyMs, trace: [...trace.current] }).then((fb) => {
      if (fb.retry) {
        audio.sfx('knock');
        setCue({ kind: 'again', say: fb.say.key });
        const again = runner.next();
        if (again?.kind === 'item') setTask(again);
        readyAt.current = clockNow();
        setPhase('answer');
      } else {
        if (fb.correct) audio.sfx('chime');
        setCue({ kind: fb.correct ? 'right' : 'onward', say: fb.say.key });
        setPhase('feedback');
      }
      speak(fb.say.key);
    }, raise);
  };

  const goNext = () => {
    if (!runner || phaseNow.current !== 'feedback') return;
    setPhase('prompt');
    const upcoming = runner.next();
    if (upcoming?.kind === 'item') setTask(upcoming);
    else end(runner);
  };

  const leave = () => {
    audio.stop();
    if (!runner) onLeave();
    else runner.finish().then(onLeave, raise);
  };

  if (summary) {
    return (
      <PierFrame top={<HomeButton onPress={leave} />} testId="pier-summary">
        <div className="flex h-full flex-col items-center justify-center gap-8">
          <div className="flex items-center gap-5">
            <SpeechBubble say="ui.pier.done" tail="none" tone="sun" showText />
            <ReplayButton onPress={() => speak('ui.pier.done')} />
          </div>
          <Beads done={summary.items} total={summary.items} />
          <BigButton
            label="ui.btn.okay"
            icon={<icons.CheckIcon tone="light" />}
            tone="leaf"
            showLabel
            onPress={leave}
          />
        </div>
      </PierFrame>
    );
  }

  const progress = runner?.progress() ?? { done: 0, total: 0 };
  return (
    <PierFrame
      testId="pier"
      phase={item ? phase : 'loading'}
      top={
        <>
          <HomeButton onPress={leave} />
          {item && (
            <div className="flex min-w-0 flex-1 items-center">
              <SpeechBubble say={item.prompt.narration} vars={item.prompt.vars} tail="left" />
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-4">
            <CueBadge cue={cue} />
            {phase === 'feedback' && (
              <BigButton
                label="ui.btn.next"
                icon={<icons.ArrowIcon tone="light" />}
                tone="leaf"
                onPress={goNext}
              />
            )}
          </div>
        </>
      }
      bottom={<Beads done={progress.done} total={progress.total} />}
    >
      {item && task && (
        <WidgetHost
          className="size-full"
          config={item.widget}
          tier={task.tier}
          itemKey={itemKey}
          disabled={phase !== 'answer'}
          onResponse={onResponse}
          onInteract={(e) => trace.current.push(e)}
        />
      )}
    </PierFrame>
  );
}

/** The workshop frame: a top row, the widget area (a bounded box the widget measures) and a bottom row. */
function PierFrame({
  top,
  bottom,
  testId,
  phase,
  children,
}: {
  top: ReactNode;
  bottom?: ReactNode;
  testId: string;
  /** Where the item on screen is (tests wait on it instead of on time). */
  phase?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid h-dvh min-h-[600px] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden bg-sky-light px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid={testId}
      data-phase={phase}
    >
      <header className="flex min-h-24 items-center gap-4">{top}</header>
      <main
        className="grid min-h-0 overflow-auto rounded-card border-[3px] border-sand-deep bg-sand p-6 shadow-soft"
        data-testid="pier-stage"
      >
        {children}
      </main>
      <footer className="flex min-h-7 items-center justify-center">{bottom}</footer>
    </div>
  );
}

/** Progress through the request: one bead per item, filled when done (shape and fill, not colour alone). */
function Beads({ done, total }: { done: number; total: number }) {
  const label = useNarrationText()('ui.pier.progress');
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="flex items-center gap-2"
      data-testid="pier-progress"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: beads have no identity beyond their place
          key={i}
          aria-hidden="true"
          className={
            i < done
              ? 'size-6 rounded-full border-[3px] border-leaf-deep bg-leaf'
              : 'size-4 rounded-full border-[3px] border-sand-deep bg-paper'
          }
        />
      ))}
    </div>
  );
}

const CUE_TONE: Record<Cue['kind'], string> = {
  right: 'bg-leaf border-leaf-deep',
  again: 'bg-sunshine-light border-wood-deep',
  onward: 'bg-sky border-sea-deep',
};

/** The right / look-again cue (06 §6: never a red X): a picture, with the spoken line as its text. */
function CueBadge({ cue }: { cue: Cue | null }) {
  const narrationText = useNarrationText();
  return (
    <div role="status" data-testid="pier-cue" data-cue={cue?.kind ?? 'none'}>
      {cue && (
        <span
          className={`flex size-16 items-center justify-center rounded-full border-4 ${CUE_TONE[cue.kind]}`}
        >
          <span className="size-9" aria-hidden="true">
            {cue.kind === 'right' ? (
              <icons.StarIcon />
            ) : cue.kind === 'again' ? (
              <LookAgainIcon />
            ) : (
              <icons.ArrowIcon />
            )}
          </span>
          <VisuallyHidden>{cue.say ? narrationText(cue.say) : null}</VisuallyHidden>
        </span>
      )}
    </div>
  );
}

function LookAgainIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d="M38 24a14 14 0 1 1-4.6-10.4"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M36 5v11H25"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The dev content browser: every skill with templates. A skill plays one item of each of its templates; a template chip plays that template alone. */
function ContentBrowser({
  onPick,
  onLeave,
}: {
  onPick: (pick: BrowsePick) => void;
  onLeave: () => void;
}) {
  const { content } = useAppServices();
  const graph = content.store.graph;
  const skills = useMemo(() => browseSkills(graph), [graph]);
  const [filter, setFilter] = useState('');
  const shown = skills.filter((s) =>
    `${s.skillId} ${graph.skills[s.skillId]?.name ?? ''} ${s.templates.map((t) => t.format).join(' ')}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const chip =
    'min-h-11 rounded-pill border-[3px] border-sand-deep bg-paper px-3 font-body text-[1rem] text-ink disabled:opacity-60';
  return (
    <PierFrame
      testId="pier-browser"
      top={
        <>
          <HomeButton onPress={onLeave} />
          <h1 className="font-display text-[1.75rem] font-bold text-ink">Content browser (dev)</h1>
          <label className="ml-auto flex items-center gap-3 font-body text-[1.125rem] text-ink">
            Find
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-12 w-64 rounded-pill border-[3px] border-sand-deep bg-paper px-4"
            />
          </label>
        </>
      }
    >
      <ul className="grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))]">
        {shown.map((s) => (
          <li
            key={s.skillId}
            className="flex flex-col gap-2 rounded-card border-[3px] border-sand-deep bg-paper/60 p-3"
          >
            <button
              type="button"
              disabled={!s.templates.some(pierPlayable)}
              onClick={() => onPick({ skillId: s.skillId, templateId: null })}
              className="min-h-11 text-left font-body text-[1.125rem] font-bold text-ink underline disabled:no-underline disabled:opacity-60"
            >
              {s.skillId} {graph.skills[s.skillId]?.name}
            </button>
            <div className="flex flex-wrap gap-2">
              {s.templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={chip}
                  disabled={!pierPlayable(t)}
                  title={pierMisfit(t) ?? undefined}
                  onClick={() => onPick({ skillId: s.skillId, templateId: t.id })}
                >
                  {t.id.slice(s.skillId.length + 1)} {t.format} ({t.tier})
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </PierFrame>
  );
}
