// Story checks for the clock face (U05 #14): every number is drawn the same, nothing
// semi-transparent lies over a number at rest, and the hands leave the numbers readable.
import { expect } from 'storybook/test';

/** The effective opacity of an element: its own and every ancestor's, multiplied. */
function effectiveOpacity(el: Element): number {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    o *= Number.parseFloat(cs.opacity || '1');
  }
  const cs = getComputedStyle(el);
  const fill = cs.fill === 'none' ? 1 : Number.parseFloat(cs.fillOpacity || '1');
  const stroke = cs.stroke === 'none' ? 1 : Number.parseFloat(cs.strokeOpacity || '1');
  return o * Math.min(fill, stroke);
}

/** Sample points across an element's box (an n × n grid inside it). */
function samples(r: DOMRect, n = 7): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out.push({ x: r.left + ((i + 0.5) * r.width) / n, y: r.top + ((j + 0.5) * r.height) / n });
    }
  }
  return out;
}

/**
 * All twelve numbers share one fill and full opacity (ink on the paper face, ≥ 4.5:1), and wherever
 * a number is hit, nothing drawn above it is semi-transparent.
 */
export async function expectNumeralsSolid(face: SVGSVGElement) {
  const nums = [...face.querySelectorAll<SVGTextElement>('[data-numeral]')];
  await expect(nums).toHaveLength(12);
  const fills = new Set(nums.map((n) => getComputedStyle(n).fill));
  await expect([...fills], 'one fill for every number').toHaveLength(1);
  // --color-ink #264653.
  await expect([...fills][0]).toBe('rgb(38, 70, 83)');
  for (const n of nums) {
    await expect(effectiveOpacity(n), `number ${n.textContent} opacity`).toBe(1);
    for (const p of samples(n.getBoundingClientRect())) {
      const stack = document.elementsFromPoint(p.x, p.y);
      const at = stack.indexOf(n);
      if (at < 0) continue;
      for (const above of stack.slice(0, at)) {
        if (!face.contains(above)) continue;
        await expect(
          effectiveOpacity(above),
          `${above.tagName}.${above.getAttribute('class') ?? ''} over number ${n.textContent}`,
        ).toBe(1);
      }
    }
  }
}

/**
 * The share of each number's box the clock's hands cover (sampled), never more than `max`: the
 * number a hand points at stays readable, as on a real clock.
 */
export async function expectHandsLeaveNumerals(face: SVGSVGElement, max = 0.2) {
  for (const n of face.querySelectorAll<SVGTextElement>('[data-numeral]')) {
    const pts = samples(n.getBoundingClientRect(), 9);
    const covered = pts.filter((p) =>
      document.elementFromPoint(p.x, p.y)?.closest('.ni-clock__hand'),
    ).length;
    await expect(covered / pts.length, `hands over number ${n.textContent}`).toBeLessThanOrEqual(
      max,
    );
  }
}
