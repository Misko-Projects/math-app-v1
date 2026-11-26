// K02 slice 4d (#17): the grade 2 story templates (MDA.06, MDA.19, MEA.04, MON.03) over many draws.
// - Every number is 1–99 (a dollar story tells 100 cents as "one dollar"), and the answer fits
//   its box.
// - Nothing the child reads or sees gives the answer: no story line or prompt says a number equal
//   to it, and the bar model shows "?" for it and never a number equal to it.
// - The bar model is truthful: no part of 0, a comparison's two amounts differ, and a two-step
//   model's first result is never told and never the answer (MC.first-step-only discriminates).
// - Tiers: each skill has a pictorial story that shows the bar model up front, and an abstract
//   one that shows none until a hint does.

import type { GeneratedItem, ItemTemplate, StimulusSpec } from '@number-island/shared';
import { widgetConfigSchema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { render } from '../src/content/render';
import { formatModel } from '../src/formats';
import { story } from '../src/generators/story/model';
import { twoStep } from '../src/generators/story/twostep';
import { generateItem } from '../src/items/generate';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const SEEDS = 400;
const SKILLS = /^(MDA\.06|MDA\.19|MEA\.04|MON\.03)\./;
const templates = fixture.templates.filter((t) => SKILLS.test(t.id));
const items = (t: ItemTemplate): GeneratedItem[] =>
  Array.from({ length: SEEDS }, (_, k) => generateItem(t, k + 1));

type Bar = Extract<StimulusSpec, { kind: 'bar-model' }>;
const barOf = (item: GeneratedItem): Bar | null => {
  const w = item.widget;
  const s = w.format === 'story-problem' ? w.scene : w.format === 'number-pad' ? w.stimulus : null;
  return s?.kind === 'bar-model' ? s : null;
};
const barAmounts = (b: Bar) => [
  ...b.parts,
  b.whole,
  ...(b.lower ? [...b.lower.parts, b.lower.whole] : []),
  ...(b.compare ? [b.compare.bigger, b.compare.smaller] : []),
];
/** The text the child reads: the story lines, or the number pad's prompt. */
const texts = (item: GeneratedItem): string[] => {
  const w = item.widget;
  const lines =
    w.format === 'story-problem'
      ? w.lines.map((l) => render(l.key, l.vars, fixture.narration))
      : [render(item.prompt.narration, item.prompt.vars ?? {}, fixture.narration)];
  return lines;
};

describe('grade 2 story templates (#17 slice 4d)', () => {
  it('ships 13 templates, each skill pictorial with the bar model and abstract without', () => {
    expect(templates.map((t) => t.id).sort()).toEqual([
      'MDA.06.t1',
      'MDA.06.t2',
      'MDA.06.t3',
      'MDA.19.t1',
      'MDA.19.t2',
      'MDA.19.t3',
      'MEA.04.t1',
      'MEA.04.t2',
      'MEA.04.t3',
      'MON.03.t1',
      'MON.03.t2',
      'MON.03.t3',
      'MON.03.t4',
    ]);
    for (const skill of ['MDA.06', 'MDA.19', 'MEA.04', 'MON.03']) {
      const mine = templates.filter((t) => t.skillId === skill);
      const pictorial = mine.filter((t) => t.tier === 'pictorial');
      const abstract = mine.filter((t) => t.tier === 'abstract');
      expect(abstract.length, skill).toBeGreaterThan(0);
      for (const t of pictorial)
        for (const i of items(t).slice(0, 20)) expect(barOf(i), t.id).not.toBeNull();
      for (const t of abstract)
        for (const i of items(t).slice(0, 20)) {
          expect(barOf(i), t.id).toBeNull();
          // The hint ladder still has the bar model.
          expect(
            i.hints.some((h) => h.overlay?.kind === 'bar-model'),
            t.id,
          ).toBe(true);
        }
    }
  });

  it.each(templates.map((t) => [t.id, t] as const))(
    '%s: numbers 1–99, the answer fits its box, nothing tells it',
    (id, t) => {
      for (const item of items(t)) {
        const what = `${id} seed ${item.seed}`;
        expect(widgetConfigSchema.safeParse(item.widget).success, what).toBe(true);
        const model = formatModel(item.widget.format);
        expect(model?.configSchema.safeParse(item.widget).success, what).toBe(true);
        const answer = item.answer.kind === 'number' ? item.answer.value : Number.NaN;
        expect(answer, what).toBeGreaterThanOrEqual(1);
        expect(answer, what).toBeLessThanOrEqual(99);
        const box = (item.widget as { blanks: { maxDigits: number }[] }).blanks[0]?.maxDigits ?? 0;
        expect(String(answer).length, what).toBeLessThanOrEqual(box);
        const said = texts(item).join(' ');
        const told = (said.match(/\d+/g) ?? []).map(Number);
        for (const n of told) {
          expect(n, `${what}: "${said}"`).not.toBe(answer);
          expect(n, `${what}: "${said}"`).toBeGreaterThanOrEqual(1);
          expect(n, `${what}: "${said}"`).toBeLessThanOrEqual(99);
        }
        const bar = barOf(item) ?? (item.hints.find((h) => h.overlay)?.overlay as Bar | undefined);
        if (!bar) throw new Error(`${what}: no bar model`);
        const amounts = barAmounts(bar);
        expect(amounts, what).toContain('?');
        for (const v of amounts) {
          if (typeof v !== 'number') continue;
          expect(v, what).not.toBe(answer);
          expect(v, what).toBeGreaterThanOrEqual(1);
        }
        if (bar.compare) {
          const s = story(item.params);
          // The two bars differ: a difference story tells the bigger first, and the extra piece is 1 or more.
          if (s.situation.startsWith('compare/difference')) expect(s.a, what).toBeGreaterThan(s.b);
          else expect(s.b, what).toBeGreaterThanOrEqual(1);
        }
        if (typeof item.params.ops === 'string') {
          const s = twoStep(item.params);
          expect(s.r1, what).not.toBe(s.result);
          expect(told, what).not.toContain(s.r1);
          expect(s.r1, what).toBeLessThanOrEqual(99);
        }
      }
    },
  );

  it('a dollar story tells "one dollar" and asks cents within it', () => {
    const t = templates.find((x) => x.id === 'MON.03.t2') as ItemTemplate;
    for (const item of items(t)) {
      expect(texts(item)[0]).toMatch(/one dollar/);
      expect(item.params.a).toBe(100);
      expect((item.widget as { blanks: { maxDigits: number }[] }).blanks[0]?.maxDigits).toBe(2);
    }
  });
});
