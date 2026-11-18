// Narration data for the Storybook Audio Lab: the test fixture, plus the full ordinal and
// denominator clip sets and one line per typed slot for the number composer.
import type { AudioManifest, CompiledNarrationEntry, NarrationJson } from '@number-island/shared';
import { fixtureClipDurations, narrationFixture, numberWord } from '../testing/narrationFixture';

const ORDINAL_ONES = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
];

function ordinalWord(n: number): string {
  if (n < 20) return ORDINAL_ONES[n] ?? String(n);
  if (n % 10 === 0) return `${numberWord(n).replace(/y$/, 'ie')}th`;
  return `${numberWord(n - (n % 10))}-${ORDINAL_ONES[n % 10]}`;
}

const DENOMINATORS: [number, string, string][] = [
  [1, 'whole', 'wholes'],
  [2, 'half', 'halves'],
  ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((b): [number, string, string] => [
    b,
    ordinalWord(b),
    `${ordinalWord(b)}s`,
  ]),
  [100, 'hundredth', 'hundredths'],
];

const entry = (key: string, text: string): [string, CompiledNarrationEntry] => [
  key,
  { text, clips: [`${key}#0`] },
];

/** Composer slot types, each with a one-slot line `lab.compose.<id>` ("{v|type}."). */
export const COMPOSER_TYPES = [
  { id: 'num', token: '$v', label: 'Number', example: '12345' },
  { id: 'digits', token: '$v|digits', label: 'Digits', example: '345' },
  { id: 'ord', token: '$v|ord', label: 'Ordinal (1–31)', example: '21' },
  { id: 'cents', token: '$v|cents', label: 'Cents', example: '25' },
  { id: 'dollars', token: '$v|dollars', label: 'Dollars (in cents)', example: '125' },
  { id: 'time', token: '$v|time', label: 'Time (h:mm)', example: '7:05' },
  { id: 'frac', token: '$v|frac', label: 'Fraction (a/b)', example: '3/4' },
  { id: 'dec1', token: '$v|dec:1', label: 'Tenths (in 100ths)', example: '30' },
  { id: 'dec2', token: '$v|dec:2', label: 'Hundredths', example: '250' },
] as const;

export type ComposerTypeId = (typeof COMPOSER_TYPES)[number]['id'];

const composerLines = Object.fromEntries(
  COMPOSER_TYPES.map(({ id, token }): [string, CompiledNarrationEntry] => [
    `lab.compose.${id}`,
    { text: `{${token.slice(1)}}.`, clips: [token, `lab.compose.${id}#0`] },
  ]),
);

export const labNarration: NarrationJson = {
  ...narrationFixture,
  ...Object.fromEntries(
    Array.from({ length: 31 }, (_, i) => entry(`ord.${i + 1}`, ordinalWord(i + 1))),
  ),
  ...Object.fromEntries(
    DENOMINATORS.flatMap(([b, one, many]) => [
      entry(`den.${b}.one`, one),
      entry(`den.${b}.many`, many),
    ]),
  ),
  ...composerLines,
};

/** Sample lines the lab can play (key + vars, or an AI line). */
export const SAMPLE_LINES = [
  { id: 'prompt', label: 'Prompt with numbers', key: 'tp.ADD.08.t1.prompt', vars: { a: 7, b: 3 } },
  { id: 'pip', label: 'Pip, lesson step', key: 'ls.CNT.03.w1.s3', vars: { n: 12 } },
  {
    id: 'request',
    label: 'Resident request',
    key: 'req.dock.needs-planks',
    vars: { who: 'shelly', n: 4, item: 'plank' },
  },
  { id: 'money', label: 'Money', key: 'p.money.pay', vars: { price: 125 } },
  { id: 'symbols', label: 'Symbols, no `say`', key: 'p.add.what-is', vars: { a: 3, b: 4 } },
  { id: 'welcome', label: 'Pip welcome', key: 'game.pip.welcome', vars: {} },
] as const;

/**
 * A manifest covering every static clip of the lab narration, plus the sentence-final `.end`
 * variant of every number clip, served as demo tones (see demoClips.ts).
 */
export function labManifest(): AudioManifest {
  const clips: AudioManifest['clips'] = {};
  const durations = fixtureClipDurations(labNarration);
  for (const [id, sec] of durations) {
    const short = id.startsWith('lab.compose.') ? 0.18 : sec;
    clips[id] = { file: `${id}.wav`, durationMs: Math.round(short * 1000) };
    const m = /^(num\.[^#]+)#0$/.exec(id);
    if (m) clips[`${m[1]}.end#0`] = { file: `${m[1]}.end.wav`, durationMs: 600 };
  }
  return { version: 'audio-lab-demo', clips };
}
