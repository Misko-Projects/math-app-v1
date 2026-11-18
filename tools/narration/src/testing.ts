// Test helpers: a small compiled narration.json and the repository's voices.yaml.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NarrationJson } from '@number-island/shared';
import { loadVoicesConfig, type VoicesConfig } from './config';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export function repoVoices(): VoicesConfig {
  return loadVoicesConfig(join(REPO_ROOT, 'packages/content/narration/voices.yaml'));
}

/** Lines in the compiled shape (03 §8.4), covering slots, `say`, symbols, voices and clip sets. */
export function fixtureNarration(): NarrationJson {
  return {
    'fb.correct.1': { text: 'You did it!', clips: ['fb.correct.1#0'] },
    'tp.ADD.08.t1.prompt': {
      text: 'Fill the shell to make ten. How many is {a} + {b}?',
      say: 'Fill the shell to make ten. How many is {a} plus {b}?',
      clips: [
        'tp.ADD.08.t1.prompt#0',
        '$a',
        'tp.ADD.08.t1.prompt#1',
        '$b',
        'tp.ADD.08.t1.prompt#2',
      ],
    },
    'tp.ADD.08.t4.prompt': {
      text: '{a} + {b} = ?',
      clips: ['$a', 'tp.ADD.08.t4.prompt#0', '$b', 'tp.ADD.08.t4.prompt#1'],
    },
    'ls.CNT.03.w1.s2': {
      text: 'I count each one once. I stop at {n}.',
      voice: 'pip',
      clips: ['ls.CNT.03.w1.s2#0', '$n', 'ls.CNT.03.w1.s2#1'],
    },
    'num.3': { text: 'three', clips: ['num.3#0'] },
    'num.7': { text: 'seven', clips: ['num.7#0'] },
    'num.hundred': { text: 'hundred', clips: ['num.hundred#0'] },
    'num.negative': { text: 'negative', clips: ['num.negative#0'] },
    'noun.shell.many': { text: 'shells', clips: ['noun.shell.many#0'] },
  };
}
