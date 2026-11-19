// Story helpers for the two-step widgets (U04 #13: equal-share, equal-groups; kit `twoStep`):
// the widget inside a workshop's widget area, measured as the evidence rubric measures it.
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { AgeMode } from '../tokens/tokens';
import { MIN_TARGET_PX } from '../tokens/tokens';
import { areaBox, contentBox, expectHit, expectInside } from './chartArea';
import { expectControls, fillPercent, recordEvidence, settledLayout } from './evidence';

export { areaBox, inArea, namedStory } from './chartArea';

const NUMERALS = '.ni-number, .ni-pad__digit, .ni-pick__numeral, .ni-egw__tasknum';
const LABELS = '.ni-esw__note, .ni-egw__note, .ni-egw__taskword, .ni-esw__option-word';

/** Every numeral under `root` is at least 32 px; every other text a child reads 24 px (K 28). */
export async function expectReadable(root: Element, ageMode: AgeMode) {
  for (const el of root.querySelectorAll(NUMERALS)) {
    if (!/\d/.test(el.textContent ?? '')) continue;
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    await expect(size, `numeral "${el.textContent?.trim()}"`).toBeGreaterThanOrEqual(32);
  }
  const min = ageMode === 'k' ? 28 : 24;
  for (const el of root.querySelectorAll(LABELS)) {
    if ((el.textContent ?? '').trim() === '') continue;
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    await expect(size, `label "${el.textContent?.trim()}"`).toBeGreaterThanOrEqual(min);
  }
}

export interface AreaFit {
  ageMode: AgeMode;
  /** The story's name in the evidence log. */
  story: string;
  /** Everything a child touches, by what it is (each ≥ the target, ≥ 12 px from the others). */
  controls: Record<string, readonly Element[]>;
  /** The drawn parts (pictures, panels) besides the controls: inside the area, counted for fill. */
  parts?: readonly Element[];
  /** The least share of the area the content covers (06 §2; default 60 %). */
  minFill?: number;
}

/**
 * The widget fits its area as the evidence rubric asks: nothing scrolls; every part lies inside
 * the area; every control takes a real touch at its centre, is at least the age mode's target and
 * 12 px from the next; the content covers `minFill` of the area and is centred in it within 8 px
 * both ways; numerals and labels are readable. Records the measurements in `data-evidence`.
 */
export async function expectAreaFit(canvasElement: HTMLElement, fit: AreaFit) {
  const box = areaBox(canvasElement);
  await settledLayout();
  box.scrollTop = 0;
  box.scrollLeft = 0;
  await expect(box.scrollHeight, 'the area does not scroll down').toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
  await expect(box.scrollWidth, 'the area does not scroll across').toBeLessThanOrEqual(
    box.clientWidth + 1,
  );
  const inner = contentBox(box);
  const controls = Object.values(fit.controls).flat();
  const all = [...controls, ...(fit.parts ?? [])];
  for (const el of all) {
    const name = el.getAttribute('aria-label') ?? el.getAttribute('class') ?? el.tagName;
    await expectInside(el.getBoundingClientRect(), inner, `${name} in the area`);
  }
  for (const el of controls) await expectHit(el);
  await expectControls(fit.story, fit.ageMode, fit.controls);
  const pct = fillPercent(box, all);
  // fillPercent measures against the card; the rubric's bar is on its inner area.
  const rects = all.map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const fill =
    ((right - left) * (bottom - top)) / ((inner.right - inner.left) * (inner.bottom - inner.top));
  await expect(
    fill,
    `content covers ${(fill * 100).toFixed(1)} % of the area`,
  ).toBeGreaterThanOrEqual(fit.minFill ?? 0.6);
  const dx = Math.abs(left - inner.left - (inner.right - right));
  const dy = Math.abs(top - inner.top - (inner.bottom - bottom));
  await expect(dx, 'centred left to right').toBeLessThanOrEqual(8);
  await expect(dy, 'centred top to bottom').toBeLessThanOrEqual(8);
  const root = box.querySelector('.ni-widget > *');
  if (root) await expectReadable(root, fit.ageMode);
  recordEvidence(box, {
    story: fit.story,
    fill_inner_pct: Math.round(fill * 100),
    fill_card_pct: pct,
    margins_lr: `${Math.round(left - inner.left)}/${Math.round(inner.right - right)}`,
    margins_tb: `${Math.round(top - inner.top)}/${Math.round(inner.bottom - bottom)}`,
  });
}

/** What a sprite draws, on screen: its SVG content's box (not the box it is laid out in). */
function inkOf(svg: SVGSVGElement) {
  const bb = svg.getBBox();
  const m = svg.getScreenCTM() as DOMMatrix;
  const p = new DOMPoint(bb.x, bb.y).matrixTransform(m);
  const w = bb.width * Math.hypot(m.a, m.b);
  const h = bb.height * Math.hypot(m.c, m.d);
  return { left: p.x, top: p.y, right: p.x + w, bottom: p.y + h, w, h };
}

/**
 * Every countable picture under `root` can be counted: what each sprite draws is at least `min`
 * px wide and tall on screen, and no two drawings touch.
 */
export async function expectCountable(root: Element, min = 22) {
  const sprites = [...root.querySelectorAll<SVGSVGElement>('svg.ni-sprite')].filter(
    (el) => el.getBoundingClientRect().width > 0,
  );
  await expect(sprites.length, 'sprites').toBeGreaterThan(0);
  const inks = sprites.map(inkOf);
  const w = Math.min(...inks.map((i) => i.w));
  const h = Math.min(...inks.map((i) => i.h));
  await expect(w, 'the narrowest drawn sprite').toBeGreaterThanOrEqual(min);
  await expect(h, 'the shortest drawn sprite').toBeGreaterThanOrEqual(min);
  let apart = Number.POSITIVE_INFINITY;
  for (let i = 0; i < inks.length; i += 1) {
    for (let j = i + 1; j < inks.length; j += 1) {
      const a = inks[i] as (typeof inks)[number];
      const b = inks[j] as (typeof inks)[number];
      apart = Math.min(
        apart,
        Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom),
      );
    }
  }
  if (inks.length > 1) await expect(apart, 'drawn sprites apart').toBeGreaterThan(0);
  recordEvidence(root, {
    drawn: `${Math.floor(w)}x${Math.floor(h)}`,
    drawn_gap: Math.floor(apart),
  });
}

/** An element (a handle's enlarged hit area, a container) is at least the age mode's target. */
export async function expectTarget(el: Element, ageMode: AgeMode, what: string) {
  const r = el.getBoundingClientRect();
  await expect(Math.round(r.width), `${what} width`).toBeGreaterThanOrEqual(MIN_TARGET_PX[ageMode]);
  await expect(Math.round(r.height), `${what} height`).toBeGreaterThanOrEqual(
    MIN_TARGET_PX[ageMode],
  );
}

/** A real click at a point of the page (what the browser's hit test finds there). */
export async function clickAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  await expect(el, `something at ${Math.round(x)}, ${Math.round(y)}`).not.toBeNull();
  await userEvent.pointer([
    { keys: '[MouseLeft>]', target: el as Element, coords: { clientX: x, clientY: y } },
    { keys: '[/MouseLeft]', target: el as Element, coords: { clientX: x, clientY: y } },
  ]);
}

/** The four inner corners (and the centre) of an element, `inset` px in from its edges. */
export function extremes(el: Element, inset = 4) {
  const r = el.getBoundingClientRect();
  return [
    { x: r.left + inset, y: r.top + inset },
    { x: r.right - inset, y: r.top + inset },
    { x: r.left + inset, y: r.bottom - inset },
    { x: r.right - inset, y: r.bottom - inset },
    { x: r.left + r.width / 2, y: r.top + r.height / 2 },
  ];
}

/** The limit note (`role="status"`) shows `text`. */
export async function expectNote(root: HTMLElement, text: string | null) {
  const note = root.querySelector('[role="status"]') as HTMLElement;
  await waitFor(() => expect(note.textContent ?? '').toBe(text ?? ''));
}

/** Exactly one ring in the widget, on `ringed` (null: none). */
export async function expectRing(root: HTMLElement, ringed: Element | null) {
  await waitFor(() => {
    const rings = [...root.querySelectorAll('.ni-invite')];
    expect(rings).toHaveLength(ringed ? 1 : 0);
    if (ringed) expect(rings[0]).toBe(ringed);
  });
}

/** The two-step actions. */
export const stepButton = (root: HTMLElement, cue: 'next' | 'back' | 'check') =>
  root.querySelector(`.ni-steps [data-cue="${cue}"] button`) as HTMLButtonElement;

/** Goes to the ask step and waits for it. */
export async function goNext(root: HTMLElement) {
  await userEvent.click(stepButton(root, 'next'));
  await waitFor(() => expect(root).toHaveAttribute('data-step', 'ask'));
}

/** Enters `n` on whatever answer control the ask step shows (tray card, pad keys or stepper). */
export async function enterNumber(root: HTMLElement, n: number) {
  const entry = root.querySelector('.ni-entry');
  if (entry?.getAttribute('data-kind') === 'tray') {
    await userEvent.click(within(entry as HTMLElement).getByRole('button', { name: String(n) }));
    return;
  }
  if (entry) {
    for (const ch of String(n)) {
      await userEvent.click(entry.querySelector(`.ni-pad__key[data-key="${ch}"]`) as HTMLElement);
    }
    return;
  }
  const more = root.querySelector('.ni-stepper__key[data-key="more"]') as HTMLElement;
  for (let i = 0; i < n; i += 1) await userEvent.click(more);
}

/**
 * A touch drag between two points of the page, as a finger makes it: down on `el` at `from`,
 * moves in steps, up at `to`.
 */
export async function touchDragBetween(
  el: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
) {
  const pointerId = 70 + (Math.floor(from.x) % 20);
  const init = (x: number, y: number, buttons: number): PointerEventInit => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
  });
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  el.dispatchEvent(new PointerEvent('pointerdown', init(from.x, from.y, 1)));
  await frame();
  for (let k = 1; k <= steps; k += 1) {
    const x = from.x + ((to.x - from.x) * k) / steps;
    const y = from.y + ((to.y - from.y) * k) / steps;
    window.dispatchEvent(new PointerEvent('pointermove', init(x, y, 1)));
    await frame();
  }
  window.dispatchEvent(new PointerEvent('pointerup', init(to.x, to.y, 0)));
  await frame();
}
