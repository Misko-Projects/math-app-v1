// Practice Pier (05 §4): the plain workshop that hosts every format. One request, played item by
// item through the TaskRunner the app passes in (02 §5.6): the island's request arrives through
// the workshop host (`PierWorkshop`), the dev content browser's through `/play/:childId/pier`.
//
// The screen (06 §2 workshop layout): Home, the prompt in a speech bubble with a replay button,
// the widget in the workshop area, a right / look-again cue beside "next", and the request's
// progress as beads. At the end a short summary, then back to the island (which plays the
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
// A lesson (03 §6, #20 part 3) plays in the same screen, one step at a time: the step's line is
// spoken and shown while the example's widget animates the step in demo mode, then the next step
// follows. At the end of a faded example the widget is the child's (no hand points at what to do:
// that would be the answer), a right answer moves on, and after a second unsuccessful try the demo does it (no "wrong"
// language). "Show me again" repeats the current step's line. The lesson's scaffolded items are
// ordinary items whose first hint plays before the child starts.
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ChildUi, useAppServices } from '@/app/AppServices';
import { devFlag } from '@/app/devFlag';
import { recordDiagnostic } from '@/app/diagnostics';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { firstProblem } from '@/island/firstProblem';
import { type AnswerTime, createAnswerTime } from '@/runner/answerTime';
import { createIdleWatch, type IdleWatch } from '@/runner/idleWatch';
import { createSayAgain, type SayAgain } from '@/runner/sayAgain';
import type {
  PierItemTask,
  PierLessonStep,
  PierTaskRunner,
  RequestSummary,
} from '@/runner/TaskRunner';
import { useRaise, useRequestRunner } from '@/runner/useRequestRunner';
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
  pierLesson,
  pierMisfit,
  pierPlayable,
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
  // The island's requests come through the workshop host; this page is the dev content browser.
  if (!query.has('browse') || !devFlag()) return <Navigate to={`/play/${child.id}`} replace />;
  return (
    <ChildUi ageMode={child.grade === 'K' ? 'k' : 'g1-up'}>
      {browsing === null ? (
        <ContentBrowser onPick={setBrowsing} onLeave={home} />
      ) : (
        <BrowsedRequest
          key={`${browsing.skillId}:${browsing.templateId}:${browsing.lesson === true}`}
          child={child}
          session={session}
          pick={browsing}
          onLeave={() => setBrowsing(null)}
        />
      )}
    </ChildUi>
  );
}

/** The content browser's pick as a request, with its own runner. */
function BrowsedRequest({
  child,
  session,
  pick,
  onLeave,
}: {
  child: ChildProfile;
  session: ActiveSession;
  pick: BrowsePick;
  onLeave: () => void;
}) {
  const { store, content } = useAppServices();
  // One request per mount: the seeds come from the clock once.
  const [request] = useState<PlannedRequest>(() =>
    browseRequest(content.store.graph, pick, store.now() % 1_000_000),
  );
  const runner = useRequestRunner(child, session, request);
  return runner && <PierRequest runner={runner} onLeave={onLeave} />;
}

type PierTask = PierItemTask | PierLessonStep;

/** One request on screen. The runner is the app's (02 §5.6); `onLeave` gets what it produced. */
export function PierRequest({
  runner,
  onLeave,
}: {
  runner: PierTaskRunner;
  onLeave: (summary: RequestSummary) => void;
}) {
  const { audio } = useAppServices();
  const raise = useRaise();

  const [task, setTask] = useState<PierTask | null>(null);
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
  const answerTime = useRef<AnswerTime | null>(null);
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
  answerTime.current ??= createAnswerTime(clockNow);
  const time = answerTime.current;
  const trace = useRef<InteractionEvent[]>([]);
  const runnerNow = useRef(runner);
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
      onIdle: () => runnerNow.current.idle(),
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

  // The request's first task. With none (nothing left to play), the summary comes at once.
  useEffect(() => {
    let alive = true;
    const first = runner.current() as PierTask | null;
    if (first) {
      // The request's first task is on its way to the screen (05 §2: within 10 s of the tap).
      firstProblem.shown();
      setTask(first);
    }
    if (!first) void runner.finish().then((s) => alive && setSummary(s), raise);
    return () => {
      alive = false;
    };
  }, [runner, raise]);

  // A new item: speak the prompt, then the item is ready.
  const item = task?.kind === 'item' ? task.item : null;
  const step = task?.kind === 'lesson-step' ? task : null;
  const taskNow = useRef<PierTask | null>(null);
  taskNow.current = task;
  // One widget instance per presented item: it stays mounted through the second try and the
  // feedback, with the child's work in it, and a new item (even the same one again) remounts.
  const presented = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new item is what advances the key
  const itemNo = useMemo(() => {
    presented.current += 1;
    return presented.current;
  }, [item]);
  const itemKey = step ? `lesson:${step._widgetKey}:${restarts}` : `${itemNo}:${restarts}`;
  // The hint player as of this render, for the effect that starts an item.
  const nudge = useRef<(rung: HintStep) => void>(() => {});
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
      // A scaffolded lesson item: the ladder opens before the child starts (03 §6.2).
      const now = taskNow.current;
      const opening = now?.kind === 'item' ? now._nudge : undefined;
      if (opening) {
        nudge.current(opening);
        return;
      }
      time.start();
      setPhase('answer');
    };
    audio.say(item.prompt.narration, item.prompt.vars).then(ready, ready);
    return () => {
      alive = false;
      playing.current += 1;
    };
  }, [item, audio, setPhase, time]);

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
   * Plays one rung of the hint ladder (03 §5.8), then hands the item back to the child. After a
   * wrong answer `feedback` holds the line to say first and the runner's `shown`, called when
   * the rung itself starts; a rung the child asked for mid-try has neither, and the try's
   * answering time runs on after it.
   */
  const playHint = async (
    step: HintStep,
    feedback?: { say: NarrationKey | undefined; shown: () => void },
    /** The rung opens the try (a scaffolded lesson item): its answering time starts after it. */
    opening = false,
  ) => {
    playing.current += 1;
    const mine = playing.current;
    const stale = () => playing.current !== mine;
    setPhase('hint');
    setPicture(null);
    if (feedback) {
      await sayLine(feedback.say);
      if (stale()) return;
      feedback.shown();
    }
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
    // The hint's words stay in the bubble until the next answer: a child who reads can read them
    // again, and tapping the bubble says them again.
    setLine({ say: step.say, vars: step.vars });
    if (feedback || opening) time.start();
    else time.resume();
    setPhase('answer');
  };
  nudge.current = (rung) => void playHint(rung, undefined, true);

  /** Plays the worked solution (level 5): each step's line with its action, on a fresh widget. */
  const playSolution = async (
    steps: LessonStep[],
    feedback: { say: NarrationKey | undefined; shown: () => void },
  ) => {
    playing.current += 1;
    const mine = playing.current;
    const stale = () => playing.current !== mine;
    setPhase('hint');
    setPicture(null);
    await sayLine(feedback.say);
    if (stale()) return;
    feedback.shown();
    await restartWidget();
    if (stale()) return;
    for (const step of steps) {
      await Promise.all([sayLine(step.say, step.vars), step.action ? act(step.action) : null]);
      if (stale()) return;
    }
    setLine(null);
    setPhase('feedback');
  };

  // Leaving another way than Home (the browser's back button) still completes the request: the
  // runner's owner finishes it (`useRequestRunner`). Here, what is playing just goes stale.
  const mounted = useRef(false);
  /** Home was pressed: the request is being finished and the screen is on its way out. */
  const left = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const show = (r: PierTaskRunner, upcoming: PierTask | null) => {
    if (upcoming) setTask(upcoming);
    else end(r);
  };

  /** The lines of the child's turn, then the widget is theirs with the part to do invited. */
  const giveTurn = async (turn: PierLessonStep, stale: () => boolean) => {
    setPhase('lesson');
    again.reset();
    for (const s of turn._turnLines) {
      await sayLine(s.say, s.vars);
      await again.drain(hear, stale);
      if (stale()) return;
    }
    setLine({ say: turn.narration, vars: turn.vars });
    // No hand on the child's turn: a widget's invitation points at the exact target, which for
    // the last step is the answer itself. The hand is the demo's.
    time.start();
    setPhase('turn');
  };

  // A lesson step: its line with its action in the widget's demo mode, then the next step. One
  // play per step (StrictMode runs effects twice; a demo action must not).
  const started = useRef<PierLessonStep | null>(null);
  const sayAgain = useRef<SayAgain<SpokenLine> | null>(null);
  sayAgain.current ??= createSayAgain<SpokenLine>();
  const again = sayAgain.current;
  /** Says a line the child asked to hear again: the one that was on screen at the press. */
  const hear = (l: SpokenLine) => sayLine(l.say, l.vars);
  // The line on screen as of this render, for the speaker's handler.
  const lineNow = useRef<SpokenLine | null>(null);
  lineNow.current = line;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new step is what plays
  useEffect(() => {
    if (!step || started.current === step) return;
    started.current = step;
    playing.current += 1;
    const mine = playing.current;
    const stale = () => playing.current !== mine || !mounted.current || left.current;
    again.reset();
    setCue(null);
    setPicture(null);
    void (async () => {
      if (step.childStep) {
        await giveTurn(step, stale);
        return;
      }
      setPhase('lesson');
      if (step._lead) {
        await sayLine(step._lead);
        if (stale()) return;
      }
      await Promise.all([sayLine(step.narration, step.vars), step.demo ? act(step.demo) : null]);
      await again.drain(hear, stale);
      if (stale()) return;
      show(runner, runner.next() as PierTask | null);
    })();
  }, [step, runner]);

  /** The child's answer on their turn in a faded example. */
  const onTurn = (turn: PierLessonStep, response: ResponseValue) => {
    setPhase('checking');
    const latencyMs = time.elapsed();
    time.pause();
    const result = runner.lessonAnswer(response, { latencyMs });
    playing.current += 1;
    const mine = playing.current;
    const stale = () => playing.current !== mine || !mounted.current || left.current;
    if (result === 'done') {
      audio.sfx('chime');
      setCue({ kind: 'right', say: undefined });
      setPhase('feedback');
    } else if (result === 'again') {
      void giveTurn(turn, stale);
    } else {
      // The demo does the child's steps, on a fresh widget brought to where the turn began.
      void (async () => {
        setPhase('lesson');
        again.reset();
        await restartWidget();
        for (const action of turn._prior) {
          if (stale()) return;
          await act(action);
        }
        // The invitation is still on screen while the widget is rebuilt: a press then is for it.
        await again.drain(hear, stale);
        for (const s of turn._turn ?? []) {
          if (stale()) return;
          await Promise.all([sayLine(s.say, s.vars), s.action ? act(s.action) : null]);
          await again.drain(hear, stale);
        }
        if (stale()) return;
        show(runner, runner.next() as PierTask | null);
      })();
    }
  };

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
    if (step && phaseNow.current === 'turn' && response.kind !== 'skip') {
      onTurn(step, response);
      return;
    }
    if (phaseNow.current !== 'answer' && phaseNow.current !== 'turn') return;
    // Only the placeholder answers a skip: the widget is missing, or it failed to load or render.
    // That is not the child's answer, so nothing is logged and the request ends here.
    if (response.kind === 'skip') {
      setPhase('checking');
      end(runner);
      return;
    }
    setPhase('checking');
    setLine(null);
    const latencyMs = time.elapsed();
    time.pause();
    runner.submit(response, { latencyMs, trace: [...trace.current] }).then((fb) => {
      // The child left while the answer was being written: no feedback plays on a screen that
      // is gone.
      if (!mounted.current || left.current) return;
      // The deterministic line plays now; an AI line may follow it (06 §6). Nothing delivers one
      // until #21.
      fb.onAiFeedback(() => {});
      if (fb.retry) {
        audio.sfx('knock');
        setCue({ kind: 'again', say: fb.say.key });
        const again = runner.next() as PierTask | null;
        if (again?.kind === 'item') setTask(again);
        if (fb.hint) {
          void playHint(fb.hint, { say: fb.say.key, shown: fb.shown });
        } else {
          speak(fb.say.key);
          time.start();
          setPhase('answer');
        }
      } else if (fb.solution) {
        audio.sfx('knock');
        setCue({ kind: 'onward', say: fb.say.key });
        void playSolution(fb.solution, { say: fb.say.key, shown: fb.shown });
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
    if (phaseNow.current !== 'answer') return;
    const step = runner.hint();
    if (!step) return;
    const shown = runner.current() as PierTask | null;
    if (shown?.kind === 'item') setTask(shown);
    // The time spent so far on this try still counts; the hint itself does not.
    time.pause();
    void playHint(step);
  };

  const advance = (r: PierTaskRunner) => {
    setPhase('prompt');
    show(r, r.next() as PierTask | null);
  };

  const goNext = () => {
    if (phaseNow.current !== 'feedback') return;
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
    if (!breakOffer) return;
    audio.stop();
    runner.answerBreak(take);
    setBreakOffer(false);
    advance(runner);
  };

  const leave = () => {
    left.current = true;
    playing.current += 1;
    audio.stop();
    runner.finish().then(onLeave, raise);
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

  const lessonControls = step
    ? {
        onReplay: () => {
          // While the lesson plays by itself (a demo step, the hand-over of a turn, the demo
          // taking a turn over), the line on screen comes once more before it moves on; on the
          // child's turn and after it, it is said again at once.
          if (phaseNow.current === 'lesson') {
            again.ask(lineNow.current ?? { say: step.narration, vars: step.vars });
          } else void audio.say(step.narration, step.vars).catch(() => {});
        },
        onSkip: step._canSkip
          ? () => {
              const upcoming = runner.skipWorked() as PierTask | null | undefined;
              if (upcoming === undefined) return;
              audio.stop();
              show(runner, upcoming);
            }
          : null,
      }
    : null;

  return (
    <PierItemScreen
      item={
        item ??
        (step && { widget: step.widget, prompt: { narration: step.narration, vars: step.vars } })
      }
      lesson={lessonControls}
      tier={task?.kind === 'item' ? task.tier : (step?._tier ?? 'abstract')}
      itemKey={itemKey}
      phase={phase}
      cue={cue}
      line={line}
      picture={picture}
      demo={demo}
      progress={runner.progress()}
      onLeave={leave}
      onNext={goNext}
      onHint={onHint}
      onReplayPrompt={() => {
        // The instruction comes back into the bubble, to hear and (from grade 1) to read.
        setLine(null);
        if (item) void audio.say(item.prompt.narration, item.prompt.vars).catch(() => {});
      }}
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
              <button
                type="button"
                className={`${chip} font-bold`}
                disabled={!pierLesson(graph, s.skillId)}
                title={pierLesson(graph, s.skillId) ? undefined : 'no lesson the pier can show'}
                onClick={() => onPick({ skillId: s.skillId, templateId: null, lesson: true })}
              >
                Lesson ({graph.skills[s.skillId]?.lesson.mode})
              </button>
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
