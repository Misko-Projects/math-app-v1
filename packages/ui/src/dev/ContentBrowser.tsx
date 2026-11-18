// Storybook "Content Browser" (03 §10.1 step 9, U03): pick a template, scrub the seed and target
// difficulty, and see the widget, the prompt and hint text, the answer and the difficulty
// breakdown. Developer tool for content authors: its labels are English and inline, children never
// see it, and nothing here is exported from the package or shipped in the web app.
import { formatDiagnostic } from '@number-island/content';
import {
  checkResponse,
  GenerationError,
  generateItem,
  itemSolution,
  render,
} from '@number-island/engine';
import type {
  AudioManager,
  CheckResult,
  GeneratedItem,
  InteractionEvent,
  ItemTemplate,
  LessonStep,
  ResponseValue,
  Skill,
} from '@number-island/shared';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { type NarrationTextResolver, UiProvider } from '../preferences/UiProvider';
import type { AgeMode } from '../tokens/tokens';
import { createDemoController, UnsupportedWidgetOpError } from '../widgets/demo';
import { widgetRegistry } from '../widgets/registry';
import { WidgetHost } from '../widgets/WidgetHost';
import { type BrowserContent, browserContent } from './contentSources';
import {
  answerSummary,
  type DifficultySpread,
  difficultyBreakdown,
  difficultySpread,
  fmt,
  hintRows,
} from './inspect';
import './ContentBrowser.css';

export const SEED_MIN = 1;
export const SEED_MAX = 10_000;
/** Target slider padding beyond the observed min/max (or ± around base without stats). */
const TARGET_PAD = 0.5;
const TARGET_SPAN_WITHOUT_STATS = 1.5;
const TARGET_STEP = 0.05;

export interface ContentBrowserProps {
  /** Template shown first (falls back to the first template). */
  initialTemplateId?: string;
  initialSeed?: number;
  initialAgeMode?: AgeMode;
}

/** Renders the compiled content, or the compile errors when `content:build` would fail. */
export function ContentBrowser(props: ContentBrowserProps) {
  const [content] = useState<BrowserContent>(browserContent);
  useEffect(() => {
    console.info(
      `[content-browser] compiled ${content.result.content?.templates.length ?? 0} templates in ${Math.round(content.ms)} ms`,
    );
  }, [content]);
  const compiled = content.result.content;
  return (
    <div className="ni-cb">
      <header className="ni-cb__header">
        <div>
          <h1 className="ni-cb__title">Content Browser</h1>
          <p className="ni-cb__subtitle">
            Templates compiled in the browser from <code>packages/content</code>
            {content.result.contentVersion ? (
              <>
                {' '}
                · contentVersion <code>{content.result.contentVersion}</code>
              </>
            ) : null}
          </p>
        </div>
        <span className="ni-cb__pill" data-state={content.errors.length ? 'error' : 'ok'}>
          {content.errors.length
            ? plural(content.errors.length, 'compile error')
            : `${plural(compiled?.templates.length ?? 0, 'template')} · ${plural(content.warnings.length, 'warning')}`}
        </span>
      </header>
      {compiled ? (
        <Browser {...props} skills={compiled.skills} templates={compiled.templates} />
      ) : null}
      <Diagnostics content={content} />
    </div>
  );
}

function Diagnostics({ content }: { content: BrowserContent }) {
  const all = [...content.errors, ...content.warnings];
  if (all.length === 0) return null;
  const failed = content.errors.length > 0;
  return (
    <section className="ni-cb__card ni-cb__diagnostics" aria-labelledby="ni-cb-diag">
      <details open={failed}>
        <summary>
          <h2 id="ni-cb-diag">
            Compiler diagnostics ({plural(content.errors.length, 'error')},{' '}
            {plural(content.warnings.length, 'warning')})
          </h2>
        </summary>
        {failed ? (
          <p>The content does not compile, so there is nothing to browse. Fix these first:</p>
        ) : null}
        <ul className="ni-cb__diag-list">
          {all.map((d) => {
            const text = formatDiagnostic(d);
            return (
              <li key={text} data-severity={d.severity}>
                <code>{text}</code>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

interface BrowserProps extends ContentBrowserProps {
  skills: Skill[];
  templates: ItemTemplate[];
}

type ItemResult = { item: GeneratedItem; error: null } | { item: null; error: string };

interface Answered {
  itemId: string;
  response: ResponseValue;
  result: CheckResult;
}

interface Playback {
  itemId: string;
  step: number | null;
  done: boolean;
  error: string | null;
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const clampSeed = (n: number) =>
  Number.isFinite(n) ? Math.min(SEED_MAX, Math.max(SEED_MIN, Math.round(n))) : SEED_MIN;

function targetRange(t: ItemTemplate, spread: DifficultySpread | null): [number, number] {
  const lo = spread ? spread.min - TARGET_PAD : t.difficulty.base - TARGET_SPAN_WITHOUT_STATS;
  const hi = spread ? spread.max + TARGET_PAD : t.difficulty.base + TARGET_SPAN_WITHOUT_STATS;
  const snap = (x: number) => Math.round(x / TARGET_STEP) * TARGET_STEP;
  return [Number(snap(lo).toFixed(2)), Number(snap(hi).toFixed(2))];
}

function Browser({
  skills,
  templates,
  initialTemplateId,
  initialSeed = 1,
  initialAgeMode = 'g1-up',
}: BrowserProps) {
  const ids = useId();
  const [templateId, setTemplateId] = useState(
    templates.some((t) => t.id === initialTemplateId)
      ? (initialTemplateId as string)
      : (templates[0]?.id ?? ''),
  );
  const [filter, setFilter] = useState('');
  const [seed, setSeed] = useState(clampSeed(initialSeed));
  const [targetOn, setTargetOn] = useState(false);
  // null: the template's median difficulty (a new template starts there).
  const [target, setTarget] = useState<number | null>(null);
  const [ageMode, setAgeMode] = useState<AgeMode>(initialAgeMode);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [trace, setTrace] = useState<{ itemId: string; events: InteractionEvent[] } | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);

  const template = templates.find((t) => t.id === templateId) as ItemTemplate;
  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const spread = useMemo(() => difficultySpread(template), [template]);
  const [targetMin, targetMax] = targetRange(template, spread);

  const pickTemplate = (id: string) => {
    if (!templates.some((t) => t.id === id)) return;
    setTemplateId(id);
    setTarget(null);
  };

  const sliderValue = Math.min(
    targetMax,
    Math.max(targetMin, target ?? Number((spread?.median ?? template.difficulty.base).toFixed(2))),
  );
  const targetValue = targetOn ? sliderValue : null;
  const itemId = `${template.id}:${seed}:${targetValue ?? 'untargeted'}`;

  const generated = useMemo<ItemResult>(() => {
    try {
      const item = generateItem(
        template,
        seed,
        targetValue === null ? undefined : { difficulty: targetValue },
      );
      return { item, error: null };
    } catch (e) {
      const message =
        e instanceof GenerationError || e instanceof Error ? e.message : JSON.stringify(e);
      return { item: null, error: message };
    }
  }, [template, seed, targetValue]);
  const item = generated.item;

  // One demo controller per item; strict, so an op the widget lacks shows up as an error.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new item needs a fresh controller.
  const demo = useMemo(() => createDemoController({ strict: true }), [itemId]);
  const runRef = useRef(0);
  const playing = playback?.itemId === itemId && !playback.done;

  const narrationText = useMemo<NarrationTextResolver>(() => {
    const narration = browserContent().result.content?.narration ?? {};
    return (key, vars) => (narration[key] ? render(key, vars ?? {}) : undefined);
  }, []);

  const setSpokenRef = useRef(setSpoken);
  setSpokenRef.current = setSpoken;
  const audio = useMemo<AudioManager>(() => {
    const show = (text: string) => setSpokenRef.current(text);
    return {
      unlock: async () => {},
      say: async (key, vars) => show(`${render(key, vars ?? {})}  (${key})`),
      sayPhrases: async (parts) =>
        show(parts.map((p) => ('number' in p ? String(p.number) : render(p.id))).join(' ')),
      sayText: async (text) => show(text),
      sfx: () => {},
      music: () => {},
      stop: () => {},
      setVolumes: () => {},
    };
  }, []);

  const onResponse = (response: ResponseValue) => {
    if (!item) return;
    setAnswered({ itemId, response, result: checkResponse(item, response) });
  };
  const onInteract = (e: InteractionEvent) =>
    setTrace((prev) => ({
      itemId,
      events: prev?.itemId === itemId ? [...prev.events, e] : [e],
    }));

  const steps = useMemo<LessonStep[] | string>(() => {
    if (!item) return [];
    try {
      return itemSolution(item, template);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [item, template]);

  const registered = widgetRegistry[template.format] !== undefined;
  const showMe = async () => {
    if (!Array.isArray(steps) || playing) return;
    const run = ++runRef.current;
    const live = () => runRef.current === run;
    setPlayback({ itemId, step: null, done: false, error: null });
    try {
      for (const [i, s] of steps.entries()) {
        if (!live()) return;
        setPlayback({ itemId, step: i, done: false, error: null });
        if (s.action) await demo.play(s.action);
      }
      if (live()) setPlayback({ itemId, step: null, done: true, error: null });
    } catch (e) {
      if (!live()) return;
      const error =
        e instanceof UnsupportedWidgetOpError
          ? `The widget does not support op "${e.op}" (supports: ${e.supported.join(', ') || 'none'}).`
          : e instanceof Error
            ? e.message
            : String(e);
      setPlayback((p) => ({ itemId, step: p?.step ?? null, done: true, error }));
    }
  };
  // Leaving an item abandons its playback.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per item.
  useEffect(() => {
    runRef.current += 1;
  }, [itemId]);

  const q = filter.trim().toLowerCase();
  const groups = useMemo(() => {
    const out: { skill: Skill | undefined; skillId: string; templates: ItemTemplate[] }[] = [];
    for (const t of templates) {
      const skill = skillById.get(t.skillId);
      const hay = `${t.id} ${t.format} ${t.tier} ${t.generator} ${skill?.name ?? ''}`.toLowerCase();
      if (q && !hay.includes(q) && t.id !== templateId) continue;
      const last = out[out.length - 1];
      if (last?.skillId === t.skillId) last.templates.push(t);
      else out.push({ skill, skillId: t.skillId, templates: [t] });
    }
    return out;
  }, [templates, skillById, q, templateId]);
  const shown = groups.reduce((n, g) => n + g.templates.length, 0);

  const skill = skillById.get(template.skillId);
  const answer = answered?.itemId === itemId ? answered : null;
  const events = trace?.itemId === itemId ? trace.events : [];
  const play = playback?.itemId === itemId ? playback : null;
  const feasible =
    targetValue !== null && spread ? targetValue >= spread.p10 && targetValue <= spread.p90 : null;

  return (
    <>
      <section className="ni-cb__card ni-cb__controls" aria-label="Item controls">
        <div className="ni-cb__field ni-cb__field--template">
          <label htmlFor={`${ids}-template`}>Template</label>
          <select
            id={`${ids}-template`}
            value={templateId}
            onChange={(e) => pickTemplate(e.target.value)}
          >
            {groups.map((g) => (
              <optgroup
                key={g.skillId}
                label={`${g.skillId.split('.')[0]} › ${g.skillId} ${g.skill?.name ?? ''}`}
              >
                {g.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {`${t.id} · ${t.format} · ${t.tier} · ${t.generator}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="ni-cb__inline">
            <label htmlFor={`${ids}-filter`} className="ni-cb__sublabel">
              Filter
            </label>
            <input
              id={`${ids}-filter`}
              type="search"
              placeholder="id, format, tier, generator or skill"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <output className="ni-cb__muted" aria-live="polite">
              {shown} of {templates.length}
            </output>
          </div>
        </div>

        <div className="ni-cb__field">
          <label htmlFor={`${ids}-seed`}>Seed</label>
          <div className="ni-cb__inline">
            <button
              type="button"
              className="ni-cb__btn"
              aria-label="Previous seed"
              disabled={seed <= SEED_MIN}
              onClick={() => setSeed((s) => clampSeed(s - 1))}
            >
              ‹
            </button>
            <input
              id={`${ids}-seed`}
              className="ni-cb__number"
              type="number"
              min={SEED_MIN}
              max={SEED_MAX}
              step={1}
              value={seed}
              onChange={(e) => setSeed(clampSeed(e.target.valueAsNumber))}
            />
            <button
              type="button"
              className="ni-cb__btn"
              aria-label="Next seed"
              disabled={seed >= SEED_MAX}
              onClick={() => setSeed((s) => clampSeed(s + 1))}
            >
              ›
            </button>
          </div>
          <input
            type="range"
            aria-label="Seed slider"
            min={SEED_MIN}
            max={SEED_MAX}
            step={1}
            value={seed}
            onChange={(e) => setSeed(clampSeed(e.target.valueAsNumber))}
          />
        </div>

        <div className="ni-cb__field">
          <div className="ni-cb__inline">
            <input
              id={`${ids}-target-on`}
              type="checkbox"
              checked={targetOn}
              onChange={(e) => setTargetOn(e.target.checked)}
            />
            <label htmlFor={`${ids}-target-on`}>Target difficulty</label>
            <output className="ni-cb__value" htmlFor={`${ids}-target`}>
              {targetValue === null ? 'untargeted' : targetValue.toFixed(2)}
            </output>
          </div>
          <input
            id={`${ids}-target`}
            type="range"
            aria-label="Target difficulty slider"
            min={targetMin}
            max={targetMax}
            step={TARGET_STEP}
            value={sliderValue}
            disabled={!targetOn}
            onChange={(e) => setTarget(e.target.valueAsNumber)}
          />
          <span className="ni-cb__muted">
            {targetMin.toFixed(2)} … {targetMax.toFixed(2)}
            {feasible === null ? '' : feasible ? ' · within p10–p90' : ' · outside p10–p90'}
          </span>
        </div>

        <fieldset className="ni-cb__field ni-cb__segmented">
          <legend>Age mode</legend>
          {(
            [
              ['k', 'K'],
              ['g1-up', 'G1+'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} data-checked={ageMode === mode ? 'true' : undefined}>
              <input
                type="radio"
                name={`${ids}-age`}
                value={mode}
                checked={ageMode === mode}
                onChange={() => setAgeMode(mode)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="ni-cb__card ni-cb__meta" aria-label="Template details">
        <dl>
          <div>
            <dt>Template</dt>
            <dd>
              <code>{template.id}</code>
            </dd>
          </div>
          <div>
            <dt>Skill</dt>
            <dd>
              <code>{template.skillId}</code> {skill?.name}
            </dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>
              <code>{template.format}</code>
              {registered ? '' : ' (no widget yet)'}
            </dd>
          </div>
          <div>
            <dt>Tier</dt>
            <dd>{template.tier}</dd>
          </div>
          <div>
            <dt>Generator</dt>
            <dd>
              <code>{template.generator}</code>
            </dd>
          </div>
          <div>
            <dt>Difficulty over seeds 1–{spread?.n ?? 0}</dt>
            <dd>
              {spread
                ? `min ${fmt(spread.min)} · p10 ${fmt(spread.p10)} · median ${fmt(spread.median)} · p90 ${fmt(spread.p90)} · max ${fmt(spread.max)} (${spread.distinct} distinct items)`
                : 'none generated'}
            </dd>
          </div>
        </dl>
      </section>

      {generated.error !== null ? (
        <section className="ni-cb__card ni-cb__error" role="alert" aria-label="Generation error">
          <h2>This seed does not generate an item</h2>
          <p>
            <code>{generated.error}</code>
          </p>
        </section>
      ) : (
        <ItemView
          item={generated.item}
          template={template}
          itemId={itemId}
          ageMode={ageMode}
          narrationText={narrationText}
          audio={audio}
          demo={demo}
          playing={playing}
          play={play}
          steps={steps}
          canShowMe={registered && Array.isArray(steps) && steps.some((s) => s.action)}
          onShowMe={showMe}
          onResponse={onResponse}
          onInteract={onInteract}
          answer={answer}
          events={events}
          spoken={spoken}
        />
      )}
    </>
  );
}

interface ItemViewProps {
  item: GeneratedItem;
  template: ItemTemplate;
  itemId: string;
  ageMode: AgeMode;
  narrationText: NarrationTextResolver;
  audio: AudioManager;
  demo: ReturnType<typeof createDemoController>;
  playing: boolean;
  play: Playback | null;
  steps: LessonStep[] | string;
  canShowMe: boolean;
  onShowMe: () => void;
  onResponse: (r: ResponseValue) => void;
  onInteract: (e: InteractionEvent) => void;
  answer: Answered | null;
  events: InteractionEvent[];
  spoken: string | null;
}

function ItemView({
  item,
  template,
  itemId,
  ageMode,
  narrationText,
  audio,
  demo,
  playing,
  play,
  steps,
  canShowMe,
  onShowMe,
  onResponse,
  onInteract,
  answer,
  events,
  spoken,
}: ItemViewProps) {
  const breakdown = useMemo(() => difficultyBreakdown(template, item), [template, item]);
  const hints = useMemo(() => hintRows(item), [item]);
  const lastEvent = events[events.length - 1];
  return (
    <>
      <section className="ni-cb__card ni-cb__stage-card" aria-label="Item">
        <div className="ni-cb__prompt-row">
          <p className="ni-cb__prompt" data-testid="prompt">
            {item.prompt.text}
          </p>
          <button
            type="button"
            className="ni-cb__btn ni-cb__btn--primary"
            disabled={!canShowMe || playing}
            onClick={onShowMe}
          >
            {playing ? 'Playing…' : 'Show me'}
          </button>
        </div>
        <p className="ni-cb__muted ni-cb__prompt-key">
          <code>{item.prompt.narration}</code>
          {spoken ? (
            <span className="ni-cb__spoken">
              {' '}
              · last spoken: <q>{spoken}</q>
            </span>
          ) : null}
        </p>
        <UiProvider
          ageMode={ageMode}
          audio={audio}
          narrationText={narrationText}
          className="ni-cb__provider"
        >
          <div className="ni-cb__stage">
            <WidgetHost
              config={item.widget}
              tier={item.tier}
              itemKey={itemId}
              demo={demo}
              disabled={playing}
              onResponse={onResponse}
              onInteract={onInteract}
            />
          </div>
        </UiProvider>
      </section>

      <div className="ni-cb__grid">
        <section className="ni-cb__card" aria-labelledby="ni-cb-answer">
          <h2 id="ni-cb-answer">Answer</h2>
          <p className="ni-cb__summary">{answerSummary(item)}</p>
          <JsonBlock label="Answer JSON" value={item.answer} />
        </section>

        <section className="ni-cb__card" aria-labelledby="ni-cb-difficulty">
          <h2 id="ni-cb-difficulty">Difficulty</h2>
          <table className="ni-cb__table">
            <caption className="ni-cb__sr">Difficulty breakdown</caption>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Weight × value</th>
                <th scope="col">Adds</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">base</th>
                <td />
                <td>{fmt(breakdown.base)}</td>
              </tr>
              {breakdown.terms.map((term) => (
                <tr key={term.feature}>
                  <th scope="row">
                    <code>{term.feature}</code>
                  </th>
                  <td>
                    {fmt(term.weight)} × {fmt(term.value)}
                  </td>
                  <td>{fmt(term.contribution)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">total</th>
                <td />
                <td data-testid="difficulty-total">{breakdown.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="ni-cb__card" aria-labelledby="ni-cb-response">
          <h2 id="ni-cb-response">Last response</h2>
          {answer ? (
            <div className="ni-cb__verdict" data-correct={answer.result.correct ? 'true' : 'false'}>
              <p className="ni-cb__verdict-head">
                <span className="ni-cb__badge" aria-hidden="true">
                  {answer.result.correct ? '✓' : '✗'}
                </span>
                {answer.result.correct ? 'Correct' : 'Not correct'}
              </p>
              <dl className="ni-cb__kv">
                <dt>Feedback</dt>
                <dd>
                  <code>{answer.result.feedback}</code> {render(answer.result.feedback)}
                </dd>
                <dt>Misconceptions</dt>
                <dd>
                  {answer.result.misconceptionIds.length
                    ? answer.result.misconceptionIds.join(', ')
                    : 'none'}
                </dd>
              </dl>
              <JsonBlock label="Response JSON" value={answer.response} />
            </div>
          ) : (
            <p className="ni-cb__muted">Answer in the widget to check a response.</p>
          )}
          <p className="ni-cb__muted">
            {events.length} interactions
            {lastEvent ? ` · last ${lastEvent.t} ${lastEvent.target}` : ''}
          </p>
        </section>
      </div>

      <div className="ni-cb__grid ni-cb__grid--wide">
        <section className="ni-cb__card" aria-labelledby="ni-cb-hints">
          <h2 id="ni-cb-hints">Hint ladder</h2>
          {hints.length ? (
            <table className="ni-cb__table ni-cb__table--hints">
              <caption className="ni-cb__sr">Hints by level</caption>
              <thead>
                <tr>
                  <th scope="col">Level</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Text</th>
                  <th scope="col">Ops</th>
                  <th scope="col">Overlay</th>
                </tr>
              </thead>
              <tbody>
                {hints.map((h) => (
                  <tr key={h.level}>
                    <td>{h.level}</td>
                    <td>{h.kind}</td>
                    <td>
                      {h.text}
                      <br />
                      <code className="ni-cb__muted">{h.key}</code>
                    </td>
                    <td>
                      {h.ops.length
                        ? h.ops.map((op, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: ops may repeat; the list is fixed per item.
                            <span key={i} className="ni-cb__nowrap">
                              {op}
                              {i < h.ops.length - 1 ? ', ' : ''}
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td className="ni-cb__nowrap">{h.overlay ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ni-cb__muted">No hints.</p>
          )}
        </section>

        <section className="ni-cb__card" aria-labelledby="ni-cb-solution">
          <h2 id="ni-cb-solution">Solution (Show me)</h2>
          {typeof steps === 'string' ? (
            <p role="alert">
              <code>{steps}</code>
            </p>
          ) : (
            <ol className="ni-cb__steps">
              {steps.map((s, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: steps are a fixed list per item.
                  key={i}
                  data-current={play?.step === i && !play.done ? 'true' : undefined}
                >
                  <span className="ni-cb__actor">{s.actor}</span> {render(s.say, s.vars ?? {})}
                  {s.action ? (
                    <code className="ni-cb__op">
                      {s.action.op}
                      {s.action.args ? ` ${JSON.stringify(s.action.args)}` : ''}
                    </code>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {play?.error ? (
            <p className="ni-cb__play-error" role="alert">
              {play.error}
            </p>
          ) : play?.done ? (
            <p className="ni-cb__muted">Played every step.</p>
          ) : null}
        </section>
      </div>

      <section className="ni-cb__card" aria-labelledby="ni-cb-config">
        <details>
          <summary>
            <h2 id="ni-cb-config">Widget config and params</h2>
          </summary>
          <div className="ni-cb__grid ni-cb__grid--two">
            <JsonBlock label="Widget config JSON" value={item.widget} />
            <JsonBlock label="Params JSON" value={item.params} />
          </div>
        </details>
      </section>
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <figure className="ni-cb__figure">
      <figcaption className="ni-cb__muted">{label}</figcaption>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable block must be keyboard reachable (axe scrollable-region-focusable). */}
      <pre className="ni-cb__json" tabIndex={0}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </figure>
  );
}
