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
import { FIT_VIEWPORTS, type FitViewport, fitAllowance } from './pierFitAllowlist';
import { PierItemScreen } from './PierScreen';

/** The seed the check plays: the first one. */
const SEED = 1;
/** While working on a widget: `VITE_FIT_ONLY=number-pad,dot-flash` checks only those formats. */
const ONLY = (import.meta.env.VITE_FIT_ONLY as string | undefined)?.split(',');
/** `VITE_FIT_SHOTS=ADD.01.t4,…` saves a screenshot of those templates beside this file. */
const SHOTS = (import.meta.env.VITE_FIT_SHOTS as string | undefined)?.split(',') ?? [];
/** Rounding: a box may read a fraction of a pixel past its container. */
const SLACK_PX = 1;
/** Frames with the same measurements before a layout counts as settled. */
const SETTLED_FRAMES = 3;
const SETTLE_LIMIT_FRAMES = 240;

const CONTROLS = 'button, input, select, textarea, [role="button"], [role="slider"], [tabindex="0"]';

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
    const by = Math.max(area.left - r.left, area.top - r.top, r.right - area.right, r.bottom - area.bottom);
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
    if (same >= SETTLED_FRAMES) return misfits(stage);
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
      show(engine.generateItem(template, SEED), ageModeOf(template));
      const found = await measure(template.id);
      if (SHOTS.includes(template.id)) {
        await page.screenshot({ path: `__fit__/${template.id}-${viewport}.png` });
      }
      if (found.length > 0 && !allowance) {
        failing.push(`${template.id} (${template.format}, ${template.tier}): ${found.join('; ')}`);
      } else if (found.length === 0 && allowance) {
        fitsAgain.push(template.id);
      } else if (allowance) {
        allowed += 1;
      }
    }
    console.info(
      `pier fit at ${viewport}: ${templates.length} templates, ${failing.length} do not fit, ${allowed} on the allowlist`,
    );
    expect(failing, 'templates that do not fit the workshop area').toEqual([]);
    expect(fitsAgain, 'allowlisted templates that fit: remove them from the list').toEqual([]);
  });
});
