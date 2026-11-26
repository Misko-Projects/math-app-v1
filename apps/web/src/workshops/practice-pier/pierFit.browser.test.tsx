// The pier fit check (#12): the first seed of every template, rendered in the Practice Pier's
// screen at the two supported landscape viewports (06 §1), must fit the workshop area: nothing
// taller or wider than the area (it would scroll, and can hide Check), no control outside it and
// no scrolling part inside it. Runs in Chromium (vitest.fit.config.ts), as part of `pnpm test`.
//
// A template that does not fit yet is listed in `pierFitAllowlist.ts` with the reason; an entry
// that fits again fails here, so the list only ever shrinks.
//
// The feedback flow (#20 part 2) is checked the same way: every template again with the look-again
// cue and the longest line a hint or its worked solution puts in the bubble (a long line makes
// the top row taller and the area smaller), every hint picture as a card over the area, and the
// break offer.
//
// The lesson player (#20 part 3) too: every example of every shipped lesson, on its own widget
// with the lesson's controls and the longest line the example puts in the bubble. The same pass
// reads which ops each widget animates in demo mode, and holds the lesson steps whose action a
// widget does not show against `LESSON_OPS_NOT_SHOWN` (the line is still spoken).
//
// A themed workshop plays in the same screen with its own bottom row. Road Crew (#27): every K–1
// template of its formats again in its screen, with its row of stones full, plain and under the
// longest line, and the workshop area exactly as large as the pier's.

import * as engine from '@number-island/engine';
import type { GeneratedItem, ItemTemplate, StimulusSpec } from '@number-island/shared';
import {
  type AgeMode,
  createDemoController,
  planLine,
  UiProvider,
  type WidgetDemo,
} from '@number-island/ui';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { type AppContent, loadContent } from '@/app/boot/content';
// The app's own faces, as `main.tsx` loads them: without them the layout is measured in whatever
// fallback fonts the machine has, and differs from machine to machine.
import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-700.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@/styles.css';
import { buildLesson, type LessonExamplePlay } from '@/runner/lesson';
import { BreakOffer, PlayItemScreen, type SpokenLine } from '../play/PlayScreen';
import { roadCrew } from '../road-crew';
import { RoadCrewBottom } from '../road-crew/RoadCrewScene';
import {
  FIT_SEED_EXCEPTIONS,
  FIT_VIEWPORTS,
  type FitViewport,
  fitAllowance,
  LESSON_FIT_EXCEPTIONS,
  LESSON_OPS_NOT_SHOWN,
} from './pierFitAllowlist';
import { pierPlayable } from './pierRequest';

/**
 * The seeds the check plays for every template: the first one by default. `VITE_FIT_SEEDS=2,3,4`
 * plays those instead; CI runs seeds 1 to 9 across its `stories` jobs (ci.yml), so a template
 * that fits its first item but not others is caught (#35).
 */
const SEEDS = ((import.meta.env.VITE_FIT_SEEDS as string | undefined) ?? '1')
  .split(',')
  .map(Number);
/** While working on a widget: `VITE_FIT_ONLY=number-pad,dot-flash` checks only those formats. */
const ONLY = (import.meta.env.VITE_FIT_ONLY as string | undefined)?.split(',');
/** `VITE_FIT_SHOTS=ADD.01.t4,…` saves a screenshot of those templates beside this file. */
const SHOTS = (import.meta.env.VITE_FIT_SHOTS as string | undefined)?.split(',') ?? [];
/** Rounding: a box may read a fraction of a pixel past its container. */
const SLACK_PX = 1;
/** Frames with the same measurements before a layout counts as settled. */
const SETTLED_FRAMES = 3;
const SETTLE_LIMIT_FRAMES = 240;

/** A registered widget showed its fallback: it failed to load or render, so nothing was checked. */
const FALLBACK = 'the widget did not render (fallback)';

const CONTROLS =
  'button, input, select, textarea, [role="button"], [role="slider"], [tabindex="0"]';

let content: AppContent;
let host: HTMLDivElement;
let root: Root;
let shown = 0;

beforeAll(async () => {
  content = await loadContent();
  const { graph } = content.store;
  engine.initContent({
    templates: graph.templates,
    narration: content.narration,
    misconceptions: content.misconceptions,
    templateStats: graph.templateStats,
  });
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';
  host = document.createElement('div');
  host.style.height = '100%';
  document.body.append(host);
  root = createRoot(host);
  // Every declared face, before the first measurement: a face is fetched when it is first used,
  // and a layout measured in its fallback is not the layout a child sees (a slow runner would
  // otherwise measure the first widget that uses a face before the face arrives).
  await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)));
  await document.fonts.ready;
});

afterAll(() => {
  root.unmount();
  host.remove();
});

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** The feedback state to show an item in: the look-again cue with a line, or a hint's picture. */
interface FeedbackState {
  line?: SpokenLine;
  picture?: StimulusSpec;
}

function show(
  item: GeneratedItem,
  ageMode: AgeMode,
  feedback: FeedbackState = {},
  /** In Road Crew's screen, with this many stones made. */
  roadCrewStones?: number,
  /** The same item on screen again (the feedback flow after a Check): the widget keeps its state. */
  again = false,
) {
  const { answer: _answer, ...presented } = item;
  if (!again) shown += 1;
  root.render(
    <UiProvider
      ageMode={ageMode}
      reducedMotion
      narrationText={(key, vars) => planLine(content.narration, key, vars)?.text}
    >
      <PlayItemScreen
        workshop={roadCrewStones === undefined ? undefined : roadCrew.id}
        bottom={
          roadCrewStones === undefined ? undefined : (
            <RoadCrewBottom done={0} total={5} made={roadCrewStones} />
          )
        }
        item={presented}
        tier={item.tier}
        itemKey={shown}
        phase="answer"
        cue={feedback.line ? { kind: 'again', say: feedback.line.say } : null}
        line={feedback.line ?? null}
        picture={feedback.picture ?? null}
        progress={{ done: 0, total: 5 }}
        onLeave={() => {}}
        onNext={() => {}}
        onHint={() => {}}
        onReplayPrompt={() => {}}
        onClosePicture={() => {}}
        onResponse={() => {}}
        onInteract={() => {}}
      />
    </UiProvider>,
  );
}

/** What does not fit in the stage as laid out now; empty when everything does. */
function misfits(stage: HTMLElement): string[] {
  const found: string[] = [];
  const over = (px: number) => Math.round(px);
  if (stage.scrollHeight - stage.clientHeight > SLACK_PX) {
    found.push(`${over(stage.scrollHeight - stage.clientHeight)} px too tall`);
  }
  if (stage.scrollWidth - stage.clientWidth > SLACK_PX) {
    found.push(`${over(stage.scrollWidth - stage.clientWidth)} px too wide`);
  }
  const box = stage.getBoundingClientRect();
  const area = {
    left: box.left + stage.clientLeft,
    top: box.top + stage.clientTop,
    right: box.left + stage.clientLeft + stage.clientWidth,
    bottom: box.top + stage.clientTop + stage.clientHeight,
  };
  let outside = 0;
  for (const el of stage.querySelectorAll<HTMLElement>(CONTROLS)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const by = Math.max(
      area.left - r.left,
      area.top - r.top,
      r.right - area.right,
      r.bottom - area.bottom,
    );
    if (by > SLACK_PX) outside = Math.max(outside, by);
  }
  if (outside > 0) found.push(`a control ${over(outside)} px outside the area`);
  // A widget that shrank its pieces under the size a child can count says so (base-ten-build).
  if (stage.querySelector('[data-fits="false"]')) found.push('pieces drawn under their floor');
  for (const el of stage.querySelectorAll<HTMLElement>('*')) {
    const tall = el.scrollHeight - el.clientHeight > SLACK_PX;
    const wide = el.scrollWidth - el.clientWidth > SLACK_PX;
    if (!tall && !wide) continue;
    const cs = getComputedStyle(el);
    const scrolls = (v: string) => v === 'auto' || v === 'scroll';
    if ((tall && scrolls(cs.overflowY)) || (wide && scrolls(cs.overflowX))) {
      found.push(`a scrolling part inside (${el.className || el.tagName.toLowerCase()})`);
      break;
    }
  }
  return found;
}

/** The stage's room and the size of each part of the widget's root (in a failure's message). */
function describeParts(): string {
  const stage = document.querySelector<HTMLElement>('[data-testid="pier-stage"]');
  const root = stage?.querySelector<HTMLElement>('.ni-widget')?.firstElementChild;
  if (!stage || !(root instanceof HTMLElement)) return 'no widget';
  const size = (el: Element) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  };
  const parts = [...root.children].map((el) => `${el.className.split(' ')[0]} ${size(el)}`);
  const cs = getComputedStyle(stage);
  const room = `${stage.clientWidth - 2 * Number.parseFloat(cs.paddingLeft)}x${stage.clientHeight - 2 * Number.parseFloat(cs.paddingTop)}`;
  return `room ${room}; root ${size(root)} ${JSON.stringify(root.dataset)}; ${parts.join(', ')}`;
}

/** Waits for the item's widget and a settled layout, then says what does not fit. */
async function measure(templateId: string): Promise<string[]> {
  let last = '';
  let same = 0;
  for (let i = 0; i < SETTLE_LIMIT_FRAMES; i += 1) {
    await frame();
    const stage = document.querySelector<HTMLElement>('[data-testid="pier-stage"]');
    const widget = stage?.querySelector<HTMLElement>('.ni-widget');
    if (!stage || !widget || widget.querySelector('.ni-widget__loading')) continue;
    const r = widget.firstElementChild?.getBoundingClientRect();
    const now = [stage.scrollHeight, stage.scrollWidth, r?.width, r?.height, r?.top].join();
    same = now === last ? same + 1 : 0;
    last = now;
    if (same >= SETTLED_FRAMES && document.fonts.status === 'loading') {
      // A face still on its way: measure again once it is in.
      await document.fonts.ready;
      same = 0;
      continue;
    }
    if (same >= SETTLED_FRAMES) {
      // Only registered formats get here: the fallback means the widget failed to load or render.
      if (widget.querySelector('.ni-placeholder')) return [FALLBACK];
      return misfits(stage);
    }
  }
  throw new Error(`${templateId}: the layout did not settle`);
}

const knownMisfit = (templateId: string, seed: number, viewport: FitViewport) =>
  FIT_SEED_EXCEPTIONS.some(
    (k) => k.template === templateId && k.seed === seed && k.at.includes(viewport),
  );

const ageModeOf = (template: ItemTemplate): AgeMode =>
  content.store.graph.skills[template.skillId]?.grade === 'K' ? 'k' : 'g1-up';

/** The longest line the feedback flow can put in the bubble for an item: a hint or a solution step. */
function longestLine(item: GeneratedItem): SpokenLine | undefined {
  const lines: SpokenLine[] = [
    ...item.hints
      .filter((h) => h.level >= 2 && h.level <= 4)
      .map((h) => ({ say: h.say, vars: h.vars })),
    ...engine.itemSolution(item).map((s) => ({ say: s.say, vars: s.vars })),
    { say: `fb.${item.format}.retry` },
    { say: 'fb.retry' },
    { say: 'fb.reveal' },
  ];
  const length = (l: SpokenLine) => planLine(content.narration, l.say, l.vars)?.text.length ?? 0;
  return lines.sort((a, b) => length(b) - length(a))[0];
}

/** A touch target a child can hit (06 §4). */
const MIN_TARGET_PX = 64;
/** Text a child reads (06 §5). */
const MIN_TEXT_PX = 24;

/** What is wrong with a card or screen of buttons laid over, or in, the workshop area. */
function cardMisfits(card: HTMLElement): string[] {
  const found: string[] = [];
  const box = card.getBoundingClientRect();
  for (const el of card.querySelectorAll<HTMLElement>('button, .ni-stimulus, .ni-bubble')) {
    const r = el.getBoundingClientRect();
    const by = Math.max(
      box.left - r.left,
      box.top - r.top,
      r.right - box.right,
      r.bottom - box.bottom,
    );
    const name = el.tagName === 'BUTTON' ? 'a button' : el.className.split(' ')[0];
    if (by > SLACK_PX) found.push(`${name} ${Math.round(by)} px outside`);
    if (r.width <= 1 || r.height <= 1) found.push(`${name} is not drawn`);
    if (el.tagName === 'BUTTON' && !el.classList.contains('ni-bubble')) {
      if (Math.min(r.width, r.height) < MIN_TARGET_PX - SLACK_PX) {
        found.push(`a button of ${Math.round(r.width)}x${Math.round(r.height)} px`);
      }
    }
  }
  return found;
}

describe.each(FIT_VIEWPORTS)('every template fits the pier at %s', (viewport: FitViewport) => {
  it('nothing taller or wider than the workshop area, no control outside it', async () => {
    const [width, height] = viewport.split('x').map(Number) as [number, number];
    await page.viewport(width, height);
    const templates = Object.values(content.store.graph.templates).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(templates.length).toBeGreaterThan(400);
    const failing: string[] = [];
    const fitsAgain: string[] = [];
    let allowed = 0;
    for (const template of templates) {
      if (ONLY && !ONLY.includes(template.format)) continue;
      const allowance = fitAllowance(template, viewport);
      if (allowance?.kind === 'no-widget') {
        allowed += 1;
        continue;
      }
      const found: string[] = [];
      for (const seed of SEEDS) {
        // A seed known not to fit is checked below, in every run.
        if (knownMisfit(template.id, seed, viewport)) continue;
        show(engine.generateItem(template, seed), ageModeOf(template));
        const misfit = await measure(template.id);
        if (misfit.length > 0) found.push(...(SEEDS.length > 1 ? [`seed ${seed}`] : []), ...misfit);
      }
      if (SHOTS.includes(template.id)) {
        await page.screenshot({ path: `__fit__/${template.id}-${viewport}.png` });
        console.info(`${template.id} at ${viewport}: ${describeParts()}`);
      }
      // An allowance is for a widget that renders and does not fit, never for one that did not render.
      if (found.includes(FALLBACK) || (found.length > 0 && !allowance)) {
        // With the parts' sizes, so a failure on another machine can be read from its log.
        failing.push(
          `${template.id} (${template.format}, ${template.tier}): ${found.join('; ')} [window ${window.innerWidth}x${window.innerHeight}; ${describeParts()}]`,
        );
      } else if (found.length === 0 && allowance) {
        fitsAgain.push(template.id);
      } else if (allowance) {
        allowed += 1;
      }
    }
    // The seeds known not to fit (the first seed of their template does): still not fitting.
    let knownSeeds = 0;
    for (const known of FIT_SEED_EXCEPTIONS) {
      const template = content.store.graph.templates[known.template];
      if (!known.at.includes(viewport) || !template) continue;
      if (ONLY && !ONLY.includes(template.format)) continue;
      show(engine.generateItem(template, known.seed), ageModeOf(template));
      const misfit = await measure(template.id);
      if (misfit.includes(FALLBACK)) {
        failing.push(`${known.template} seed ${known.seed}: ${FALLBACK}`);
      } else if (misfit.length === 0) {
        fitsAgain.push(`${known.template} seed ${known.seed}`);
      } else {
        knownSeeds += 1;
      }
    }
    console.info(
      `pier fit at ${viewport}: ${templates.length} templates, ${failing.length} do not fit, ${allowed} on the allowlist, ${knownSeeds} other seeds known not to fit`,
    );
    expect(failing, 'templates that do not fit the workshop area').toEqual([]);
    expect(fitsAgain, 'allowlisted templates that fit: remove them from the list').toEqual([]);
  });
});

// K02 (#17, PR #121). The first render is not the fullest a mat gets: a child trades. For the
// fullest item each place-value template of disks generates (n = 999), every state the child can
// reach by trading is measured too, up to the cap of a column of disks (20), where the widget
// offers no further split.
const count = (sel: string) => document.querySelectorAll(sel).length;
const tradeMat = () =>
  (['hundreds', 'tens', 'ones'] as const).map((c) => count(`.ni-btt__mat [data-piece^="${c}-"]`));
const buildMat = () =>
  (['hundreds', 'tens', 'ones'] as const).map((c) =>
    count(`.ni-btb__col[data-col="${c}"] .ni-btb__piece`),
  );
const button = (sel: string) => document.querySelector<HTMLButtonElement>(sel);

describe.each(FIT_VIEWPORTS)(
  'the fullest mats a child can reach fit the pier at %s (#17)',
  (viewport: FitViewport) => {
    const [width, height] = viewport.split('x').map(Number) as [number, number];
    /** The first item of `templateId` whose number is 999. */
    const fullest = (templateId: string): GeneratedItem => {
      const template = content.store.graph.templates[templateId] as ItemTemplate;
      for (let seed = 1; seed < 5000; seed += 1) {
        const item = engine.generateItem(template, seed);
        if (item.params.n === 999) return item;
      }
      throw new Error(`${templateId}: no item of 999 in 5000 seeds`);
    };
    const shot = async (id: string, state: string) => {
      if (SHOTS.includes(id))
        await page.screenshot({ path: `__fit__/${id}-${state}-${viewport}.png` });
    };

    it('base-ten-trade (PV.16.t2): 999 split to 8 hundreds 19 tens 9 ones, then to 18 tens 19 ones', async () => {
      await page.viewport(width, height);
      show(fullest('PV.16.t2'), 'g1-up');
      expect(await measure('PV.16.t2')).toEqual([]);
      expect(tradeMat()).toEqual([9, 9, 9]);
      const size = () =>
        document.querySelector('.ni-btt__mat [data-piece^="ones-"]')?.getBoundingClientRect().width;
      const before = size();
      button('[data-trade="trade-hundreds-tens"]')?.click();
      expect(await measure('PV.16.t2')).toEqual([]);
      expect(tradeMat()).toEqual([8, 19, 9]);
      await shot('PV.16.t2', 'goal-reached');
      // A second hundred would make 29 tens: no further split is offered.
      expect(button('[data-trade="trade-hundreds-tens"]')?.disabled).toBe(true);
      button('[data-trade="trade-tens-ones"]')?.click();
      expect(await measure('PV.16.t2')).toEqual([]);
      expect(tradeMat()).toEqual([8, 18, 19]);
      await shot('PV.16.t2', 'at-the-caps');
      // Both receiving columns are at their cap: neither split is offered, both groups are.
      expect(button('[data-trade="trade-hundreds-tens"]')?.disabled).toBe(true);
      expect(button('[data-trade="trade-tens-ones"]')?.disabled).toBe(true);
      expect(button('[data-trade="trade-ones-tens"]')?.disabled).toBe(false);
      // The disks keep one size through the trades, never under the floor.
      expect(size()).toBe(before);
      expect(before).toBeGreaterThanOrEqual(26);
    });

    it('base-ten-build (PV.16.t1): 8 hundreds 19 tens 9 ones, the ten tens joined, and split again', async () => {
      await page.viewport(width, height);
      show(fullest('PV.16.t1'), 'g1-up');
      expect(await measure('PV.16.t1')).toEqual([]);
      expect(buildMat()).toEqual([8, 19, 9]);
      expect(document.querySelector('[data-fits="false"]')).toBeNull();
      // At the cap already: a hundred cannot be split into ten more tens, nor a ten into ones
      // beside nine (19 is within the cap, so that split is offered).
      expect(button('[data-trade="split-hundreds"]')?.disabled).toBe(true);
      button('[data-trade="fuse-tens"]')?.click();
      expect(await measure('PV.16.t1')).toEqual([]);
      expect(buildMat()).toEqual([9, 9, 9]);
      await shot('PV.16.t1', 'goal-reached');
      button('[data-trade="split-tens"]')?.click();
      expect(await measure('PV.16.t1')).toEqual([]);
      expect(buildMat()).toEqual([9, 8, 19]);
      expect(button('[data-trade="split-tens"]')?.disabled).toBe(true);
      expect(document.querySelector('[data-fits="false"]')).toBeNull();
    });

    // A column at the cap itself (#35): 990 has no ones, so two splits of a ten make exactly 20.
    const ninetyNineTens = (templateId: string): GeneratedItem => {
      const template = content.store.graph.templates[templateId] as ItemTemplate;
      for (let seed = 1; seed < 20_000; seed += 1) {
        const item = engine.generateItem(template, seed);
        if (item.params.n === 990) return item;
      }
      throw new Error(`${templateId}: no item of 990 in 20000 seeds`);
    };

    it('base-ten-trade (PV.16.t2): 990 split to a column of exactly 20 ones, then 8 hundreds 17 tens 20 ones', async () => {
      await page.viewport(width, height);
      show(ninetyNineTens('PV.16.t2'), 'g1-up');
      expect(await measure('PV.16.t2')).toEqual([]);
      expect(tradeMat()).toEqual([9, 9, 0]);
      const size = () =>
        document.querySelector('.ni-btt__mat [data-piece^="tens-"]')?.getBoundingClientRect().width;
      const before = size();
      button('[data-trade="trade-tens-ones"]')?.click();
      expect(await measure('PV.16.t2')).toEqual([]);
      button('[data-trade="trade-tens-ones"]')?.click();
      expect(await measure('PV.16.t2')).toEqual([]);
      expect(tradeMat()).toEqual([9, 7, 20]);
      // A third split would make 30 ones.
      expect(button('[data-trade="trade-tens-ones"]')?.disabled).toBe(true);
      button('[data-trade="trade-hundreds-tens"]')?.click();
      expect(await measure('PV.16.t2')).toEqual([]);
      expect(tradeMat()).toEqual([8, 17, 20]);
      await shot('PV.16.t2', 'column-of-20');
      expect(size()).toBe(before);
    });

    it('base-ten-build (PV.16.t1): 990 as 8 hundreds 19 tens, split to a column of exactly 20 ones', async () => {
      await page.viewport(width, height);
      show(ninetyNineTens('PV.16.t1'), 'g1-up');
      expect(await measure('PV.16.t1')).toEqual([]);
      expect(buildMat()).toEqual([8, 19, 0]);
      button('[data-trade="split-tens"]')?.click();
      expect(await measure('PV.16.t1')).toEqual([]);
      button('[data-trade="split-tens"]')?.click();
      expect(await measure('PV.16.t1')).toEqual([]);
      expect(buildMat()).toEqual([8, 17, 20]);
      await shot('PV.16.t1', 'column-of-20');
      expect(button('[data-trade="split-tens"]')?.disabled).toBe(true);
      expect(document.querySelector('[data-fits="false"]')).toBeNull();
    });

    // K02 slice 2a (#17): two-digit compute items. The fullest states a child reaches: adding,
    // both numbers' pieces on the mat (8 tens 18 ones) and then the trade; subtracting, the mat
    // after one ten is split (8 tens 18 ones); and the open line after its longest jump path.
    const drawn = (
      templateId: string,
      ok: (a: number, b: number) => boolean,
    ): { item: GeneratedItem; template: ItemTemplate } => {
      const template = content.store.graph.templates[templateId] as ItemTemplate;
      for (let seed = 1; seed < 40_000; seed += 1) {
        const item = engine.generateItem(template, seed);
        if (ok(Number(item.params.a), Number(item.params.b))) return { item, template };
      }
      throw new Error(`${templateId}: no such item in 40000 seeds`);
    };
    const tens = (n: number) => Math.floor(n / 10);
    /** Fits, or (an allowlisted template at this viewport, #17) scrolls with every control kept. */
    const fitsOrAllowed = async (id: string) => {
      const misfit = await measure(id);
      const template = content.store.graph.templates[id] as ItemTemplate;
      if (fitAllowance(template, viewport)) expect(misfit).not.toContain(FALLBACK);
      else expect(misfit).toEqual([]);
    };
    const place = async (c: 'hundreds' | 'tens' | 'ones') => {
      await userEvent.click(document.querySelector(`[data-place-item="pending-${c}"]`) as Element);
      await userEvent.click(document.querySelector(`[data-place-target="col-${c}"]`) as Element);
    };

    // K02 slice 2b (#17): three-column compute on disks, allowlisted at 960 × 600 (they scroll,
    // Check reachable by scrolling) and fitting at 1280 × 800. The fullest states a child reaches:
    // a column of exactly 20 ones (990 − 115, two tens split, then a hundred), the tray at its
    // fullest (699 + 299: 2 hundreds 9 tens 9 ones, the mat at 8 hundreds 18 tens 18 ones before
    // the trades) and the take-away box at its fullest (900 − 899: 8 hundreds 9 tens 9 ones).
    const fromParams = (id: string, params: Record<string, number | string | boolean>) => {
      const template = content.store.graph.templates[id] as ItemTemplate;
      return { item: engine.generateItemFromParams(template, params), template };
    };
    const checkReachable = async () => {
      const check = button('.ni-btt__checkwrap button');
      expect(check).not.toBeNull();
      check?.scrollIntoView({ block: 'nearest' });
      await frame();
      const r = check?.getBoundingClientRect();
      expect(r).toBeDefined();
      expect((r?.top ?? -1) >= 0 && (r?.bottom ?? 1e9) <= window.innerHeight + SLACK_PX).toBe(true);
    };

    it('base-ten-trade (MDA.17.t1): 990 − 115 split to a column of exactly 20 ones, then a hundred', async () => {
      await page.viewport(width, height);
      const { item, template } = fromParams('MDA.17.t1', { a: 990, b: 115, op: '-' });
      show(item, ageModeOf(template));
      await fitsOrAllowed('MDA.17.t1');
      expect(tradeMat()).toEqual([9, 9, 0]);
      button('[data-trade="trade-tens-ones"]')?.click();
      await fitsOrAllowed('MDA.17.t1');
      button('[data-trade="trade-tens-ones"]')?.click();
      await fitsOrAllowed('MDA.17.t1');
      expect(tradeMat()).toEqual([9, 7, 20]);
      // A third split would make 30 ones.
      expect(button('[data-trade="trade-tens-ones"]')?.disabled).toBe(true);
      button('[data-trade="trade-hundreds-tens"]')?.click();
      await fitsOrAllowed('MDA.17.t1');
      expect(tradeMat()).toEqual([8, 17, 20]);
      await shot('MDA.17.t1', 'column-of-20');
      await checkReachable();
    });

    it.each(['MDA.05.t1', 'MDA.07.t1'])(
      'base-ten-trade (%s): 699 + 299, the tray at its fullest, joined and traded',
      async (id) => {
        await page.viewport(width, height);
        const { item, template } = fromParams(id, { a: 699, b: 299, op: '+' });
        show(item, ageModeOf(template));
        await fitsOrAllowed(id);
        await shot(id, 'tray-full');
        for (const c of ['hundreds', 'tens', 'ones'] as const) await place(c);
        await fitsOrAllowed(id);
        expect(tradeMat()).toEqual([8, 18, 18]);
        button('[data-trade="trade-ones-tens"]')?.click();
        await fitsOrAllowed(id);
        button('[data-trade="trade-tens-hundreds"]')?.click();
        await fitsOrAllowed(id);
        expect(tradeMat()).toEqual([9, 9, 8]);
        await shot(id, 'traded');
        await checkReachable();
      },
    );

    it.each(['MDA.18.t1', 'MDA.18.t2', 'MDA.21.t1'])(
      'base-ten-trade (%s): 900 − 899, split across the zero, the take-away box at its fullest',
      async (id) => {
        await page.viewport(width, height);
        const params = {
          a: 900,
          b: 899,
          op: '-',
          ...(id.startsWith('MDA.18') ? { zeroTens: true } : {}),
        };
        const { item, template } = fromParams(id, params);
        show(item, ageModeOf(template));
        await fitsOrAllowed(id);
        button('[data-trade="trade-hundreds-tens"]')?.click();
        await fitsOrAllowed(id);
        button('[data-trade="trade-tens-ones"]')?.click();
        await fitsOrAllowed(id);
        expect(tradeMat()).toEqual([8, 9, 10]);
        await shot(id, 'split');
        // The usual layout scrolls at 960 × 600: bring each piece and the box into view first. The
        // box is reached from the keyboard (focus, Enter): once it holds a piece, its "put back"
        // button covers the middle of the drop pad, where a pointer click would land.
        const press = async (sel: string) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) throw new Error(`nothing at ${sel}`);
          el.scrollIntoView({ block: 'nearest' });
          await frame();
          if (el.dataset.placeTarget === 'take') {
            el.focus();
            await userEvent.keyboard('{Enter}');
          } else await userEvent.click(el);
        };
        for (const [c, n] of [
          ['ones', 9],
          ['tens', 9],
          ['hundreds', 8],
        ] as const) {
          for (let i = 0; i < n; i += 1) {
            await press(`[data-place-item^="mat-${c}-"]`);
            await press('[data-place-target="take"]');
          }
        }
        await fitsOrAllowed(id);
        expect(tradeMat()).toEqual([0, 0, 1]);
        expect(count('.ni-btt__nest [data-piece^="taken-"]')).toBe(26);
        await shot(id, 'taken');
        await checkReachable();
      },
      90_000,
    );

    it('base-ten-trade (MDA.03.t1): 49 + 49 on the mat as 8 tens 18 ones, then traded', async () => {
      await page.viewport(width, height);
      const { item, template } = drawn(
        'MDA.03.t1',
        (a, b) => a % 10 === 9 && b % 10 === 9 && tens(a) + tens(b) === 8,
      );
      show(item, ageModeOf(template));
      await fitsOrAllowed('MDA.03.t1');
      await place('tens');
      await place('ones');
      await fitsOrAllowed('MDA.03.t1');
      expect(tradeMat()).toEqual([0, 8, 18]);
      await shot('MDA.03.t1', 'joined');
      button('[data-trade="trade-ones-tens"]')?.click();
      await fitsOrAllowed('MDA.03.t1');
      expect(tradeMat()).toEqual([0, 9, 8]);
      await shot('MDA.03.t1', 'traded');
    });

    it('base-ten-trade (MDA.12.t1): 98 − 19 with one ten split, 8 tens 18 ones', async () => {
      await page.viewport(width, height);
      const { item, template } = drawn('MDA.12.t1', (a, b) => a === 98 && b % 10 === 9);
      show(item, ageModeOf(template));
      await fitsOrAllowed('MDA.12.t1');
      button('[data-trade="trade-tens-ones"]')?.click();
      await fitsOrAllowed('MDA.12.t1');
      expect(tradeMat()).toEqual([0, 8, 18]);
      await shot('MDA.12.t1', 'split');
    });

    it('number-line-jump (MDA.12.t2): back 8 tens and the ones, every jump drawn', async () => {
      await page.viewport(width, height);
      const { item, template } = drawn('MDA.12.t2', (_a, b) => tens(b) === 8);
      show(item, ageModeOf(template));
      expect(await measure('MDA.12.t2')).toEqual([]);
      const hop = async (by: number) => {
        for (let i = 0; i < 12; i += 1) {
          const jump = document.querySelector<HTMLButtonElement>(`.ni-nlj__jump[data-by="${by}"]`);
          if (jump) return userEvent.click(jump);
          const now = Number(
            document.querySelector('.ni-nlj__jump[data-by]')?.getAttribute('data-by'),
          );
          const dir = Math.abs(by) > Math.abs(now) ? 'bigger' : 'smaller';
          await userEvent.click(document.querySelector(`[data-dir="${dir}"]`) as Element);
        }
        throw new Error(`no jump of ${by}`);
      };
      const b = Number(item.params.b);
      const jumps = [...new Array<number>(tens(b)).fill(-10), -(b % 10)];
      expect(jumps.length).toBe(9);
      for (const by of jumps) await hop(by);
      expect(await measure('MDA.12.t2')).toEqual([]);
      await shot('MDA.12.t2', 'all-jumps');
      // Nine arcs are drawn; a hop label with no free room is left out (the last one stays).
      expect(document.querySelectorAll('[data-hop]').length).toBeGreaterThan(0);
    });

    it('number-pad (MDA.04.t2): four addends on one line of the equation card, at the usual size', async () => {
      await page.viewport(width, height);
      const nums = () => [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="pier-stage"] .ni-npw__expr .ni-expr__num',
        ),
      ];
      const two = drawn('MDA.03.t4', () => true);
      show(two.item, ageModeOf(two.template));
      expect(await measure('MDA.03.t4')).toEqual([]);
      const usual = nums()[0]?.getBoundingClientRect().height ?? 0;
      const template = content.store.graph.templates['MDA.04.t2'] as ItemTemplate;
      let item: GeneratedItem | null = null;
      for (let seed = 1; seed < 5000 && !item; seed += 1) {
        const it4 = engine.generateItem(template, seed);
        if (it4.params.addends === 4) item = it4;
      }
      if (!item) throw new Error('MDA.04.t2: no four-addend item in 5000 seeds');
      show(item, ageModeOf(template));
      expect(await measure('MDA.04.t2')).toEqual([]);
      await shot('MDA.04.t2', 'four-addends');
      const shown = nums();
      expect(shown.length).toBe(4);
      const tops = shown.map((el) => el.getBoundingClientRect().top);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);
      // The card scales a long sum to keep it on one line: at 960 × 600 four addends are drawn at
      // 63% of a two-addend item's numerals (decided on #17 slice 2a; a stacked layout is a
      // follow-up), at 1280 × 800 at 83%.
      const least = width < 1280 ? 0.6 : 0.8;
      const el0 = shown[0] as HTMLElement;
      const drawnFont =
        (Number.parseFloat(getComputedStyle(el0).fontSize) * el0.getBoundingClientRect().height) /
        el0.offsetHeight;
      // The project bar for numerals: at least 32 px as drawn (37.5 px here at 960 × 600).
      expect(drawnFont, viewport).toBeGreaterThanOrEqual(32);
      expect(shown[0]?.getBoundingClientRect().height ?? 0).toBeGreaterThanOrEqual(usual * least);
    });

    it('PV.24.t1 shows no goal card: the mat that lacks one digit does not name what it is worth', async () => {
      await page.viewport(width, height);
      const template = content.store.graph.templates['PV.24.t1'] as ItemTemplate;
      for (const seed of [1, 2, 3]) {
        const item = engine.generateItem(template, seed);
        show(item, 'g1-up');
        expect(await measure('PV.24.t1')).toEqual([]);
        expect(document.querySelector('[data-testid="pier-stage"] .ni-btb__goal')).toBeNull();
        const n = Number(item.params.n);
        const place = Number(item.params.place);
        const worth = (Math.floor(n / 10 ** place) % 10) * 10 ** place;
        const stage = document.querySelector('[data-testid="pier-stage"]') as HTMLElement;
        const names = [...stage.querySelectorAll('[aria-label]')].map((e) =>
          e.getAttribute('aria-label'),
        );
        expect(`${stage.textContent} ${names.join(' ')}`).not.toMatch(new RegExp(`\\b${worth}\\b`));
      }
    });
  },
);

// #35: regrouping with a typed answer in a short room (960 × 600) is played in two steps, the
// pieces then the answer (base-ten-trade layout.ts planSteps). Every seed CI plays, operated as a
// child would: the tray emptied or the take-away filled, the trade, Next, the one-row pad, Check, a
// wrong answer's look-again cue, Back and Next. At 1280 × 800 the usual layout stays.
const STEP_TEMPLATES = ['MDA.08.t1', 'MDA.03.t1', 'MDA.10.t1', 'MDA.12.t1'] as const;
const stepsRoot = () => document.querySelector<HTMLElement>('.ni-btt');
const tap = async (sel: string) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`nothing at ${sel}`);
  await userEvent.click(el);
};
const typedAnswer = () => document.querySelector('.ni-btt__stepside .ni-btt__answer')?.textContent;

describe('regrouping in a short room: the pieces, then the answer (#35)', () => {
  const shot = async (id: string, state: string) => {
    if (SHOTS.includes(id)) await page.screenshot({ path: `__fit__/${id}-${state}-960x600.png` });
  };

  it.each(STEP_TEMPLATES)('%s on every seed, in every step a child reaches', async (id) => {
    await page.viewport(960, 600);
    const template = content.store.graph.templates[id] as ItemTemplate;
    const failing: string[] = [];
    const check = async (seed: number, state: string) => {
      const misfit = await measure(id);
      if (misfit.length > 0)
        failing.push(`seed ${seed} ${state}: ${misfit.join('; ')} [${describeParts()}]`);
      await shot(id, `s${seed}-${state}`);
    };
    for (const seed of SEEDS) {
      const item = engine.generateItem(template, seed);
      const a = Number(item.params.a);
      const b = Number(item.params.b);
      const plus = item.params.op === '+';
      const result = plus ? a + b : a - b;
      show(item, ageModeOf(template));
      await check(seed, 'first');
      expect(stepsRoot()?.dataset.arrange, `${id} seed ${seed}`).toBe('steps');
      expect(stepsRoot()?.dataset.step).toBe('pieces');
      // Neither the numbers nor the result reach 100: no Hundreds column, and no pad yet.
      expect(count('.ni-btt__mat [data-col="hundreds"]')).toBe(0);
      expect(count('.ni-pad__key')).toBe(0);
      if (plus) {
        for (const c of ['tens', 'ones'] as const) {
          if (document.querySelector(`[data-place-item="pending-${c}"]`)) {
            await tap(`[data-place-item="pending-${c}"]`);
            await tap(`[data-place-target="col-${c}"]`);
          }
        }
        await check(seed, 'joined');
        expect(tradeMat()).toEqual([
          0,
          Math.floor(a / 10) + Math.floor(b / 10),
          (a % 10) + (b % 10),
        ]);
        button('[data-trade="trade-ones-tens"]')?.click();
        await check(seed, 'traded');
      } else {
        button('[data-trade="trade-tens-ones"]')?.click();
        await check(seed, 'split');
        for (const c of ['tens', 'ones'] as const) {
          const n = c === 'tens' ? Math.floor(b / 10) : b % 10;
          for (let i = 0; i < n; i += 1) {
            await tap(`[data-place-item^="mat-${c}-"]`);
            await tap('[data-place-target="take"]');
          }
        }
        await check(seed, 'taken');
        expect(count('.ni-btt__takebox [data-piece^="taken-"]')).toBe(
          Math.floor(b / 10) + (b % 10),
        );
      }
      // Next stands where "check" will: the answer step, focus on the answer box.
      await tap('[data-cue="next"] button');
      await check(seed, 'answer');
      expect(stepsRoot()?.dataset.step).toBe('answer');
      expect(document.activeElement?.classList.contains('ni-btt__answer')).toBe(true);
      expect(document.querySelector('.ni-btt [role="status"]')?.textContent).not.toBe('');
      const keys = [...document.querySelectorAll<HTMLElement>('.ni-pad__key')];
      expect(keys.map((k) => k.dataset.key)).toEqual([...'1234567890'.split(''), 'back']);
      for (const [i, k] of keys.entries()) {
        const r = k.getBoundingClientRect();
        expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(MIN_TARGET_PX - SLACK_PX);
        const next = keys[i + 1]?.getBoundingClientRect();
        if (next) expect(next.left - r.right).toBeGreaterThanOrEqual(12 - SLACK_PX);
      }
      // A wrong answer typed on the keyboard and the pad, checked: the look-again cue and a line,
      // the item on screen again with its state.
      const wrong = String(result + 1);
      await userEvent.keyboard(wrong.slice(0, 1));
      for (const d of wrong.slice(1)) await tap(`.ni-pad__key[data-key="${d}"]`);
      expect(typedAnswer()).toBe(wrong);
      expect(button('.ni-btt__stepside .ni-btt__checkwrap button')?.disabled).toBe(false);
      await tap('.ni-btt__stepside .ni-btt__checkwrap button');
      show(item, ageModeOf(template), { line: longestLine(item) }, undefined, true);
      await check(seed, 'look-again');
      expect(stepsRoot()?.dataset.step).toBe('answer');
      expect(typedAnswer()).toBe(wrong);
      // Back to the mat (focus on it), the pieces as they were; Next again keeps the answer.
      await tap('[data-cue="back"] button');
      await check(seed, 'back');
      expect(document.activeElement?.classList.contains('ni-btt__mat')).toBe(true);
      expect(count('.ni-pad__key')).toBe(0);
      await tap('[data-cue="next"] button');
      expect(typedAnswer()).toBe(wrong);
    }
    expect(failing, `${id} steps that do not fit`).toEqual([]);
  });

  // Principle 4 (#35): the three-digit compute slice (MDA.05, MDA.17) will draw disks in three
  // columns. Its fullest, 990 − 15 with a column of 20 ones, does not fit the two steps at the
  // disks' floor (276 px too wide, layout.steps.test.ts): it keeps the usual layout and scrolls,
  // with disks of 25 px (one under DISK_FLOOR). Measured here so the slice starts from the number.
  it('a three-column compute mat of disks (no shipped item) keeps the usual layout', async () => {
    await page.viewport(960, 600);
    const base = engine.generateItem(content.store.graph.templates['MDA.12.t1'] as ItemTemplate, 1);
    const item = {
      ...base,
      widget: {
        format: 'base-ten-trade',
        start: { hundreds: 9, tens: 9, ones: 0 },
        operation: { op: '-', operand: { hundreds: 0, tens: 1, ones: 5 } },
        goal: 'compute',
        showAlgorithm: false,
        thenAsk: true,
      },
    } as GeneratedItem;
    show(item, 'g1-up');
    await measure('990 − 15');
    expect(stepsRoot()?.dataset.arrange).toBe('tall');
    button('[data-trade="trade-tens-ones"]')?.click();
    await measure('990 − 15');
    button('[data-trade="trade-tens-ones"]')?.click();
    await measure('990 − 15');
    expect(tradeMat()).toEqual([9, 7, 20]);
    const disk = document.querySelector('.ni-btt__mat [data-piece^="ones-"]');
    expect(Math.round(disk?.getBoundingClientRect().width ?? 0)).toBe(25);
    await shot('disks-990-15', 'column-of-20');
  });

  it('the usual layout stays at 1280 × 800', async () => {
    await page.viewport(1280, 800);
    for (const id of STEP_TEMPLATES) {
      const template = content.store.graph.templates[id] as ItemTemplate;
      show(engine.generateItem(template, 1), ageModeOf(template));
      expect(await measure(id)).toEqual([]);
      expect(stepsRoot()?.dataset.arrange, id).not.toBe('steps');
      expect(count('.ni-btt__mat [data-col="hundreds"]')).toBe(1);
    }
  });

  // Review round 1 (#126): these templates are concrete, and the hint builder draws no picture
  // overlay for a concrete tier, so their hints are lines only: measured on every seed with the
  // look-again cue above. Should one ever draw a picture, this fails and its fit is to be checked.
  it('these concrete templates show no hint picture on any seed (their hints are lines)', () => {
    const pictures: string[] = [];
    for (const id of STEP_TEMPLATES) {
      const template = content.store.graph.templates[id] as ItemTemplate;
      for (const seed of SEEDS) {
        const item = engine.generateItem(template, seed);
        const picture = item.hints.find((h) => h.overlay && h.overlay.kind !== 'none')?.overlay;
        if (picture) pictures.push(`${id} seed ${seed}: ${picture.kind}`);
      }
    }
    expect(pictures).toEqual([]);
  });

  it.each(['MDA.03', 'MDA.12'])('the %s lesson, step by step, fits', async (skillId) => {
    await page.viewport(960, 600);
    const { graph } = content.store;
    const skill = graph.skills[skillId];
    const lesson = skill ? buildLesson(engine, graph, skill, pierPlayable) : null;
    if (!lesson) throw new Error(`no lesson for ${skillId}`);
    const failing: string[] = [];
    let steps = 0;
    for (const example of lesson.examples) {
      if (example.template.format !== 'base-ten-trade') continue;
      const demo = createDemoController({ strict: false, warn: () => {} });
      const line = example.steps[0]
        ? { say: example.steps[0].say, vars: example.steps[0].vars }
        : { say: lesson.intro };
      showLesson(example, 'g1-up', line, demo);
      const name = `${skillId} ${example.phase} ${example.example + 1}`;
      const first = await measure(name);
      if (first.length > 0) failing.push(`${name} first: ${first.join('; ')}`);
      for (const [i, step] of example.steps.entries()) {
        if (!step.action) continue;
        // Worked: the demo plays it; faded: the child is invited to it.
        if (example.phase === 'worked') await demo.play(step.action);
        else demo.invite(step.action);
        const misfit = await measure(name);
        steps += 1;
        if (misfit.length > 0)
          failing.push(
            `${name} step ${i + 1} (${step.action.op}): ${misfit.join('; ')} [${describeParts()}]`,
          );
        if (example.phase !== 'worked') {
          // The invited control is on screen (its step shown).
          const want =
            step.action.op === 'answer' || step.action.op === 'write-digit' ? 'answer' : 'pieces';
          expect(stepsRoot()?.dataset.step, `${name} step ${i + 1}`).toBe(want);
          demo.invite(null);
          await demo.play(step.action);
        }
      }
    }
    console.info(`${skillId} lesson at 960x600: ${steps} steps played`);
    expect(steps).toBeGreaterThan(3);
    expect(failing).toEqual([]);
  });
});

describe.each(FIT_VIEWPORTS)('Road Crew fits its formats at %s (#27)', (viewport: FitViewport) => {
  /** More stones than a request makes (one per item). */
  const STONES = 12;
  const stageSize = () => {
    const stage = document.querySelector<HTMLElement>('[data-testid="pier-stage"]');
    return stage ? `${stage.clientWidth}x${stage.clientHeight}` : 'no stage';
  };

  it('every K–1 template of its formats fits its screen, which gives the widget the room the pier does', async () => {
    const [width, height] = viewport.split('x').map(Number) as [number, number];
    await page.viewport(width, height);
    const { graph } = content.store;
    const templates = Object.values(graph.templates)
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((t) => roadCrew.formats.includes(t.format))
      .filter((t) => ['K', '1'].includes(String(graph.skills[t.skillId]?.grade)))
      // What does not fit the pier yet (`pierFitAllowlist.ts`) does not fit here either.
      .filter((t) => !fitAllowance(t, viewport));
    for (const format of roadCrew.formats) {
      expect(
        templates.some((t) => t.format === format),
        format,
      ).toBe(true);
    }
    const failing: string[] = [];
    for (const template of templates) {
      const item = engine.generateItem(template, 1);
      const ageMode = ageModeOf(template);
      show(item, ageMode);
      await measure(template.id);
      const pierRoom = stageSize();
      // In K the bubble shows no words (06 §5), so a line cannot change the layout.
      const states: FeedbackState[] = ageMode === 'k' ? [{}] : [{}, { line: longestLine(item) }];
      for (const state of states) {
        show(item, ageMode, state, STONES);
        const misfit = await measure(template.id);
        if (!state.line && stageSize() !== pierRoom) {
          misfit.push(`the workshop area is ${stageSize()}, the pier's is ${pierRoom}`);
        }
        const frame = document.querySelector<HTMLElement>('[data-testid="pier"]');
        const tray = document.querySelector<HTMLElement>('[data-testid="road-crew-tray"]');
        const box = tray?.getBoundingClientRect();
        if (frame?.dataset.workshop !== roadCrew.id) misfit.push('not the Road Crew screen');
        if (tray?.dataset.made !== String(STONES)) misfit.push('the row of stones is not drawn');
        if (
          !box ||
          box.left < 0 ||
          box.right > width + SLACK_PX ||
          box.bottom > height + SLACK_PX
        ) {
          misfit.push('the row of stones is off the screen');
        }
        if (misfit.length > 0) {
          failing.push(
            `${template.id} (${template.format}, ${template.tier})${state.line ? ' under a line' : ''}: ${misfit.join('; ')} [${describeParts()}]`,
          );
        }
      }
      if (SHOTS.includes(template.id)) {
        await page.screenshot({ path: `__fit__/${template.id}-road-crew-${viewport}.png` });
      }
    }
    console.info(
      `Road Crew fit at ${viewport}: ${templates.length} K–1 templates, ${failing.length} do not fit`,
    );
    expect(failing, 'templates that do not fit the Road Crew screen').toEqual([]);
  });
});

describe.each(FIT_VIEWPORTS)('the feedback flow fits the pier at %s', (viewport: FitViewport) => {
  const [width, height] = viewport.split('x').map(Number) as [number, number];
  const templates = () =>
    Object.values(content.store.graph.templates)
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((t) => !(ONLY && !ONLY.includes(t.format)) && !fitAllowance(t, viewport));

  it('every template still fits with the look-again cue and its longest hint or solution line', async () => {
    await page.viewport(width, height);
    const failing: string[] = [];
    let checked = 0;
    for (const template of templates()) {
      // In K the bubble shows no words (06 §5), so a line cannot change the layout.
      if (ageModeOf(template) === 'k') continue;
      const item = engine.generateItem(template, 1);
      const line = longestLine(item);
      show(item, 'g1-up', { line });
      const misfit = await measure(template.id);
      checked += 1;
      if (SHOTS.includes(template.id)) {
        await page.screenshot({ path: `__fit__/${template.id}-line-${viewport}.png` });
      }
      if (misfit.length > 0) {
        failing.push(
          `${template.id} (${template.format}) with "${line ? planLine(content.narration, line.say, line.vars)?.text : ''}": ${misfit.join('; ')} [${describeParts()}]`,
        );
      }
    }
    expect(checked).toBeGreaterThan(100);
    console.info(
      `pier feedback fit at ${viewport}: ${checked} templates with a line, ${failing.length} do not fit`,
    );
    expect(failing, 'templates that do not fit under a hint line').toEqual([]);
  });

  it('every hint picture fits its card, with a close button a child can hit', async () => {
    await page.viewport(width, height);
    const failing: string[] = [];
    let checked = 0;
    for (const template of templates()) {
      const item = engine.generateItem(template, 1);
      const picture = item.hints.find((h) => h.overlay && h.overlay.kind !== 'none')?.overlay;
      if (!picture) continue;
      show(item, ageModeOf(template), { picture });
      await measure(template.id);
      let card: HTMLElement | null = null;
      for (let i = 0; i < SETTLE_LIMIT_FRAMES && !card?.querySelector('.ni-stimulus'); i += 1) {
        await frame();
        card = document.querySelector<HTMLElement>('[data-testid="pier-hint-picture"]');
      }
      checked += 1;
      const misfit = card?.querySelector('.ni-stimulus')
        ? cardMisfits(card)
        : ['the picture did not render'];
      if (SHOTS.includes(template.id)) {
        await page.screenshot({ path: `__fit__/${template.id}-picture-${viewport}.png` });
      }
      if (misfit.length > 0) failing.push(`${template.id} (${picture.kind}): ${misfit.join('; ')}`);
    }
    expect(checked).toBeGreaterThan(100);
    console.info(
      `pier hint pictures at ${viewport}: ${checked} pictures, ${failing.length} do not fit`,
    );
    expect(failing, 'hint pictures that do not fit their card').toEqual([]);
  });

  it.each(['k', 'g1-up'] as const)(
    'the break offer and the hint button fit (%s)',
    async (ageMode) => {
      await page.viewport(width, height);
      root.render(
        <UiProvider
          ageMode={ageMode}
          reducedMotion
          narrationText={(key, vars) => planLine(content.narration, key, vars)?.text}
        >
          <BreakOffer onKeep={() => {}} onBreak={() => {}} onLeave={() => {}} />
        </UiProvider>,
      );
      let screen: HTMLElement | null = null;
      for (let i = 0; i < SETTLE_LIMIT_FRAMES && !screen; i += 1) {
        await frame();
        screen = document.querySelector<HTMLElement>('[data-testid="pier-break"]');
      }
      if (!screen) throw new Error('the break offer did not render');
      await frame();
      const stage = screen.querySelector<HTMLElement>('[data-testid="pier-stage"]') as HTMLElement;
      expect(stage.scrollHeight - stage.clientHeight).toBeLessThanOrEqual(SLACK_PX);
      expect(stage.scrollWidth - stage.clientWidth).toBeLessThanOrEqual(SLACK_PX);
      expect(cardMisfits(stage)).toEqual([]);
      expect(stage.querySelectorAll('button:not(.ni-bubble)')).toHaveLength(2);
      const words = stage.querySelector<HTMLElement>('.ni-bubble');
      expect(words?.textContent).toMatch(/stop/);
      expect(
        Number.parseFloat(getComputedStyle(words as HTMLElement).fontSize),
      ).toBeGreaterThanOrEqual(MIN_TEXT_PX);
      if (SHOTS.includes('break')) {
        await page.screenshot({ path: `__fit__/break-${ageMode}-${viewport}.png` });
      }

      // The lightbulb in the top row of an item.
      const template = Object.values(content.store.graph.templates).find(
        (t) => t.format === 'number-pad' && !fitAllowance(t, viewport),
      ) as ItemTemplate;
      show(engine.generateItem(template, 1), ageMode);
      await measure(template.id);
      const hint = document.querySelector<HTMLElement>('[data-testid="pier"] header .ni-hint');
      const r = hint?.getBoundingClientRect();
      expect(Math.min(r?.width ?? 0, r?.height ?? 0)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    },
  );
});

/** A lesson example on screen as the lesson player shows it: input off, the lesson's controls. */
function showLesson(
  example: LessonExamplePlay,
  ageMode: AgeMode,
  line: SpokenLine,
  demo: WidgetDemo,
) {
  shown += 1;
  root.render(
    <UiProvider
      ageMode={ageMode}
      reducedMotion
      narrationText={(key, vars) => planLine(content.narration, key, vars)?.text}
    >
      <PlayItemScreen
        item={{ widget: example.item.widget, prompt: { narration: line.say, vars: line.vars } }}
        lesson={{
          onReplay: () => {},
          // "I can try" is offered during the worked examples, from grade 1 (03 §6.2).
          onSkip: ageMode === 'k' || example.phase !== 'worked' ? null : () => {},
        }}
        tier={example.item.tier}
        itemKey={shown}
        phase="lesson"
        cue={null}
        line={line}
        demo={demo}
        progress={{ done: 0, total: 5 }}
        onLeave={() => {}}
        onNext={() => {}}
        onResponse={() => {}}
        onInteract={() => {}}
      />
    </UiProvider>,
  );
}

describe.each(FIT_VIEWPORTS)('every lesson fits the pier at %s', (viewport: FitViewport) => {
  it('each example on its widget, with the lesson controls and its longest line', async () => {
    const [width, height] = viewport.split('x').map(Number) as [number, number];
    await page.viewport(width, height);
    const { graph } = content.store;
    const length = (l: SpokenLine) => planLine(content.narration, l.say, l.vars)?.text.length ?? 0;
    const failing: string[] = [];
    const notShown: string[] = [];
    const fitsAgain: string[] = [];
    // The example that fits with the least room to spare (named in the log, for evidence).
    let tightest = { id: '', spare: Number.POSITIVE_INFINITY };
    let lessons = 0;
    let examples = 0;
    let allowed = 0;
    for (const skillId of [...graph.nodes].sort()) {
      const skill = graph.skills[skillId];
      const lesson = skill ? buildLesson(engine, graph, skill, pierPlayable) : null;
      if (!skill || !lesson) continue;
      if (ONLY && !lesson.examples.some((e) => ONLY.includes(e.template.format))) continue;
      lessons += 1;
      const ageMode: AgeMode = skill.grade === 'K' ? 'k' : 'g1-up';
      for (const example of lesson.examples) {
        const lines: SpokenLine[] = example.steps.map((s) => ({ say: s.say, vars: s.vars }));
        // The first example also carries the intro, and the last one the outro.
        if (example === lesson.examples[0]) lines.push({ say: lesson.intro });
        if (example === lesson.examples.at(-1) && lesson.outro) lines.push({ say: lesson.outro });
        const line = lines.sort((a, b) => length(b) - length(a))[0] as SpokenLine;
        const demo = createDemoController({ strict: false, warn: () => {} });
        showLesson(example, ageMode, line, demo);
        const id = `${skillId} ${example.phase} ${example.example + 1} (${example.template.id}, ${example.template.format})`;
        const misfit = await measure(id);
        examples += 1;
        if (SHOTS.includes(`${skillId}:${example.phase}:${example.example}`)) {
          await page.screenshot({
            path: `__fit__/lesson-${skillId}-${example.phase}${example.example}-${viewport}.png`,
          });
        }
        // The lesson's own buttons: a child can hit them, and the line can be read. No widget's
        // allowance covers these.
        const controls: string[] = [];
        const header = document.querySelector<HTMLElement>('[data-testid="pier"] header');
        for (const button of header?.querySelectorAll<HTMLElement>('button:not(.ni-bubble)') ??
          []) {
          const r = button.getBoundingClientRect();
          if (Math.min(r.width, r.height) < MIN_TARGET_PX - SLACK_PX) {
            controls.push(`a lesson button of ${Math.round(r.width)}x${Math.round(r.height)} px`);
          }
        }
        const words = header?.querySelector<HTMLElement>('.ni-bubble__text');
        if (words && Number.parseFloat(getComputedStyle(words).fontSize) < MIN_TEXT_PX) {
          controls.push(`the line is set in ${getComputedStyle(words).fontSize}`);
        }
        if (header && header.scrollWidth - header.clientWidth > SLACK_PX) {
          controls.push(`the top row is ${header.scrollWidth - header.clientWidth} px too wide`);
        }
        if (controls.length > 0) failing.push(`${id}: ${controls.join('; ')}`);
        if (misfit.includes(FALLBACK)) {
          failing.push(`${id}: ${FALLBACK}`);
          continue;
        }
        const known = LESSON_FIT_EXCEPTIONS.find(
          (x) =>
            x.example === `${skillId}:${example.phase}:${example.example}` &&
            x.at.includes(viewport),
        );
        if (known && misfit.length === 0) fitsAgain.push(known.example);
        const stageEl = document.querySelector<HTMLElement>('[data-testid="pier-stage"]');
        const rootEl = stageEl?.querySelector<HTMLElement>('.ni-widget')?.firstElementChild;
        if (misfit.length === 0 && stageEl && rootEl) {
          const pad = 2 * Number.parseFloat(getComputedStyle(stageEl).paddingTop);
          const spare = stageEl.clientHeight - pad - rootEl.getBoundingClientRect().height;
          const parts = [...rootEl.children].reduce(
            (sum, el) => sum + el.getBoundingClientRect().height,
            0,
          );
          // Room the widget's own parts leave in the area, whatever the root stretches to.
          const free = Math.min(spare, stageEl.clientHeight - pad - parts);
          if (Number.isFinite(free) && Math.abs(free) < Math.abs(tightest.spare)) {
            tightest = { id, spare: Math.round(free) };
          }
        }
        // A template the item check already lists for this viewport is not held against the lesson.
        if (misfit.length > 0 && (known || fitAllowance(example.template, viewport))) allowed += 1;
        else if (misfit.length > 0)
          failing.push(`${id}: ${misfit.join('; ')} [${describeParts()}]`);
        // Demo mode: the ops this widget animates, against the ops the example's steps ask for.
        example.steps.forEach((step, i) => {
          if (step.action && !demo.ops.includes(step.action.op)) {
            notShown.push(
              `${skillId} ${example.phase} ${example.example + 1} step ${i + 1}: ${step.action.op} (${example.template.format})`,
            );
          }
        });
      }
    }
    console.info(
      `pier lesson fit at ${viewport}: ${lessons} lessons, ${examples} examples, ${failing.length} do not fit, ${allowed} on the allowlist, ${notShown.length} steps a widget cannot show; tightest fit: ${tightest.id} (${tightest.spare} px to spare)`,
    );
    if (!ONLY) {
      expect(lessons).toBeGreaterThan(50);
      expect(notShown, 'lesson steps whose action the widget does not animate').toEqual([
        ...LESSON_OPS_NOT_SHOWN,
      ]);
    }
    expect(failing, 'lesson examples that do not fit the workshop area').toEqual([]);
    expect(fitsAgain, 'listed lesson examples that fit: remove them from the list').toEqual([]);
  });
});

// A worked step says what the demo does ("This piece fits here."), so the demo must be seen to do
// it: after each worked step's action the widget shows something it did not show before. Held for
// the shape widgets, whose seeded examples are other shapes and outlines now that the examples aim
// at the built template stats (#11): a demo that could not place a piece in the new outline would
// leave the words over an unchanged picture.
describe('a worked step of a shape lesson changes what the widget shows', () => {
  const SHAPES = ['shape-compose', 'shape-sort'];

  it('each action of each worked example, played in order', async () => {
    await page.viewport(960, 600);
    const { graph } = content.store;
    const unchanged: string[] = [];
    let actions = 0;
    for (const skillId of [...graph.nodes].sort()) {
      const skill = graph.skills[skillId];
      const lesson = skill ? buildLesson(engine, graph, skill, pierPlayable) : null;
      if (!skill || !lesson) continue;
      for (const example of lesson.examples) {
        if (example.phase !== 'worked' || !SHAPES.includes(example.template.format)) continue;
        const demo = createDemoController({ strict: true });
        showLesson(example, skill.grade === 'K' ? 'k' : 'g1-up', { say: lesson.intro }, demo);
        const id = `${skillId} worked ${example.example + 1} (${example.template.format})`;
        await measure(id);
        const widget = () =>
          document.querySelector<HTMLElement>('[data-testid="pier-stage"] .ni-widget')?.outerHTML;
        for (const [i, step] of example.steps.entries()) {
          if (!step.action) continue;
          const before = widget();
          await demo.play(step.action);
          await frame();
          await frame();
          actions += 1;
          if (widget() === before) unchanged.push(`${id} step ${i + 1}: ${step.action.op}`);
        }
      }
    }
    console.info(`shape lessons: ${actions} worked actions played`);
    expect(actions).toBeGreaterThan(10);
    expect(unchanged, 'worked steps whose action left the widget as it was').toEqual([]);
  });
});

// A guard (#35, #11): `CPS.06:worked:0` once gave two answers. A seeded lesson example aims at its
// template's median difficulty from `template-stats.json` (03 §6.1), and that file used to be in
// `dist/` only after `pnpm content:validate`, so the example was one item inside `pnpm verify`
// and another in every built app. The stats are now a `pnpm content:build` output the app cannot
// start without, so there is one item, and it must fit: the whole-5 bond that once stacked and
// scrolled at 960 × 600.
describe('a seeded lesson example aims at the built template stats', () => {
  it('CPS.06 worked 1 is the median item, not the fallback one, and fits at 960×600', async () => {
    await page.viewport(960, 600);
    const { graph } = content.store;
    const skill = graph.skills['CPS.06'];
    if (!skill) throw new Error('no CPS.06');
    expect(Object.keys(graph.templateStats).sort()).toEqual(Object.keys(graph.templates).sort());
    const lesson = buildLesson(engine, graph, skill, pierPlayable);
    const example = lesson?.examples[0];
    if (!example) throw new Error('no worked example');
    const fallback = buildLesson(engine, { ...graph, templateStats: {} }, skill, pierPlayable);
    expect(JSON.stringify(example.item.widget)).not.toBe(
      JSON.stringify(fallback?.examples[0]?.item.widget),
    );
    expect(example.item.widget).toMatchObject({ format: 'number-bond', whole: 5 });
    const demo = createDemoController({ strict: false, warn: () => {} });
    showLesson(example, 'g1-up', { say: lesson.intro }, demo);
    expect(await measure('CPS.06 worked 1')).toEqual([]);
  });
});
