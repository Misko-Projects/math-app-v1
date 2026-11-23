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
// A wrong answer (06 §6, 04 §6.4, #20 part 2): a soft knock and the cue at the widget, the
// feedback line, then a hint from the ladder (03 §5.8). A hint that drives the widget plays on a
// fresh one, in demo mode. A second wrong answer plays the worked solution the same way, step by
// step, and then "next" moves on. The lightbulb asks for the next hint at any time. After the
// easy item that follows a frustration signal, the child is offered a break.
//
// `?browse` with the dev flag (`localStorage['ni.dev'] = '1'`) opens the content browser instead:
// pick any skill and play one item of each of its templates.

import type {
  ChildProfile,
  HintStep,
  InteractionEvent,
  LessonStep,
  NarrationKey,
  PlannedRequest,
  ResponseValue,
  RunnerTask,
  StimulusSpec,
  WidgetAction,
} from '@number-island/shared';
import {
  BigButton,
  createDemoController,
  HomeButton,
  icons,
  ReplayButton,
  SpeechBubble,
  type WidgetDemo,
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
import { createIdleWatch, type IdleWatch } from '@/runner/idleWatch';
import { remediationQueue } from '@/runner/remediationQueue';
import { createTaskRunner, type PierTaskRunner, type RequestSummary } from '@/runner/TaskRunner';
import { createVisibleClock, type VisibleClock } from '@/runner/visibleClock';
import {
  Beads,
  type Cue,
  type Phase,
  PierBreakOffer,
  PierFrame,
  PierItemScreen,
  type SpokenLine,
} from './PierScreen';
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
  const [line, setLine] = useState<SpokenLine | null>(null);
  const [picture, setPicture] = useState<StimulusSpec | null>(null);
  const [breakOffer, setBreakOffer] = useState(false);
  // A hint that drives the widget, and the worked solution, play on a fresh widget.
  const [restarts, setRestarts] = useState(0);
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  // The widget's demo mode (03 §6.3). An op the widget does not animate is skipped and noted:
  // the step's line is still spoken.
  const { demo, restartWidget } = useMemo(() => {
    const base = createDemoController({
      strict: false,
      warn: (m) => recordDiagnostic('pier.demo', m),
    });
    let binds = 0;
    let waiting: (() => void)[] = [];
    const controller: WidgetDemo = {
      get ops() {
        return base.ops;
      },
      play: (action) => base.play(action),
      invite: (action) => base.invite(action),
      bind(impl) {
        const unbind = base.bind(impl);
        binds += 1;
        const ready = waiting;
        waiting = [];
        for (const resolve of ready) resolve();
        return unbind;
      },
    };
    /** Remounts the widget and resolves once the fresh one takes demo ops (never the old one). */
    const restart = (): Promise<void> => {
      const before = binds;
      setRestarts((n) => n + 1);
      return new Promise<void>((resolve) => {
        const check = () => (binds > before ? resolve() : waiting.push(check));
        check();
      });
    };
    return { demo: controller, restartWidget: restart };
  }, []);
  // What is playing now (a hint, a solution): a new item, or leaving, makes it stale.
  const playing = useRef(0);
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
  const runnerNow = useRef<PierTaskRunner | null>(null);
  runnerNow.current = runner;
  // The long-idle signal (04 §6.4 rule 4): 45 s of visible time without a touch while answering.
  const idle = useRef<IdleWatch | null>(null);
  useEffect(() => {
    const watch = createIdleWatch({
      now: clockNow,
      schedule: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
      onIdle: () => runnerNow.current?.idle(),
    });
    idle.current = watch;
    return () => {
      idle.current = null;
      watch.stop();
    };
  }, [clockNow]);
  useEffect(() => {
    if (phase === 'answer' && !picture) idle.current?.start();
    else idle.current?.stop();
  }, [phase, picture]);

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
          remediation: remediationQueue.take(child.id),
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
        queueRemediation: (r) => remediationQueue.add(child.id, r),
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
  const itemNo = useMemo(() => {
    presented.current += 1;
    return presented.current;
  }, [item]);
  const itemKey = `${itemNo}:${restarts}`;
  useEffect(() => {
    if (!item) return;
    let alive = true;
    playing.current += 1;
    trace.current = [];
    setCue(null);
    setLine(null);
    setPicture(null);
    setPhase('prompt');
    const ready = () => {
      if (!alive) return;
      readyAt.current = clockNow();
      setPhase('answer');
    };
    audio.say(item.prompt.narration, item.prompt.vars).then(ready, ready);
    return () => {
      alive = false;
      playing.current += 1;
    };
  }, [item, audio, setPhase, clockNow]);

  /** Speaks a line with its words in the bubble; resolves when it has been said. */
  const sayLine = useCallback(
    async (key: NarrationKey | undefined, vars?: Record<string, string | number>) => {
      if (!key) return;
      setLine({ say: key, vars });
      await audio.say(key, vars).catch(() => {});
    },
    [audio],
  );

  const act = useCallback(
    (action: WidgetAction) => demo.play(action).catch((e) => recordDiagnostic('pier.demo', e)),
    [demo],
  );

  /**
   * Plays one rung of the hint ladder (03 §5.8), after `before` (the feedback line of a wrong
   * answer), then hands the item back to the child.
   */
  const playHint = async (step: HintStep, before?: NarrationKey) => {
    playing.current += 1;
    const mine = playing.current;
    const stale = () => playing.current !== mine;
    setPhase('hint');
    setPicture(null);
    await sayLine(before);
    if (stale()) return;
    const actions = (step.actions ?? []).filter((a) => a.op !== 'replay-prompt');
    // The widget's part of a hint plays on a fresh widget, not on top of the child's work.
    const fresh = actions.length > 0 ? restartWidget() : null;
    await sayLine(step.say, step.vars);
    await fresh;
    if (stale()) return;
    if (item && step.actions?.some((a) => a.op === 'replay-prompt')) {
      await sayLine(item.prompt.narration, item.prompt.vars);
      if (stale()) return;
    }
    for (const action of actions) {
      await act(action);
      if (stale()) return;
    }
    if (step.overlay && step.overlay.kind !== 'none') setPicture(step.overlay);
    setLine(null);
    readyAt.current = clockNow();
    setPhase('answer');
  };

  /** Plays the worked solution (level 5): each step's line with its action, on a fresh widget. */
  const playSolution = async (steps: LessonStep[], before?: NarrationKey) => {
    playing.current += 1;
    const mine = playing.current;
    const stale = () => playing.current !== mine;
    setPhase('hint');
    setPicture(null);
    await sayLine(before);
    if (stale()) return;
    await restartWidget();
    if (stale()) return;
    for (const step of steps) {
      await Promise.all([sayLine(step.say, step.vars), step.action ? act(step.action) : null]);
      if (stale()) return;
    }
    setLine(null);
    setPhase('feedback');
  };

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
      // The deterministic line plays now; an AI line may follow it (06 §6). Nothing delivers one
      // until #21.
      fb.onAiFeedback(() => {});
      if (fb.retry) {
        audio.sfx('knock');
        setCue({ kind: 'again', say: fb.say.key });
        const again = runner.next();
        if (again?.kind === 'item') setTask(again);
        if (fb.hint) {
          void playHint(fb.hint, fb.say.key);
        } else {
          speak(fb.say.key);
          readyAt.current = clockNow();
          setPhase('answer');
        }
      } else if (fb.solution) {
        audio.sfx('knock');
        setCue({ kind: 'onward', say: fb.say.key });
        void playSolution(fb.solution, fb.say.key);
      } else {
        if (fb.correct) audio.sfx('chime');
        setCue({ kind: fb.correct ? 'right' : 'onward', say: fb.say.key });
        setPhase('feedback');
        speak(fb.say.key);
      }
    }, raise);
  };

  /** The lightbulb: the next rung of the ladder. */
  const onHint = () => {
    if (!runner || phaseNow.current !== 'answer') return;
    const step = runner.hint();
    if (!step) return;
    const shown = runner.current();
    if (shown?.kind === 'item') setTask(shown);
    void playHint(step);
  };

  const advance = (r: PierTaskRunner) => {
    setPhase('prompt');
    const upcoming = r.next();
    if (upcoming?.kind === 'item') setTask(upcoming);
    else end(r);
  };

  const goNext = () => {
    if (!runner || phaseNow.current !== 'feedback') return;
    // After the easy item that follows a frustration signal: offer a break first.
    if (runner.breakOffered()) {
      setPhase('prompt');
      setBreakOffer(true);
      speak('ui.pier.break');
      return;
    }
    advance(runner);
  };

  const answerBreak = (take: boolean) => {
    if (!runner || !breakOffer) return;
    audio.stop();
    runner.answerBreak(take);
    setBreakOffer(false);
    advance(runner);
  };

  const leave = () => {
    playing.current += 1;
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

  if (breakOffer) {
    return (
      <PierBreakOffer
        onKeep={() => answerBreak(false)}
        onBreak={() => answerBreak(true)}
        onLeave={leave}
      />
    );
  }

  return (
    <PierItemScreen
      item={item}
      tier={task?.tier ?? 'abstract'}
      itemKey={itemKey}
      phase={phase}
      cue={cue}
      line={line}
      picture={picture}
      demo={demo}
      progress={runner?.progress() ?? { done: 0, total: 0 }}
      onLeave={leave}
      onNext={goNext}
      onHint={onHint}
      onClosePicture={() => setPicture(null)}
      onResponse={onResponse}
      onInteract={(e) => {
        idle.current?.touch();
        trace.current.push(e);
      }}
    />
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
