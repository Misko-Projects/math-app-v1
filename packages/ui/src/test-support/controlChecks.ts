// Story checks for the U05 widgets' controls (06 §4, 03 §6.3): every control at the age mode's
// minimum, ≥ 12 px from every other control, and exactly one invite ring, 12 px clear.
import { expect } from 'storybook/test';
import type { AgeMode } from '../tokens/tokens';
import { expectTargetGaps, expectTargetSize } from './storyHelpers';

const CONTROL = 'button, [role="button"]';

function shown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** A drop-target pad lies behind its pieces on purpose (`[data-place-target]`): not in the gaps. */
export const isPad = (el: Element) => el.hasAttribute('data-place-target');

/** Waits for every finite animation in `root` (a coin landing, a card popping in) to end. */
export async function settled(root: Element) {
  await Promise.all(
    root
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
      .map((a) => a.finished.catch(() => undefined)),
  );
}

/** The widget's visible controls. */
export function controlsOf(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CONTROL)].filter(shown);
}

/**
 * Every control is at least the age mode's minimum both ways, and every two controls (drop-target
 * pads aside, which hold pieces) are ≥ 12 px apart.
 */
export async function expectControls(root: HTMLElement, ageMode: AgeMode) {
  await settled(root);
  const all = controlsOf(root);
  for (const el of all) await expectTargetSize(el, ageMode);
  await expectTargetGaps(all.filter((el) => !isPad(el)));
}

function ringRect(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const out =
    (Number.parseFloat(cs.outlineOffset) || 0) + (Number.parseFloat(cs.outlineWidth) || 0);
  return { left: r.left - out, top: r.top - out, right: r.right + out, bottom: r.bottom + out };
}

/**
 * Exactly one invited control, with one ring, and the ring (outline offset plus width) ≥ 12 px
 * clear of every other control that does not hold it (the pad behind a piece holds it).
 */
export async function expectOneInvite(root: HTMLElement) {
  const invited = [...root.querySelectorAll<HTMLElement>('.ni-invite')];
  await expect(invited, 'invited controls').toHaveLength(1);
  const el = invited[0] as HTMLElement;
  const ring = ringRect(el);
  const box = el.getBoundingClientRect();
  for (const other of controlsOf(root)) {
    if (other === el || other.contains(el) || el.contains(other)) continue;
    const o = other.getBoundingClientRect();
    const holds =
      o.left <= box.left && o.top <= box.top && o.right >= box.right && o.bottom >= box.bottom;
    if (holds) continue;
    const gap = Math.max(
      o.left - ring.right,
      ring.left - o.right,
      o.top - ring.bottom,
      ring.top - o.bottom,
    );
    await expect(
      gap,
      `invite ring to ${other.getAttribute('aria-label') ?? other.className}`,
    ).toBeGreaterThanOrEqual(12 - 0.5);
  }
}

/** Short name of a control for the evidence summary: its first `ni-` class that says what it is. */
function kindOf(el: HTMLElement): string {
  const skip = new Set(['ni-draggable', 'ni-drop-target', 'ni-invite', 'ni-number']);
  const c = [...el.classList].find(
    (x) => x.startsWith('ni-') && !skip.has(x) && !x.startsWith('ni-tone'),
  );
  return (c ?? el.tagName.toLowerCase()).replace(/^ni-/, '');
}

/**
 * The evidence line for a story (Orchestrator audit 6): every kind of control with its smallest
 * rendered CSS size, and the smallest gap between two controls (pads holding pieces aside).
 * Logged as `CONTROLS …` and returned.
 */
export function controlSummary(root: HTMLElement, story = ''): string {
  const all = controlsOf(root);
  const kinds = new Map<string, { w: number; h: number; n: number }>();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const k = kindOf(el);
    const cur = kinds.get(k);
    kinds.set(k, {
      w: Math.min(cur?.w ?? Number.POSITIVE_INFINITY, r.width),
      h: Math.min(cur?.h ?? Number.POSITIVE_INFINITY, r.height),
      n: (cur?.n ?? 0) + 1,
    });
  }
  const els = all.filter((el) => !isPad(el));
  const rects = els.map((el) => el.getBoundingClientRect());
  let gap = Number.POSITIVE_INFINITY;
  let pair = '';
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as DOMRect;
      const b = rects[j] as DOMRect;
      const g = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
      if (g < gap) {
        gap = g;
        const name = (el: HTMLElement) =>
          el.dataset.id ?? el.getAttribute('aria-label') ?? kindOf(el);
        pair = `${name(els[i] as HTMLElement)} / ${name(els[j] as HTMLElement)}`;
      }
    }
  }
  const parts = [...kinds].map(([k, v]) => `${k} ×${v.n} ${Math.round(v.w)}×${Math.round(v.h)}`);
  const line = `${story ? `${story}: ` : ''}${parts.join('; ')}; min gap ${Number.isFinite(gap) ? `${Math.round(gap)} (${pair})` : '—'}`;
  console.info(`CONTROLS ${line}`);
  return line;
}

/** Numerals the child reads, wherever a U05 widget draws them. */
const NUMERALS = [
  '[data-numeral]',
  '.ni-bill-art text',
  '.ni-mchange__numeral',
  '.ni-pad__digit',
  '.ni-padbox > span:not(.ni-number__slot):not(.ni-number__caret)',
  '.ni-pick__numeral',
  '.ni-money__amount',
  '.ni-digital__screen',
  '.ni-ccount__running',
].join(', ');

/**
 * Every numeral is at least `min` px as RENDERED (Orchestrator audit 2): the glyph box from
 * getBoundingClientRect, and the font size it is drawn at (an SVG text's font size times the
 * SVG's on-screen scale), never the font-size attribute alone.
 */
export async function expectNumerals(root: HTMLElement, min = 32) {
  for (const el of root.querySelectorAll<Element>(NUMERALS)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    let px = Number.parseFloat(getComputedStyle(el).fontSize);
    const svg = el instanceof SVGElement ? el.ownerSVGElement : null;
    if (svg) {
      const vb = svg.viewBox.baseVal;
      const scale = vb && vb.width > 0 ? svg.getBoundingClientRect().width / vb.width : 1;
      px = Number.parseFloat(el.getAttribute('font-size') ?? `${px}`) * scale;
    }
    const what = `${el.className && typeof el.className === 'string' ? el.className : el.tagName} "${el.textContent}"`;
    await expect(px, `${what} font px`).toBeGreaterThanOrEqual(min - 0.01);
    await expect(r.height, `${what} rendered height`).toBeGreaterThanOrEqual(min - 0.5);
  }
}
