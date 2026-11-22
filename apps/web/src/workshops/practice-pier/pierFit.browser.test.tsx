// The pier fit check (#12): the first seed of every template, rendered in the Practice Pier's
// screen at the two supported landscape viewports (06 §1), must fit the workshop area: nothing
// taller or wider than the area (it would scroll, and can hide Check), no control outside it and
// no scrolling part inside it. Runs in Chromium (vitest.fit.config.ts), as part of `pnpm test`.
//
// A template that does not fit yet is listed in `pierFitAllowlist.ts` with the reason; an entry
// that fits again fails here, so the list only ever shrinks.

import * as engine from '@number-island/engine';
import type { GeneratedItem, ItemTemplate } from '@number-island/shared';
import { type AgeMode, planLine, UiProvider } from '@number-island/ui';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { type AppContent, loadContent } from '@/app/boot/content';
import '@/styles.css';
import { PierItemScreen } from './PierScreen';
import {
  FIT_SEED_EXCEPTIONS,
  FIT_VIEWPORTS,
  type FitViewport,
  fitAllowance,
} from './pierFitAllowlist';

/**
 * The seeds the check plays: the first one. `VITE_FIT_SEEDS=1,2,3` plays more (a survey: other
 * seeds draw other numbers, and the allowlist is kept for the first seed only).
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

function show(item: GeneratedItem, ageMode: AgeMode) {
  const { answer: _answer, ...presented } = item;
  shown += 1;
  root.render(
    <UiProvider
      ageMode={ageMode}
      reducedMotion
      narrationText={(key, vars) => planLine(content.narration, key, vars)?.text}
    >
      <PierItemScreen
        item={presented}
        tier={item.tier}
        itemKey={shown}
        phase="answer"
        cue={null}
        progress={{ done: 0, total: 5 }}
        onLeave={() => {}}
        onNext={() => {}}
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
      if (widget.querySelector('.ni-placeholder')) return ['the widget did not render (fallback)'];
      return misfits(stage);
    }
  }
  throw new Error(`${templateId}: the layout did not settle`);
}

const ageModeOf = (template: ItemTemplate): AgeMode =>
  content.store.graph.skills[template.skillId]?.grade === 'K' ? 'k' : 'g1-up';

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
        show(engine.generateItem(template, seed), ageModeOf(template));
        const misfit = await measure(template.id);
        if (misfit.length > 0) found.push(...(SEEDS.length > 1 ? [`seed ${seed}`] : []), ...misfit);
      }
      if (SHOTS.includes(template.id)) {
        await page.screenshot({ path: `__fit__/${template.id}-${viewport}.png` });
        console.info(`${template.id} at ${viewport}: ${describeParts()}`);
      }
      if (found.length > 0 && !allowance) {
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
      if ((await measure(template.id)).length === 0) {
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
