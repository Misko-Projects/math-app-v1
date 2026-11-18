// A small `narration.json` in the compiled shape (02 §5.5, 03 §8.4), for unit tests and the
// Storybook Audio Lab. The lines are real or representative content lines; the clip inventory
// (num.*, money.*, noun.*, …) mirrors packages/content/narration/numbers.yaml.
import type { AudioManifest, CompiledNarrationEntry, NarrationJson } from '@number-island/shared';

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** "twenty-three" for 0–99. */
export function numberWord(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  const t = TENS[Math.floor(n / 10)] ?? '';
  return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`;
}

const clipSet = (key: string, text: string): [string, CompiledNarrationEntry] => [
  key,
  { text, clips: [`${key}#0`] },
];

const inventory: [string, CompiledNarrationEntry][] = [
  ...Array.from({ length: 100 }, (_, n) => clipSet(`num.${n}`, numberWord(n))),
  clipSet('num.hundred', 'hundred'),
  clipSet('num.thousand', 'thousand'),
  clipSet('num.million', 'million'),
  clipSet('num.negative', 'negative'),
  clipSet('money.cent.one', 'cent'),
  clipSet('money.cent.many', 'cents'),
  clipSet('money.dollar.one', 'dollar'),
  clipSet('money.dollar.many', 'dollars'),
  clipSet('word.and', 'and'),
  clipSet('den.2.one', 'half'),
  clipSet('den.2.many', 'halves'),
  clipSet('den.4.one', 'fourth'),
  clipSet('den.4.many', 'fourths'),
  clipSet('den.10.one', 'tenth'),
  clipSet('den.10.many', 'tenths'),
  clipSet('den.100.one', 'hundredth'),
  clipSet('den.100.many', 'hundredths'),
  clipSet('time.oclock', "o'clock"),
  clipSet('time.oh', 'oh'),
  clipSet('time.am', 'a m'),
  clipSet('time.pm', 'p m'),
  clipSet('noun.plank.one', 'plank'),
  clipSet('noun.plank.many', 'planks'),
  clipSet('noun.shell.one', 'shell'),
  clipSet('noun.shell.many', 'shells'),
  clipSet('res.shelly', 'Shelly'),
];

const lines: Record<string, CompiledNarrationEntry> = {
  'p.count.how-many': { text: 'How many fish?', clips: ['p.count.how-many#0'] },
  'tp.ADD.08.t1.prompt': {
    text: 'Fill the shell to make ten. How many is {a} + {b}?',
    say: 'Fill the shell to make ten. How many is {a} plus {b}?',
    clips: ['tp.ADD.08.t1.prompt#0', '$a', 'tp.ADD.08.t1.prompt#1', '$b', 'tp.ADD.08.t1.prompt#2'],
  },
  'p.blank': { text: '?', clips: ['p.blank#0'] },
  'p.add.what-is': {
    text: '{a} + {b} = ?',
    clips: ['$a', 'p.add.what-is#0', '$b', 'p.add.what-is#1'],
  },
  'ls.CNT.03.w1.s3': {
    text: 'The last number was {n}, so there are {n}!',
    voice: 'pip',
    clips: ['ls.CNT.03.w1.s3#0', '$n', 'ls.CNT.03.w1.s3#1', '$n', 'ls.CNT.03.w1.s3#2'],
  },
  'req.dock.needs-planks': {
    text: '{who|name} needs {n} {item|noun:n} for the boat.',
    clips: [
      '$who|name',
      'req.dock.needs-planks#0',
      '$n',
      '$item|noun:n',
      'req.dock.needs-planks#1',
    ],
  },
  'p.money.pay': {
    text: 'Pay {price|dollars}.',
    clips: ['p.money.pay#0', '$price|dollars', 'p.money.pay#1'],
  },
  'game.pip.welcome': {
    text: "Welcome back! Let's build something today.",
    voice: 'pip',
    clips: ['game.pip.welcome#0'],
  },
  'fb.correct.1': { text: 'You made a ten first!', clips: ['fb.correct.1#0'] },
  'fb.retry': { text: "Let's look again together.", clips: ['fb.retry#0'] },
  'ph.look-at-the-empty-boxes': {
    text: 'Look at the empty boxes.',
    voice: 'glim',
    clips: ['ph.look-at-the-empty-boxes#0'],
  },
  'ph.how-many-are-still-empty': {
    text: 'How many are still empty?',
    voice: 'glim',
    clips: ['ph.how-many-are-still-empty#0'],
  },
  'ph.you-have': { text: 'You have', voice: 'glim', clips: ['ph.you-have#0'] },
};

export const narrationFixture: NarrationJson = { ...Object.fromEntries(inventory), ...lines };

/** Every static clip id of the fixture, with a plausible duration (seconds). */
export function fixtureClipDurations(
  narration: NarrationJson = narrationFixture,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of Object.values(narration)) {
    for (const clip of entry.clips) {
      if (clip.startsWith('$')) continue;
      out.set(
        clip,
        clip.startsWith('num.') || clip.includes('.one#') || clip.includes('.many#') ? 0.45 : 1.2,
      );
    }
  }
  return out;
}

/** A manifest that has every clip of the fixture (file = clip id + `.opus`). */
export function fixtureManifest(
  except: readonly string[] = [],
  extra: readonly string[] = [],
): AudioManifest {
  const clips: AudioManifest['clips'] = {};
  for (const [id, sec] of fixtureClipDurations()) {
    if (except.includes(id)) continue;
    clips[id] = { file: `${id}.opus`, durationMs: Math.round(sec * 1000) };
  }
  for (const id of extra) clips[id] = { file: `${id}.opus`, durationMs: 450 };
  return { version: 'fixture-1', clips };
}
