import {
  BALANCE_N_MAX,
  BALANCE_PAN_MAX,
  BALANCE_PAN_OBJECTS_MAX,
  type BalanceTerm,
  formatModel,
} from '@number-island/engine';
import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import {
  cardSize,
  MIN_ITEM_PX,
  NUMERAL_PX,
  panParts,
  panRoom,
  planBalance,
  planScale,
  TILT_PX,
} from './layout';

type Config = WidgetConfigOf<'balance'>;
type AgeMode = 'k' | 'g1-up';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
/** The compact Check as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { 'g1-up': { w: 76, h: 82 }, k: { w: 96, h: 102 } };
const AGES = ['g1-up', 'k'] as const;

const plan = (config: Config, ageMode: AgeMode, room = ROOM) =>
  planBalance({
    config,
    left: panParts(config, 'left'),
    right: panParts(config, 'right'),
    room,
    button: BUTTON[ageMode],
    ageMode,
  });

const valid = (c: Config) => formatModel('balance')?.configSchema.safeParse(c).success === true;

const objects = (a: number, b = 0): BalanceTerm[] =>
  b > 0
    ? [{ object: 'shell', count: a }, { op: '+' }, { object: 'shell', count: b }]
    : [{ object: 'shell', count: a }];
const numbers = (a: number, b?: number): BalanceTerm[] =>
  b === undefined ? [{ n: a }] : [{ n: a }, { op: '+' }, { n: b }];

/** Every way a pan of objects can hold up to the bound: one group, or two. */
function objectPans(max: number): BalanceTerm[][] {
  const pans: BalanceTerm[][] = [];
  for (let a = 1; a <= max; a += 1) {
    pans.push(objects(a));
    for (let b = 1; a + b <= max; b += 1) pans.push(objects(a, b));
  }
  return pans;
}

describe('balance in the smallest area (906 × 373)', () => {
  it('make-equal fits every pan of the domain, objects and numbers, with its buttons', () => {
    const pans = [
      ...objectPans(BALANCE_PAN_MAX),
      ...[0, 1, 9, 10, 19, BALANCE_PAN_MAX].map((n) => numbers(n)),
      numbers(9, 9),
      numbers(10, 10),
    ];
    // The widest and the tallest other pan beside each one.
    const others = [objects(1, 1), objects(10, 10), numbers(0), numbers(10, 10)];
    for (const ageMode of AGES) {
      for (const left of pans) {
        for (const right of others) {
          const c: Config = {
            format: 'balance',
            left: { terms: left },
            right: { terms: right },
            mode: 'make-equal',
            objectWeights: { shell: 1 },
            showTilt: true,
          };
          if (!valid(c)) continue;
          const p = plan(c, ageMode);
          const what = `${ageMode} ${JSON.stringify(left)} | ${JSON.stringify(right)}`;
          expect(p.fits, what).toBe(true);
          expect(p.scale.s, what).toBeGreaterThanOrEqual(MIN_ITEM_PX);
          // The two buttons of a pan are full targets, the target gap apart, under their pan.
          expect(p.scale.pan.w, what).toBeGreaterThanOrEqual(2 * MIN_TARGET_PX[ageMode] + 12);
        }
      }
    }
  });

  it('judge and which-heavier fit every pan of objects and the largest numbers, with the cards', () => {
    const pans = objectPans(BALANCE_PAN_OBJECTS_MAX);
    for (const ageMode of AGES) {
      for (const mode of ['judge', 'which-heavier'] as const) {
        for (const left of [...pans, numbers(BALANCE_N_MAX, BALANCE_N_MAX)]) {
          const c: Config = {
            format: 'balance',
            left: { terms: left },
            right: { terms: objects(10, 10) },
            mode,
            objectWeights: { shell: 1 },
            showTilt: false,
          };
          const p = plan(c, ageMode);
          const what = `${ageMode} ${mode} ${JSON.stringify(left)}`;
          expect(p.fits, what).toBe(true);
          expect(p.scale.s, what).toBeGreaterThanOrEqual(MIN_ITEM_PX);
        }
      }
    }
  });

  it('fill-blank fits the box beside every pan of objects, for every range of the answer', () => {
    for (const ageMode of AGES) {
      for (const left of objectPans(BALANCE_PAN_OBJECTS_MAX)) {
        const c: Config = {
          format: 'balance',
          left: { terms: left },
          right: { terms: [{ object: 'shell', count: 1 }, { op: '+' }, { blank: 'x' }] },
          mode: 'fill-blank',
          objectWeights: { shell: 1 },
          showTilt: false,
        };
        const p = plan(c, ageMode);
        const what = `${ageMode} ${JSON.stringify(left)}`;
        expect(p.fits, what).toBe(true);
        expect(p.scale.s, what).toBeGreaterThanOrEqual(MIN_ITEM_PX);
      }
    }
  });

  it('fill-blank fits numbers of one to three digits at Grade 1 sizes', () => {
    for (const [a, b, c2] of [
      [1, 1, 1],
      [9, 9, 3],
      [12, 9, 9],
      [99, 99, 99],
      [BALANCE_N_MAX, BALANCE_N_MAX, BALANCE_N_MAX],
    ] as const) {
      for (const boxLeft of [false, true]) {
        const withBox: BalanceTerm[] = [{ blank: 'x' }, { op: '+' }, { n: c2 }];
        const c: Config = {
          format: 'balance',
          left: { terms: boxLeft ? withBox : numbers(a, b) },
          right: { terms: boxLeft ? numbers(a, b) : withBox },
          mode: 'fill-blank',
          showTilt: false,
        };
        const p = plan(c, 'g1-up');
        expect(p.fits, `${a} + ${b} = _ + ${c2}`).toBe(true);
        expect(NUMERAL_PX * p.scale.tile).toBeGreaterThanOrEqual(32);
      }
    }
  });

  it('kindergarten sizes: the box within 20 fits (one more, one less); a typed range does not', () => {
    const within = (n: number): Config => ({
      format: 'balance',
      left: { terms: numbers(n, 1) },
      right: { terms: [{ blank: 'x' }, { op: '+' }, { n: 1 }] },
      mode: 'fill-blank',
      showTilt: false,
    });
    expect(plan(within(8), 'k').fits).toBe(true);
    // The kit's number pad at kindergarten sizes is taller than this area (a known kit limit);
    // no shipped kindergarten template asks for a typed number on the balance.
    expect(plan(within(30), 'k').fits).toBe(false);
    expect(plan(within(30), 'k', { w: 1178, h: 439 }).fits).toBe(true);
  });
});

describe('balance layout arithmetic', () => {
  it('a pan can take what it has room for, and the zone is drawn for all of it', () => {
    const c: Config = {
      format: 'balance',
      left: { terms: objects(7) },
      right: { terms: objects(5) },
      mode: 'make-equal',
      objectWeights: { shell: 1 },
      showTilt: true,
    };
    expect(panRoom(c, 'left')).toBe(BALANCE_PAN_MAX - 7);
    expect(panParts(c, 'right')).toEqual([
      { kind: 'objects', n: 5 },
      { kind: 'zone', cap: BALANCE_PAN_MAX - 5 },
    ]);
  });

  it('the picture has room for the tilt both ways, and grows with its box', () => {
    const input = {
      left: [{ kind: 'objects', n: 7 }] as const,
      right: [{ kind: 'objects', n: 2 }] as const,
      ageMode: 'k' as const,
      buttons: false,
      maxItem: 80,
    };
    const small = planScale({ ...input, w: 400, h: 200 });
    const large = planScale({ ...input, w: 900, h: 400 });
    expect(small.fits && large.fits).toBe(true);
    expect(large.s).toBeGreaterThan(small.s);
    expect(small.height).toBeGreaterThanOrEqual(small.pan.h + 2 * TILT_PX);
    // Too small a box: the smallest picture, flagged.
    expect(planScale({ ...input, w: 100, h: 60 }).fits).toBe(false);
  });

  it('a choice card is a full target with a picture', () => {
    for (const ageMode of AGES) {
      const c = cardSize(ageMode);
      expect(c.h - 6).toBeGreaterThanOrEqual(Math.max(88, MIN_TARGET_PX[ageMode]));
      expect(c.w).toBeGreaterThanOrEqual(104);
    }
  });
});
