import {
  answersSplit,
  formatModel,
  STORY_COUNTERS_MAX,
  type StoryProblemState,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { IconButton } from '../../primitives/IconButton';
import { SpeakerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  COMPACT_ROOM_H,
  fivesGrid,
  itemGap,
  ObjectSprite,
  type PadKey,
  roomBox,
  type Step,
  StepActions,
  type StepCue,
  spriteNameKey,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useModelState,
  useSmallestRoom,
  useSubmitGuard,
  useTwoStep,
  useWidgetRoom,
} from '../kit';
import { BoxEntry, enteredValues } from '../kit/BoxEntry';
import type { ConfigFor, WidgetProps } from '../types';
import {
  boxWidth,
  countersSize,
  fivesCell,
  GROUP_GAP,
  PANEL_PAD,
  planBuild,
  planStoryAsk,
  ROW,
  sceneSize,
} from './layout';
import './story-problem.css';

/**
 * `story-problem` (03 §5.5): a short story told in lines, the last of which asks the question.
 *
 * Two steps (kit `twoStep`), each fitted to the widget's room (06 §1):
 *
 * - **story**: the story on a card, read aloud line by line when the item opens (a touch reads
 *   it again; the line being read is marked). Beside it the scene (the things the story tells,
 *   a group to a row) and the counters board: "add a counter" and "take a counter away" (at
 *   most twenty; in ten-frames when the item says so). The board is a tool: it is never
 *   graded, and its use is only in the trace. Then Next.
 * - **answer**: the question line (a touch reads it again), the counters as built, the answer
 *   box with the number pad (two boxes when the story asks for both parts), Back and Check.
 *
 * Trace targets: `story`, `question`, `counter-add`, `counter-take`, `next`, `back`,
 * `box-<i>`, `key-<k>`.
 *
 * Demo ops (03 §5.5): `show-scene`, `act-out {sprite, count}` (counters go on one by one),
 * `draw-bar {parts}` (a bar in the scene's place), `highlight-line {index}`, plus `answer`.
 */

type Config = ConfigFor<'story-problem'>;
type State = StoryProblemState;

const OPS: readonly string[] = [...FORMAT_SUPPORT['story-problem'].ops, 'answer'];

function stateModel() {
  const m = formatModel('story-problem');
  if (!m) throw new Error('story-problem has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

/** The child's own counters (the story's things are a demonstration's). */
const COUNTER = 'counter';

// Motion (03 §6.3): short pauses between a demonstration's small steps.
const PLACE_MS = 200;
const SHOW_MS = 900;
const KEY_MS = 340;

const NOTE = {
  full: 'ui.widget.story.note.full',
  none: 'ui.widget.story.note.none',
} as const satisfies Record<string, NarrationKey>;

const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function StoryProblemWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, audio } = useSpeech();
  const prefs = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const ageMode = prefs.ageMode;

  const lines = config.lines;
  const question = lines.length - 1;
  const hasBoard = config.workspace !== 'none';
  const frames = config.workspace === 'ten-frame';
  const sceneGroups = config.scene.kind === 'scene' ? config.scene.sprites : [];
  const maxDigits = Math.max(...config.blanks.map((b) => b.maxDigits));
  const split = answersSplit(config);
  /** What the two parts of a split are parts of: the story's thing, or a counter. */
  const partSprite = sceneGroups[0]?.sprite ?? COUNTER;

  const { state, stateRef, act, applyOp, committed } = useModelState<State>(
    () => initial(config),
    applyAction,
  );
  const [texts, setTexts] = useState<string[]>(() => config.blanks.map(() => ''));
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [keyHighlight, setKeyHighlight] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [note, setNote] = useState<NarrationKey | null>(null);
  const [sceneLit, setSceneLit] = useState(false);
  /** The line being read aloud now. */
  const [reading, setReading] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  // ---------- reading the story aloud ----------

  /** Each reading has a number; a newer one, or any step of the child's, ends the older. */
  const readRun = useRef(0);
  const stopReading = () => {
    readRun.current += 1;
    setReading(null);
  };
  /**
   * Reads lines `from` … `to` one after the other (each `say` resolves when its line ends),
   * marking the one being read. A step of the child's, a demonstration or the widget being
   * switched off ends it.
   */
  const read = async (from: number, to: number) => {
    if (!audio) return;
    readRun.current += 1;
    const run = readRun.current;
    for (let i = from; i <= to; i += 1) {
      const line = lines[i];
      if (!line) break;
      setReading(i);
      await audio.say(line.key, line.vars).catch(() => {});
      if (!alive.current || readRun.current !== run) return;
    }
    setReading(null);
  };
  const readRef = useRef(read);
  readRef.current = read;

  // The story is read once, when the item opens for the child: the runner enables the widget
  // when the prompt has been spoken. While the widget is off (a demonstration, feedback, a hint
  // being spoken) nothing is read, and a reading under way ends.
  const opened = useRef(false);
  useEffect(() => {
    if (disabled) {
      readRun.current += 1;
      setReading(null);
      return;
    }
    if (opened.current) return;
    opened.current = true;
    void readRef.current(0, lines.length - 1);
  }, [disabled, lines.length]);

  /** A child step ends the reading, the demo's invite and the last limit note. */
  const childStep = () => {
    stopReading();
    setInvite(null);
    setNote(null);
  };

  const steps = useTwoStep(rootRef, {
    interactive,
    trace,
    guard: () => {
      childStep();
      return true;
    },
  });
  const step: Step = steps.step;

  // ---------- layout: the measured room, the action button, the two plans ----------

  const room = useSmallestRoom(useWidgetRoom(rootRef), rootRef);
  const box = roomBox(room);
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const button = useActionSize(actRef, zoomRef, ageMode);
  const counters = sum(state.actedOut.map((x) => x.count));
  const sceneCounts = sceneGroups.map((g) => g.count);
  const sceneKey = sceneCounts.join();
  const questionText = (() => {
    const q = lines[question];
    return q ? t(q.key, q.vars) : '';
  })();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scene's counts are in sceneKey
  const build = useMemo(
    () =>
      planBuild({
        room: { w: box.w, h: box.h },
        button,
        ageMode,
        scene: sceneCounts,
        board: hasBoard,
      }),
    [box.w, box.h, button, ageMode, sceneKey, hasBoard],
  );
  const ask = useMemo(
    () =>
      planStoryAsk({
        room: { w: box.w, h: box.h },
        button,
        ageMode,
        boxes: config.blanks.length,
        maxDigits,
        questionChars: questionText.length,
        counters: counters > 0,
      }),
    [box.w, box.h, button, ageMode, config.blanks.length, maxDigits, questionText, counters],
  );

  // ---------- child input ----------

  const onAdd = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'counter-add');
    const own = stateRef.current.actedOut.find((x) => x.sprite === COUNTER)?.count ?? 0;
    if (!act({ op: 'act-out', args: { sprite: COUNTER, count: own + 1 } })) {
      setNote(NOTE.full);
      say(NOTE.full);
    }
  };
  const onTake = () => {
    if (!interactive) return;
    childStep();
    trace('undo', 'counter-take');
    // The last counter put on comes off, whoever put it there.
    const last = stateRef.current.actedOut.at(-1);
    if (!last || !act({ op: 'act-out', args: { sprite: last.sprite, count: last.count - 1 } })) {
      setNote(NOTE.none);
      say(NOTE.none);
    }
  };
  const onStory = () => {
    if (!interactive) return;
    setInvite(null);
    setNote(null);
    trace('tap', 'story');
    void read(0, lines.length - 1);
  };
  const onQuestion = () => {
    if (!interactive) return;
    setInvite(null);
    trace('tap', 'question');
    void read(question, question);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || step !== 'ask') return false;
    const values = enteredValues(textsRef.current);
    if (!values) return false;
    const response = model.toResponse(
      applyAction(stateRef.current, { op: 'answer', args: { values } }),
    );
    if (!response) return false;
    stopReading();
    onResponse(response);
    return true;
  });
  const ready = enteredValues(texts) !== null;

  // ---------- demo ----------

  const showStep = async (s: Step) => {
    if (steps.step === s) return;
    steps.show(s);
    await committed();
  };
  const setBox = (i: number, text: string) => {
    const next = [...textsRef.current];
    next[i] = text;
    textsRef.current = next;
    setTexts(next);
  };
  /** Types `v` into box `i`, a key at a time. */
  const typeInto = async (i: number, v: number) => {
    setActive(i);
    setBox(i, '');
    for (const ch of String(Math.max(0, Math.trunc(v)))) {
      const key = ch as PadKey;
      setKeyHighlight(key);
      await pause(KEY_MS);
      if (!alive.current) return;
      setBox(i, applyPadKey(textsRef.current[i] ?? '', key, maxDigits));
    }
    setKeyHighlight(null);
    await pause(KEY_MS);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setNote(null);
      stopReading();
      try {
        switch (action.op) {
          case 'show-scene':
            await showStep('build');
            await applyOp(action);
            setSceneLit(true);
            await pause(SHOW_MS);
            if (alive.current) setSceneLit(false);
            break;
          case 'act-out': {
            await showStep('build');
            const sprite = action.args?.sprite;
            const count = Math.trunc(Number(action.args?.count));
            if (typeof sprite !== 'string' || !Number.isFinite(count)) break;
            const have = () =>
              stateRef.current.actedOut.find((x) => x.sprite === sprite)?.count ?? 0;
            // The counters go on one by one, so each can be seen and counted.
            while (alive.current && have() < count) {
              if (!(await applyOp({ op: 'act-out', args: { sprite, count: have() + 1 } }))) break;
              await pause(PLACE_MS);
            }
            if (alive.current && have() > count) await applyOp(action);
            break;
          }
          case 'draw-bar':
          case 'highlight-line':
            await showStep('build');
            await applyOp(action);
            await pause(SHOW_MS);
            break;
          case 'answer': {
            await showStep('ask');
            const many = action.args?.values;
            const values = Array.isArray(many) ? many.map(Number) : [Number(action.args?.value)];
            for (const [i, v] of values.entries()) {
              if (i >= config.blanks.length || !Number.isFinite(v) || !alive.current) break;
              await typeInto(i, v);
            }
            if (alive.current) await applyOp(action);
            break;
          }
        }
      } finally {
        setKeyHighlight(null);
        if (alive.current) {
          setBusy(false);
          await committed();
        }
      }
    },
    invite: (action) => {
      setNote(null);
      setInvite(action);
    },
  });

  // The one ring: what a demonstration invites the child to touch. A control of the other step
  // is reached through Next or Back.
  const inviteCue = ((): { cue: string; key?: PadKey | null } | null => {
    if (!invite) return null;
    const onBuild = (cue: string) => (step === 'build' ? { cue } : { cue: 'back' });
    switch (invite.op) {
      case 'show-scene':
        return sceneGroups.length > 0 ? onBuild('scene') : null;
      case 'act-out':
        return hasBoard ? onBuild('counter-add') : null;
      case 'highlight-line':
        return onBuild('story');
      case 'answer': {
        if (step === 'build') return { cue: 'next' };
        const many = invite.args?.values;
        const want = Array.isArray(many) ? Number(many[active]) : Number(invite.args?.value);
        const typed = texts[active] ?? '';
        const digits = Number.isFinite(want) ? String(Math.max(0, Math.trunc(want))) : '';
        const next = digits.startsWith(typed) ? digits[typed.length] : undefined;
        return { cue: 'entry', key: (next as PadKey | undefined) ?? null };
      }
      default:
        return null;
    }
  })();
  const ringed = (id: string) => inviteCue?.cue === id;
  const stepCue = (['next', 'back', 'check'] as const).find((c) => ringed(c)) ?? null;
  const invitedKey = inviteCue?.cue === 'entry' ? (inviteCue.key ?? null) : null;
  const handKey = inviteCue ? `${step}:${inviteCue.cue}:${invitedKey ?? ''}` : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (!inviteCue) return null;
      if (inviteCue.cue === 'entry') {
        return root.querySelector<HTMLElement>(
          invitedKey ? '.ni-story__entry .ni-pad .ni-invite' : '.ni-story__entry .ni-boxentry__box',
        );
      }
      return root.querySelector<HTMLElement>(`[data-cue="${inviteCue.cue}"]`);
    },
    handKey,
  );

  // A demonstration's highlighted line is in view on the story step.
  const marked = reading ?? state.highlightedLine;

  // The story card may be taller than the room (long lines in a narrow card): it says so, like
  // every part that does not fit (the pier's fit check reads `data-fits`).
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const [cardFits, setCardFits] = useState(true);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || step !== 'build') return;
    const fits = el.getBoundingClientRect().height <= box.h + 1;
    setCardFits((was) => (was === fits ? was : fits));
  });

  // ---------- render ----------

  /** The counters on the board, a sprite to a place (ten-frames fill one frame, then the next). */
  const renderCounters = (s: number, live: boolean) => {
    const grid = fivesGrid(STORY_COUNTERS_MAX, ROW, s);
    const place = (k: number) => {
      if (!frames) return k;
      const frame = Math.floor(k / 10);
      const within = k % 10;
      return Math.floor(within / 5) * ROW + frame * 5 + (within % 5);
    };
    const sprites = state.actedOut.flatMap((x) => Array.from({ length: x.count }, () => x.sprite));
    const size = countersSize(s);
    return (
      <div
        className={cls('ni-story__counters', live && ringed('board') && 'ni-invite')}
        data-frames={frames ? 'true' : undefined}
        role="img"
        aria-label={`${t('ui.widget.story.counters')} ${sprites.length}`}
        style={{ width: size.w, height: size.h, padding: PANEL_PAD }}
      >
        <span className="ni-story__grid" style={{ width: grid.w, height: grid.h }}>
          {/* Every place a counter can take: a ten-frame's cell, or a faint dot on the mat. */}
          {Array.from({ length: STORY_COUNTERS_MAX }, (_, k) => {
            const p = fivesCell(k, ROW, s);
            const half = itemGap(s) / 2;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the board's places are positional
                key={`place-${k}`}
                className="ni-story__place"
                aria-hidden="true"
                style={
                  frames
                    ? {
                        left: p.x - half,
                        top: p.y - half,
                        width: s + 2 * half,
                        height: s + 2 * half,
                      }
                    : { left: p.x, top: p.y, width: s, height: s }
                }
              />
            );
          })}
          {sprites.map((sprite, k) => {
            const p = fivesCell(place(k), ROW, s);
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: counters are positional
                key={k}
                className="ni-story__item ni-invite-glyph"
                style={{ left: p.x, top: p.y, width: s, height: s }}
              >
                <ObjectSprite sprite={sprite} />
              </span>
            );
          })}
        </span>
      </div>
    );
  };

  const renderScene = (s: number) => {
    if (state.bar) {
      const whole = sum(state.bar);
      return (
        <div className="ni-story__bar" role="img" aria-label={state.bar.join(' + ')}>
          {state.bar.map((n, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the bar's parts are positional
            <span key={i} className="ni-story__part" style={{ flexGrow: n / whole }}>
              {n}
            </span>
          ))}
        </div>
      );
    }
    if (sceneGroups.length === 0) return null;
    const size = sceneSize(sceneCounts, s);
    const names = sceneGroups.map((g) => `${g.count} ${t(spriteNameKey(g.sprite))}`).join(', ');
    return (
      <div
        className={cls('ni-story__scene', (sceneLit || ringed('scene')) && 'ni-invite')}
        data-cue="scene"
        role="img"
        aria-label={`${t('ui.widget.picture')}: ${names}`}
        style={{ width: size.w, height: size.h, gap: GROUP_GAP }}
      >
        {sceneGroups.map((g, gi) => {
          const grid = fivesGrid(g.count, ROW, s);
          const items: ReactNode[] = [];
          for (let k = 0; k < g.count; k += 1) {
            const p = fivesCell(k, grid.cols, s);
            items.push(
              <span
                key={k}
                className="ni-story__item ni-invite-glyph"
                style={{ left: p.x, top: p.y, width: s, height: s }}
              >
                {/* The kit's two group tones in turn (a, b, a), as the told groups differ. */}
                <ObjectSprite sprite={g.sprite} tone={gi % 2 === 0 ? 'a' : 'b'} />
              </span>,
            );
          }
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the scene's groups are positional
            <span key={gi} className="ni-story__grid" style={{ width: grid.w, height: grid.h }}>
              {items}
            </span>
          );
        })}
      </div>
    );
  };

  const actions = (
    <StepActions
      actRef={actRef}
      step={step}
      back
      dir={step === 'ask' && ask.arrangement === 'bar' ? 'row' : 'column'}
      interactive={interactive}
      ready={ready}
      onStep={steps.goTo}
      onCheck={submit}
      invited={stepCue as StepCue | null}
      compact={box.h < COMPACT_ROOM_H}
    />
  );

  const renderBuild = () => (
    <div className="ni-story__build">
      <button
        ref={cardRef}
        type="button"
        className={cls('ni-story__card', ringed('story') && 'ni-invite')}
        data-cue="story"
        aria-label={config.showText ? undefined : t('ui.widget.story.hear')}
        disabled={!interactive}
        onClick={onStory}
        style={{ width: build.card }}
      >
        <span className="ni-story__speaker" aria-hidden="true">
          <SpeakerIcon />
        </span>
        {config.showText ? (
          <span className="ni-story__lines">
            {lines.map((line, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the story's lines are positional
                key={i}
                className="ni-story__line"
                data-line={i}
                data-marked={marked === i ? 'true' : undefined}
              >
                {t(line.key, line.vars)}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      {build.side ? (
        <div className="ni-story__side" style={{ width: build.side.w }}>
          {renderScene(build.s)}
          {hasBoard ? (
            // biome-ignore lint/a11y/useSemanticElements: the board lays out its counters over its buttons; a fieldset brings its own box model
            <div className="ni-story__board" role="group" aria-label={t('ui.widget.story.board')}>
              {renderCounters(build.s, true)}
              <div className="ni-story__buttons">
                <span data-cue="counter-take">
                  <IconButton
                    label="ui.widget.story.take"
                    icon={<BoardIcon kind="take" />}
                    tone="cloud"
                    caption={false}
                    onPress={onTake}
                    disabled={!interactive}
                    data={{ 'data-limit': counters === 0 ? 'true' : undefined }}
                  />
                </span>
                <span data-cue="counter-add">
                  <IconButton
                    label="ui.widget.story.add"
                    icon={<BoardIcon kind="add" />}
                    tone="cloud"
                    caption={false}
                    onPress={onAdd}
                    disabled={!interactive}
                    className={ringed('counter-add') ? 'ni-invite' : undefined}
                    data={{ 'data-limit': counters >= STORY_COUNTERS_MAX ? 'true' : undefined }}
                  />
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {actions}
    </div>
  );

  const renderAsk = () => (
    <div className="ni-story__ask" data-arrangement={ask.arrangement}>
      <div className="ni-story__asked" style={{ width: ask.question.w }}>
        <button
          type="button"
          className="ni-story__question"
          data-cue="question"
          aria-label={config.showText ? undefined : t('ui.widget.story.hear')}
          disabled={!interactive}
          onClick={onQuestion}
        >
          <span className="ni-story__speaker" aria-hidden="true">
            <SpeakerIcon />
          </span>
          {config.showText ? (
            <span
              className="ni-story__line"
              data-marked={reading === question ? 'true' : undefined}
            >
              {questionText}
            </span>
          ) : null}
        </button>
        {ask.s > 0 ? renderCounters(ask.s, false) : null}
      </div>
      <span
        className="ni-story__entry"
        data-cue="entry"
        style={{ '--story-box-w': `${boxWidth(ageMode, maxDigits, split)}px` } as CSSProperties}
      >
        <BoxEntry
          texts={texts}
          active={active}
          onActive={(i) => {
            childStep();
            trace('tap', `box-${i}`);
            setActive(i);
          }}
          onTexts={(next) => {
            childStep();
            setTexts(next);
          }}
          labels={
            split
              ? [t('ui.widget.story.part.first'), t('ui.widget.story.part.second')]
              : [t('ui.widget.answer')]
          }
          // Two parts: each box carries the thing in one of the kit's two tones (any split is
          // right, so the order of the boxes does not matter).
          adornments={
            split
              ? (['a', 'b'] as const).map((tone) => (
                  <ObjectSprite key={tone} sprite={partSprite} tone={tone} />
                ))
              : undefined
          }
          maxDigits={maxDigits}
          disabled={!interactive}
          compact
          shape={ask.shape}
          highlightedKey={keyHighlight ?? invitedKey}
          invitedBox={inviteCue?.cue === 'entry' && invitedKey === null ? active : null}
          onEnter={submit}
          onKeyTrace={(key) => trace('tap', `key-${key}`)}
        />
      </span>
      <div className="ni-story__acts">{actions}</div>
    </div>
  );

  const fits = step === 'build' ? build.fits && cardFits : ask.fits;
  return (
    <div
      ref={rootRef}
      className="ni-story"
      data-tier={tier}
      data-step={step}
      data-workspace={config.workspace}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={fits ? undefined : 'false'}
      style={handRootStyle}
    >
      {step === 'build' ? renderBuild() : renderAsk()}
      {/* Why a press did nothing, in words. */}
      <p className="ni-visually-hidden" role="status">
        {note ? t(note) : ''}
      </p>
      {inviteHand}
    </div>
  );
}

/** The board's two buttons: a counter with a plus, a counter with a minus. */
function BoardIcon({ kind }: { kind: 'add' | 'take' }) {
  const ink = 'var(--color-ink)';
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-glyph={kind}
    >
      <path d={kind === 'add' ? 'M10 24h28M24 10v28' : 'M10 24h28'} stroke={ink} strokeWidth="7" />
    </svg>
  );
}

export default StoryProblemWidget;
