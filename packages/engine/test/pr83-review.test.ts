// Regression tests for the cross-model review of PR #83 (K01 part 6: place value and two-digit
// addition and subtraction), one block per finding, over the compiled catalog.

import type {
  GeneratedItem,
  ItemTemplate,
  LessonStep,
  ParamSpec,
  ResponseValue,
  WidgetAction,
} from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { tradeResult } from '../src/check/state/trade.result';
import { constraintHolds } from '../src/content/expr';
import { render } from '../src/content/render';
import { registry } from '../src/generators';
import { specDomain } from '../src/generators/common';
import { checkResponse } from '../src/items/check';
import {
  generateItem,
  generateItemFromParams,
  itemFeatures,
  mergedSpec,
} from '../src/items/generate';
import { itemSolution, replaySteps } from '../src/items/solution';
import { misconceptionRule } from '../src/misconceptions';
import { fixtureTemplate, loadFixture } from './fixture';

const fixture = loadFixture();
const SEEDS = 300;
const items = (t: ItemTemplate, n = SEEDS): GeneratedItem[] =>
  Array.from({ length: n }, (_, k) => generateItem(t, k + 1));

const state = (value: Record<string, unknown>): ResponseValue => ({ kind: 'state', value });
const play = (item: GeneratedItem, actions: WidgetAction[]): ResponseValue | null =>
  replaySteps(
    item,
    actions.map((action) => ({ actor: 'child', action }) as LessonStep),
  );
/** The display text of a solution step, with its vars. */
const said = (s: LessonStep): string => render(s.say ?? '', s.vars ?? {});

describe('PR #83 review (1): the CNT.20.t3 prompt says how many tens steps come first', () => {
  const t = fixtureTemplate('CNT.20.t3');

  it('every draw names its tens count, so 44, 45, 46, 47 does not also follow the prompt', () => {
    for (const item of items(t)) {
      const tens = Number(item.params.tens);
      expect(tens).toBeGreaterThan(0);
      expect(item.prompt.vars.tens).toBe(tens);
      expect(item.prompt.text).toContain(`Count on ${tens} tens, then count on by ones`);
      // The asked terms take exactly that many tens steps.
      if (item.answer.kind !== 'numbers') throw new Error('numbers');
      const start = Number(item.params.start);
      const terms = [start, ...item.answer.values];
      const steps = terms.slice(1).map((v, i) => v - (terms[i] as number));
      expect(steps.filter((d) => d === 10)).toHaveLength(tens);
      expect(steps.slice(0, tens).every((d) => d === 10)).toBe(true);
    }
  });
});

describe('PR #83 review (2): PV.13.t4 name options never give the key away', () => {
  const t = fixtureTemplate('PV.13.t4');
  const g = registry.get(t.generator);
  if (!g) throw new Error(t.generator);
  const spec = mergedSpec(t, g);
  const fixed = Object.fromEntries(
    Object.entries(spec)
      .filter(([k]) => k !== 'n')
      .map(([k, s]) => [k, specDomain(s as ParamSpec)[0]]),
  );
  /** Every accepted n of the template domain and its built item. */
  const domain = specDomain(spec.n as ParamSpec).flatMap((n) => {
    const raw = { ...fixed, n };
    const params = { ...raw, ...g.derive(raw) };
    if (!g.accepts?.(params, t)) return [];
    if (!(t.constraints ?? []).every((c) => constraintHolds(c, params))) return [];
    return [{ n: Number(n), item: generateItemFromParams(t, params) }];
  });
  const keys = new Set(domain.map((d) => d.n));
  const optionsOf = (item: GeneratedItem): number[] => {
    if (item.widget.format !== 'numeral-pick') throw new Error('not a pick');
    return item.widget.options.map((o) => Number(o.id.replace('opt-', ''))).sort((x, y) => x - y);
  };

  it('every option of every set is the key of some draw, and in the template range', () => {
    expect(domain.length).toBeGreaterThan(8);
    const keysBySet = new Map<string, Set<number>>();
    for (const { n, item } of domain) {
      const set = optionsOf(item);
      expect(set).toContain(n);
      for (const v of set) {
        expect(keys.has(v), `${v} in ${set}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(12);
        expect(v).toBeLessThanOrEqual(54);
      }
      const k = set.join(' ');
      keysBySet.set(k, (keysBySet.get(k) ?? new Set()).add(n));
    }
    expect(keysBySet.size).toBeGreaterThan(1);
    for (const [set, ks] of keysBySet) {
      expect([...ks].sort((x, y) => x - y).join(' '), set).toBe(set);
    }
  });

  it("each option's reversal is an option, so the swap and the teen reversal are offered", () => {
    for (const { item } of domain) {
      const set = optionsOf(item);
      for (const v of set) expect(set).toContain((v % 10) * 10 + Math.floor(v / 10));
    }
  });

  it('difficulty features are the same whichever member of a set is the key', () => {
    const bySet = new Map<string, string>();
    for (const { item } of domain) {
      const k = optionsOf(item).join(' ');
      const f = JSON.stringify(itemFeatures(item, t));
      expect(bySet.get(k) ?? f, k).toBe(f);
      bySet.set(k, f);
    }
  });

  it('the seeds draw every member of a set as the key', () => {
    const seen = new Set(items(t, 2000).map((i) => Number(i.params.n)));
    expect([...seen].sort((x, y) => x - y)).toEqual([...keys].sort((x, y) => x - y));
  });

  it('MC.place-swap and MC.teen-reversal predict an offered option on ≥ 20% of items', () => {
    const all = items(t, 500);
    for (const id of ['placeSwap', 'teenReversal']) {
      const rule = misconceptionRule(id);
      const hits = all.filter((i) => rule?.predict?.(i) != null).length;
      expect(hits / all.length, id).toBeGreaterThanOrEqual(0.2);
    }
  });
});

describe('PR #83 review (3): MDA.08.t1 requires the carry on the mat', () => {
  const t = fixtureTemplate('MDA.08.t1');
  const item = generateItemFromParams(t, { a: 37, b: 5, op: '+' });

  it('3 tens 12 ones with 42 typed is wrong; 4 tens 2 ones with 42 is right', () => {
    expect(checkResponse(item, state({ hundreds: 0, tens: 3, ones: 12, value: 42 })).correct).toBe(
      false,
    );
    expect(checkResponse(item, state({ hundreds: 0, tens: 4, ones: 2, value: 42 })).correct).toBe(
      true,
    );
  });

  it('combining without the trade fails; the solution (combine, then trade) passes', () => {
    const noTrade = play(item, [
      { op: 'combine', args: { column: 'ones' } },
      { op: 'answer', args: { value: 42 } },
    ]);
    expect(checkResponse(item, noTrade as ResponseValue).correct).toBe(false);
    const solved = replaySteps(item, itemSolution(item));
    expect(checkResponse(item, solved as ResponseValue).correct).toBe(true);
  });

  it('every mda.addsub trade item asks for the canonical result columns', () => {
    for (const tt of fixture.templates.filter(
      (x) => x.generator === 'mda.addsub' && x.format === 'base-ten-trade',
    )) {
      for (const it of items(tt, 100)) {
        if (it.answer.kind !== 'state') throw new Error('state');
        const r = Number(it.answer.target.result);
        expect(it.answer.target.regroupTarget).toEqual({
          hundreds: Math.floor(r / 100),
          tens: Math.floor(r / 10) % 10,
          ones: r % 10,
        });
        expect(checkResponse(it, replaySteps(it, itemSolution(it)) as ResponseValue).correct).toBe(
          true,
        );
      }
    }
  });

  it('trade.result keeps its regroup-to behaviour: no value asked, the columns only', () => {
    const target = { regroupTarget: { hundreds: 0, tens: 2, ones: 14 } };
    expect(tradeResult.check(target, { hundreds: 0, tens: 2, ones: 14 })).toBe(true);
    expect(tradeResult.check(target, { hundreds: 0, tens: 3, ones: 4 })).toBe(false);
    const asked = { ...target, value: 34 };
    expect(tradeResult.check(asked, { hundreds: 0, tens: 2, ones: 14, value: 34 })).toBe(true);
    expect(tradeResult.check(asked, { hundreds: 0, tens: 2, ones: 14, value: 43 })).toBe(false);
  });
});

describe('PR #83 review (4): PV.09.t2 makes the ten only by bundling', () => {
  const t = fixtureTemplate('PV.09.t2');
  const lesson = fixture.skills.find((s) => s.id === 'PV.09')?.lesson;
  const lessonParams = [
    ...(lesson?.worked ?? []).map((e) => e.params),
    ...(lesson?.faded ?? []).filter((e) => (e.templateId ?? t.id) === t.id).map((e) => e.params),
  ].filter((p): p is NonNullable<typeof p> => p !== undefined);

  it('the lesson examples are PV.09.t2 items', () => {
    expect(lesson?.templateId).toBe('PV.09.t2');
    expect(lessonParams.length).toBeGreaterThanOrEqual(3);
  });

  it.each([{ n: 14, from: 'ones', to: 'canonical' }, ...lessonParams])(
    'n = $n: returning ten ones and taking a rod fails; fusing passes',
    (params) => {
      const item = generateItemFromParams(t, params);
      const n = Number(params.n);
      if (item.widget.format !== 'base-ten-build') throw new Error('base-ten-build');
      // Round 2: no rods in the tray, any number of loose sticks.
      expect(item.widget.limits).toEqual({ tens: 0 });
      const swaps: WidgetAction[] = [];
      for (let k = 0; k < Math.floor(n / 10); k += 1) {
        swaps.push(
          { op: 'add-piece', args: { kind: 'ones', count: -10 } },
          { op: 'add-piece', args: { kind: 'tens', count: 1 } },
        );
      }
      const swapped = play(item, swaps);
      expect(checkResponse(item, swapped as ResponseValue).correct).toBe(false);
      // Nor one swap with the other tens fused (round 2: the tray holds no rods at all).
      if (n >= 20) {
        const partial = play(item, [
          ...swaps.slice(0, 2),
          ...Array.from({ length: Math.floor(n / 10) - 1 }, () => ({
            op: 'fuse' as const,
            args: { kind: 'ones' },
          })),
        ]);
        expect(checkResponse(item, partial as ResponseValue).correct).toBe(false);
      }
      const fused = play(
        item,
        Array.from({ length: Math.floor(n / 10) }, () => ({
          op: 'fuse',
          args: { kind: 'ones' },
        })),
      );
      expect(checkResponse(item, fused as ResponseValue).correct).toBe(true);
    },
  );

  it('round 2: a learner who puts sticks back can still finish', () => {
    const item = generateItemFromParams(t, { n: 14, from: 'ones', to: 'canonical' });
    const ones = (count: number): WidgetAction => ({
      op: 'add-piece',
      args: { kind: 'ones', count },
    });
    const fuse: WidgetAction = { op: 'fuse', args: { kind: 'ones' } };
    const rodBack: WidgetAction = { op: 'add-piece', args: { kind: 'tens', count: -1 } };
    for (const actions of [
      [ones(-1), ones(1), fuse],
      [ones(-14), ones(14), fuse],
      [fuse, rodBack, ones(10), fuse],
    ]) {
      const r = play(item, actions);
      expect(r).not.toBeNull();
      expect(checkResponse(item, r as ResponseValue).correct).toBe(true);
    }
    // The tray still never stands in for the bundle.
    const r = play(item, [ones(-10), { op: 'add-piece', args: { kind: 'tens', count: 1 } }]);
    expect(checkResponse(item, r as ResponseValue).correct).toBe(false);
  });

  it('round 3: every accepted build direction keeps limits.tight and replays its solution', () => {
    // PR #83 round 4: each trade type the sweep relies on must generate, so a regression that
    // starts rejecting one (305 is the only fuse of ten tens into a hundred) cannot be skipped.
    const required = new Set([
      '2:14:ones:canonical',
      '2:52:ones:regrouped',
      '3:305:regrouped:canonical',
      '3:340:regrouped:canonical',
    ]);
    let accepted = 0;
    for (const places of [2, 3]) {
      for (const n of [14, 26, 47, 52, 99, 120, 305, 340]) {
        for (const from of ['canonical', 'regrouped', 'ones']) {
          for (const to of ['canonical', 'regrouped', 'ones']) {
            const key = `${places}:${n}:${from}:${to}`;
            let item: GeneratedItem;
            try {
              item = generateItemFromParams(t, { n, from, to, places });
            } catch (e) {
              if (required.has(key)) throw e;
              continue;
            }
            required.delete(key);
            accepted += 1;
            expect(itemFeatures(item, t)['limits.tight']).toBe(1);
            const steps = itemSolution(item, t);
            expect(steps.some((s) => s.action?.op === 'split')).toBe(false);
            const r = replaySteps(item, steps);
            expect(checkResponse(item, r as ResponseValue).correct).toBe(true);
          }
        }
      }
    }
    expect([...required]).toEqual([]);
    expect(accepted).toBeGreaterThanOrEqual(10);
  });

  it('every pv.regroup build: no made kind in the tray, any number of the used-up kind', () => {
    for (const tt of fixture.templates.filter(
      (x) => x.generator === 'pv.regroup' && x.format === 'base-ten-build',
    )) {
      for (const it of items(tt, 100)) {
        if (it.widget.format !== 'base-ten-build') throw new Error('base-ten-build');
        const w = it.widget;
        for (const k of ['hundreds', 'tens', 'ones'] as const) {
          if (!w.pieces[k]) continue;
          const made = (w.exact?.[k] ?? 0) - (w.prebuilt?.[k] ?? 0);
          const limit = w.limits?.[k];
          if (made < 0) expect(limit).toBeUndefined();
          else expect(limit).toBe(0);
        }
        expect(itemFeatures(it, tt)['limits.tight']).toBe(1);
      }
    }
  });
});

describe('PR #83 review (5): ten hints hold for any start', () => {
  it('MDA.08.t2 says the next ten, not ten', () => {
    const t = fixtureTemplate('MDA.08.t2');
    expect(t.narration.hints).not.toContain('h.numberline.jump-to-ten');
    expect(render(t.narration.hints[0] as string)).toMatch(/next ten/);
  });

  it('no MDA, PV or CNT.19/20 template starting above ten uses a jump-to-ten hint', () => {
    const below10 = ['h.numberline.jump-to-ten', 'h.numberline.back-to-ten'];
    for (const t of fixture.templates.filter(
      (x) => /^(MDA|PV)\./.test(x.skillId) || ['CNT.19', 'CNT.20'].includes(x.skillId),
    )) {
      for (const h of below10) expect(t.narration.hints, t.id).not.toContain(h);
    }
  });
});

describe('PR #83 review (6): the MDA.08.t3 number-pad solution makes the next ten', () => {
  const t = fixtureTemplate('MDA.08.t3');

  it('37 + 5: 37 and 3 make 40, then the 2 left; 42 only in the last step', () => {
    const item = generateItemFromParams(t, { a: 37, b: 5, op: '+', strategy: 'next-ten' });
    const steps = itemSolution(item);
    expect(steps.map((s) => s.say)).toEqual([
      'gen.mda.addsub.make-next-ten',
      'gen.mda.addsub.then-add-rest',
      'gen.mda.addsub.is',
    ]);
    expect(steps[0]?.vars).toEqual({ a: 37, gap: 3, ten: 40 });
    expect(steps[1]?.vars).toEqual({ ten: 40, rest: 2 });
    for (const s of steps.slice(0, -1)) {
      expect(Object.values(s.vars ?? {})).not.toContain(42);
      expect(said(s)).not.toMatch(/\b42\b/);
    }
    expect(checkResponse(item, replaySteps(item, steps) as ResponseValue).correct).toBe(true);
  });

  it('37 + 3 lands exactly on 40: no step before the last names it', () => {
    const item = generateItemFromParams(t, { a: 37, b: 3, op: '+', strategy: 'next-ten' });
    const steps = itemSolution(item);
    expect(steps.map((s) => s.say)).toEqual(['gen.mda.addsub.fills-next-ten', 'gen.mda.addsub.is']);
    for (const s of steps.slice(0, -1)) {
      expect(Object.values(s.vars ?? {})).not.toContain(40);
      expect(said(s)).not.toMatch(/\b40\b/);
    }
    expect(checkResponse(item, replaySteps(item, steps) as ResponseValue).correct).toBe(true);
  });

  it('every draw follows the next-ten strategy and holds back the answer', () => {
    for (const item of items(t)) {
      const steps = itemSolution(item);
      expect(steps[0]?.say).toMatch(/make-next-ten|fills-next-ten/);
      const v = Number(item.params.result);
      for (const s of steps.slice(0, -1)) {
        expect(Object.values(s.vars ?? {})).not.toContain(v);
        expect(said(s)).not.toMatch(new RegExp(`\\b${v}\\b`));
      }
    }
  });
});

describe('PR #83 review (7): the hundred-chart solution slides once per move', () => {
  const charts = fixture.templates.filter(
    (x) => x.generator === 'mda.addsub' && x.format === 'hundred-chart',
  );

  it('34 + 3 slides right three times', () => {
    const item = generateItemFromParams(fixtureTemplate('MDA.01.t2'), { a: 34, b: 3, op: '+' });
    const slides = itemSolution(item)
      .filter((s) => s.action?.op === 'slide')
      .map((s) => s.action?.args?.dir);
    expect(slides).toEqual(['right', 'right', 'right']);
  });

  it.each(charts.map((x) => x.id))('%s: the slide directions are widget.moves', (id) => {
    const t = fixtureTemplate(id);
    for (const item of items(t, 100)) {
      if (item.widget.format !== 'hundred-chart') throw new Error('hundred-chart');
      const slides = itemSolution(item)
        .filter((s) => s.action?.op === 'slide')
        .map((s) => s.action?.args?.dir);
      expect(slides).toEqual(item.widget.moves);
    }
  });
});

describe('PR #83 review (8): MC.forgot-the-ten on MDA.08 reads the mat too', () => {
  const t = fixtureTemplate('MDA.08.t1');
  const item = generateItemFromParams(t, { a: 37, b: 5, op: '+' });
  const rule = misconceptionRule('forgotTheTen');

  it('an untouched mat (3 tens 7 ones) with 32 typed is not tagged', () => {
    const r = state({ hundreds: 0, tens: 3, ones: 7, value: 32 });
    expect(rule?.match?.(item, r)).toBe(false);
    expect(checkResponse(item, r).misconceptionIds).not.toContain('MC.forgot-the-ten');
  });

  it('the combined mat (4 tens 2 ones) with 32 typed is tagged, and is the prediction', () => {
    const r = state({ hundreds: 0, tens: 4, ones: 2, value: 32 });
    expect(rule?.match?.(item, r)).toBe(true);
    expect(checkResponse(item, r).misconceptionIds).toContain('MC.forgot-the-ten');
    expect(rule?.predict?.(item)).toEqual(r);
  });

  it('the prediction is tagged on every MDA.08.t1 draw, and discriminates on ≥ 20%', () => {
    const all = items(t);
    let hits = 0;
    for (const it of all) {
      const p = rule?.predict?.(it);
      if (!p) continue;
      hits += 1;
      expect(rule?.match?.(it, p)).toBe(true);
      expect(checkResponse(it, p).correct).toBe(false);
    }
    expect(hits / all.length).toBeGreaterThanOrEqual(0.2);
  });
});
