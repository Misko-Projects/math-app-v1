// time.sequence (03 §5.6): put daily events in order, and sort them by the part of the day.
// Formats: order, shape-sort.
//
// - order (TIM.08): `events` pictures of daily events from DAY_EVENTS (wake up, breakfast, lunch,
//   dinner, bedtime), one picture each and no numeral; the child puts them in order from first to
//   last. Each item's value is the event's place in the day, so the answer is the values in slot
//   order. `adjacent` draws events that follow each other in the day (breakfast, lunch, dinner:
//   no gap to lean on); otherwise the events skip at least one. `fixed` pre-places one event on its
//   slot (a day strip with an anchor, the timeline representation).
// - shape-sort `sort` (TIM.08): `events` event cards to sort into morning and night bins (a card's
//   target props are `{ part }`; `sort.byRule`). Morning: wake up, breakfast, sunrise; night:
//   bedtime, stars, pajamas. `split: ampm` (TIM.05) sorts into a.m. and p.m. bins instead: a.m.
//   wake up, breakfast, sunrise; p.m. dinner, bedtime (each always in that half of the day;
//   lunch can be before or after noon, and stars and pajamas can be either, so they are left
//   out). At most five cards (PR #132 review).
// Which events an item shows is layout randomness: the features depend on the counts only.

import type { LessonStep, ResponseValue, SortRule } from '@number-island/shared';
import { ruleMatches } from '../../check/state/sort.byRule';
import {
  asNum,
  correctFromAnswer,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

/** Daily events in the order they happen; an event's place in the day is its index + 1. */
export const DAY_EVENTS = ['wake-up', 'breakfast', 'lunch', 'dinner', 'bedtime'] as const;
/** Events that clearly belong to the morning or to the night (shape-sort). */
export const MORNING_EVENTS = ['wake-up', 'breakfast', 'sunrise'] as const;
export const NIGHT_EVENTS = ['bedtime', 'stars', 'pajamas'] as const;
/** Events always in one half of the day (shape-sort `split: ampm`, TIM.05). */
export const AM_EVENTS = ['wake-up', 'breakfast', 'sunrise'] as const;
export const PM_EVENTS = ['dinner', 'bedtime'] as const;
const SPLITS = ['day', 'ampm'];

/** The art-kit picture of a daily event. */
export const eventSprite = (event: string): string => `event-${event}`;

const say = (key: string, action?: LessonStep['action']): LessonStep =>
  action ? { actor: 'demo', say: key, vars: {}, action } : { actor: 'demo', say: key, vars: {} };

/** Whether the places (sorted) follow each other with no gap. */
const consecutive = (ranks: readonly number[]): boolean =>
  ranks.every((r, i) => i === 0 || r === (ranks[i - 1] as number) + 1);

export const timeSequence: GeneratorDef = {
  id: 'time.sequence',
  formats: ['order', 'shape-sort'],
  params: {
    events: {
      type: 'int',
      // Templates always set it; the default lets either format build from defaults.
      default: { kind: 'int', min: 3, max: 5 },
      doc: 'order: events to put in order (2–5); shape-sort: event cards to sort (4–6)',
    },
    adjacent: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'order: the events follow each other in the day (otherwise at least one is skipped)',
    },
    fixed: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'order: one event is already on its place on the day strip (timeline)',
    },
    split: {
      type: 'string',
      values: SPLITS,
      default: { kind: 'const', value: 'day' },
      doc: 'shape-sort: morning and night bins (day, TIM.08) or a.m. and p.m. bins (ampm, TIM.05)',
    },
  },
  features: {
    'events.over3': { weight: 0.3, doc: 'order: events − 3' },
    adjacent: { weight: 0.35, doc: 'order: the events follow each other, with no gap between' },
    anchor: { weight: -0.2, doc: 'order: one event is already placed' },
    cards: { weight: 0.1, doc: 'shape-sort format feature (03 §5.5): card count − 4' },
  },
  narration: [
    'gen.time.sequence.think',
    'gen.time.sequence.first',
    'gen.time.sequence.then',
    'gen.time.sequence.sort-look',
    'gen.time.sequence.sort-morning',
    'gen.time.sequence.sort-night',
    'gen.time.sequence.sort-look-ampm',
    'gen.time.sequence.sort-am',
    'gen.time.sequence.sort-pm',
    // its order retry line (items/check.ts retryFeedback)
    'fb.order.retry-day',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive: () => ({}),
  accepts(p, t) {
    const n = asNum(p.events);
    if (t.format === 'shape-sort')
      return (
        n >= 4 &&
        n <= (p.split === 'ampm' ? AM_EVENTS.length + PM_EVENTS.length : 6) &&
        p.adjacent !== true &&
        p.fixed !== true
      );
    if (p.split === 'ampm') return false;
    if (n < 2 || n > DAY_EVENTS.length) return false;
    // All five events always follow each other, and an anchor needs two more to place.
    if (p.adjacent !== true && n === DAY_EVENTS.length) return false;
    return p.fixed !== true || n >= 3;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const n = asNum(params.events);
    const seed = layoutSeed(rng);
    let p: PartialOutput;
    if (t.format === 'shape-sort') {
      const draw = rng.fork('cards');
      const ampm = params.split === 'ampm';
      const [first, second] = ampm ? [AM_EVENTS, PM_EVENTS] : [MORNING_EVENTS, NIGHT_EVENTS];
      const [p0, p1] = ampm ? ['am', 'pm'] : ['morning', 'night'];
      const morning = draw.int(Math.max(1, n - second.length), Math.min(first.length, n - 1));
      const picked = [
        ...draw
          .shuffle(first)
          .slice(0, morning)
          .map((e) => ({ event: e, part: p0 })),
        ...draw
          .shuffle(second)
          .slice(0, n - morning)
          .map((e) => ({ event: e, part: p1 })),
      ];
      const shown = rng.fork('layout').shuffle(picked);
      const bins: { id: string; label: string; rule: SortRule }[] = [
        { id: 'b0', label: `word.${p0}`, rule: { prop: 'part', op: '==', value: p0 } },
        { id: 'b1', label: `word.${p1}`, rule: { prop: 'part', op: '==', value: p1 } },
      ];
      p = {
        params,
        vars: pickVars(t, {}),
        math: { cards: Math.max(0, n - 4) },
        widget: {
          format: 'shape-sort',
          cards: shown.map((c, i) => ({
            id: `c${i}`,
            // No isPm: the card would carry its own bin (PR #84 review); the event names the picture.
            card: { kind: 'event', event: c.event },
          })),
          bins,
          mode: 'sort',
        },
        answer: {
          kind: 'state',
          checker: 'sort.byRule',
          target: {
            cards: shown.map((c, i) => ({ id: `c${i}`, props: { part: c.part } })),
            bins: bins.map((b) => ({ id: b.id, rule: b.rule })),
          },
        },
      };
      return finish(timeSequence, ctx, p);
    }
    const draw = rng.fork('events');
    const all = DAY_EVENTS.map((_, i) => i + 1);
    let ranks: number[];
    if (params.adjacent === true) {
      const start = draw.int(1, DAY_EVENTS.length - n + 1);
      ranks = Array.from({ length: n }, (_, i) => start + i);
    } else {
      do {
        ranks = draw
          .shuffle(all)
          .slice(0, n)
          .sort((a, b) => a - b);
      } while (consecutive(ranks));
    }
    const shown = rng.fork('layout').shuffle(ranks);
    const items = shown.map((r, i) => ({
      id: `obj-${i}`,
      value: r,
      stimulus: {
        kind: 'objects' as const,
        set: {
          count: 1,
          sprite: eventSprite(DAY_EVENTS[r - 1] as string),
          layout: 'line' as const,
          layoutSeed: seed,
        },
      },
    }));
    const fixed: Record<number, string> = {};
    if (params.fixed === true) {
      const anchor = rng.fork('anchor').pick(items);
      fixed[ranks.indexOf(anchor.value)] = anchor.id;
    }
    p = {
      params,
      vars: pickVars(t, {}),
      math: {
        'events.over3': Math.max(0, n - 3),
        adjacent: params.adjacent === true ? 1 : 0,
        anchor: params.fixed === true ? 1 : 0,
        // The order model's own features: events.over3 counts the items, places 1–5 are never
        // close, and no numeral shows.
        items: 0,
        closeness: 0,
        magnitude: 0,
      },
      widget: {
        format: 'order',
        items,
        direction: 'asc',
        ...(params.fixed === true ? { fixed } : {}),
      },
      answer: { kind: 'numbers', values: ranks, ordered: true },
    };
    return finish(timeSequence, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    if (out.answer.kind !== 'state') return correctFromAnswer(out.answer);
    return { kind: 'state', value: { bins: sortPlacement(out) } };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    if (w.format === 'shape-sort') {
      const ampm = w.bins?.[0]?.label === 'word.am';
      const steps: LessonStep[] = [
        say(ampm ? 'gen.time.sequence.sort-look-ampm' : 'gen.time.sequence.sort-look'),
      ];
      const lines = ampm ? ['sort-am', 'sort-pm'] : ['sort-morning', 'sort-night'];
      for (const [bin, ids] of Object.entries(sortPlacement(out))) {
        for (const id of ids) {
          steps.push(
            say(`gen.time.sequence.${bin === 'b0' ? lines[0] : lines[1]}`, {
              op: 'drag-card',
              args: { id, bin },
            }),
          );
        }
      }
      return steps;
    }
    if (w.format !== 'order' || out.answer.kind !== 'numbers') return [];
    const fixedSlots = new Set(Object.keys(w.fixed ?? {}).map(Number));
    // The first step places nothing: the worked-step hint (level 4) plays it.
    const steps: LessonStep[] = [say('gen.time.sequence.think')];
    out.answer.values.forEach((v, slot) => {
      if (fixedSlots.has(slot)) return;
      const id = w.items.find((x) => x.value === v)?.id ?? 'obj-0';
      steps.push(
        say(slot === 0 ? 'gen.time.sequence.first' : 'gen.time.sequence.then', {
          op: 'drag',
          args: { id, slot },
        }),
      );
    });
    return steps;
  },
};

/** The example placement of a sort item: each card in the bin whose rule it matches. */
function sortPlacement(out: GeneratorOutput): Record<string, string[]> {
  const a = out.answer;
  if (a.kind !== 'state') return {};
  const cards = a.target.cards as { id: string; props: Record<string, string> }[];
  const bins = a.target.bins as { id: string; rule: SortRule }[];
  const placement: Record<string, string[]> = Object.fromEntries(
    bins.map((b) => [b.id, [] as string[]]),
  );
  for (const card of cards) {
    const bin = bins.find((b) => ruleMatches(b.rule, card.props));
    if (bin) placement[bin.id]?.push(card.id);
  }
  return placement;
}
