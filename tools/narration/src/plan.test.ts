import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { narrationJsonSchema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { encodingOf, OPUS_TAG } from './encode';
import { clipHash, hasEndVariant, isClipSet, loadStyles, planClips } from './plan';
import { fixtureNarration, REPO_ROOT, repoVoices } from './testing';

const config = repoVoices();
const plan = (narration = fixtureNarration(), styles = new Map()) =>
  planClips({ narration, styles, config, provider: 'gemini', encoding: encodingOf('opus') });

describe('planClips', () => {
  it('plans every spoken static segment with the compiler’s clip ids', () => {
    const { jobs, silent } = plan();
    const byId = new Map(jobs.map((j) => [j.id, j]));
    expect(byId.get('tp.ADD.08.t1.prompt#0')?.text).toBe('Fill the shell to make ten. How many is');
    expect(byId.get('tp.ADD.08.t1.prompt#1')?.text).toBe('plus');
    // "?" right after a slot is punctuation: no audio, and the AudioManager skips it.
    expect(silent).toContain('tp.ADD.08.t1.prompt#2');
    expect(byId.has('tp.ADD.08.t1.prompt#2')).toBe(false);
  });

  it('speaks math symbols when a line has no `say` (03 §8.4)', () => {
    const byId = new Map(plan().jobs.map((j) => [j.id, j]));
    expect(byId.get('tp.ADD.08.t4.prompt#0')?.text).toBe('plus');
    expect(byId.get('tp.ADD.08.t4.prompt#1')?.text).toBe('equals what number');
  });

  it('adds a sentence-final `.end` clip for each number word but not the sign (03 §8.3)', () => {
    const ids = plan().jobs.map((j) => j.id);
    expect(ids).toContain('num.3.end#0');
    expect(ids).toContain('num.7.end#0');
    expect(ids).toContain('num.hundred.end#0');
    expect(ids).not.toContain('num.negative.end#0');
    expect(ids).not.toContain('noun.shell.many.end#0');
    const end = plan().jobs.find((j) => j.id === 'num.7.end#0');
    expect(end).toMatchObject({ text: 'seven.', style: 'end', styleText: config.styles.end });
    expect(hasEndVariant('num.42')).toBe(true);
    expect(hasEndVariant('num.negative')).toBe(false);
  });

  it('uses the character’s voice and the line’s style', () => {
    const styles = new Map([['fb.correct.1', 'excited' as const]]);
    const byId = new Map(plan(fixtureNarration(), styles).jobs.map((j) => [j.id, j]));
    expect(byId.get('ls.CNT.03.w1.s2#0')).toMatchObject({ voice: 'pip', voiceName: 'Puck' });
    expect(byId.get('fb.correct.1#0')).toMatchObject({
      voice: 'narrator',
      voiceName: 'Sulafat',
      style: 'excited',
      styleText: config.styles.excited,
    });
    expect(byId.get('p.count.how-many#0') ?? byId.get('ls.CNT.03.w1.s2#0')).toMatchObject({
      style: 'warm',
    });
    // Clip-set words take the brisk `clip` style so stitched numbers have no pause inside them.
    expect(byId.get('num.3#0')).toMatchObject({ style: 'clip', styleText: config.styles.clip });
    expect(byId.get('noun.shell.many#0')).toMatchObject({ style: 'clip' });
    expect(isClipSet('num.23')).toBe(true);
    expect(isClipSet('res.shelly')).toBe(true);
    expect(isClipSet('fb.correct.1')).toBe(false);
  });

  it('names files by a hash of provider, model, voice, style, text and encoding', () => {
    const job = plan().jobs.find((j) => j.id === 'num.3#0');
    const hash = clipHash({
      provider: 'gemini',
      model: config.gemini.model,
      voiceName: 'Sulafat',
      styleText: config.styles.clip,
      text: 'three',
      encoding: OPUS_TAG,
    });
    expect(job?.hash).toBe(hash);
    expect(job?.file).toBe(`${hash}.ogg`);
    const kokoro = planClips({
      narration: fixtureNarration(),
      styles: new Map(),
      config,
      provider: 'kokoro',
      encoding: encodingOf('opus'),
    }).jobs.find((j) => j.id === 'num.3#0');
    expect(kokoro?.voiceName).toBe(config.kokoro.voices.narrator);
    expect(kokoro?.hash).not.toBe(hash);
    const wav = planClips({
      narration: fixtureNarration(),
      styles: new Map(),
      config,
      provider: 'gemini',
      encoding: encodingOf('wav'),
    }).jobs.find((j) => j.id === 'num.3#0');
    expect(wav?.file).toMatch(/^[0-9a-f]{16}\.wav$/);
    expect(wav?.hash).not.toBe(hash);
  });

  it('changes only the edited line’s hashes when text changes', () => {
    const before = new Map(plan().jobs.map((j) => [j.id, j.hash]));
    const edited = fixtureNarration();
    edited['fb.correct.1'] = { text: 'You did it again!', clips: ['fb.correct.1#0'] };
    const after = new Map(plan(edited).jobs.map((j) => [j.id, j.hash]));
    const changed = [...after].filter(([id, h]) => before.get(id) !== h).map(([id]) => id);
    expect(changed).toEqual(['fb.correct.1#0']);
  });

  it('refuses a narration.json whose clip ids drift from the line', () => {
    const drifted = fixtureNarration();
    drifted['fb.correct.1'] = { text: 'You did it!', clips: ['fb.correct.1#1'] };
    expect(() => plan(drifted)).toThrow(/differ from narration.json/);
  });

  it('plans the real content build without drift', () => {
    const file = join(REPO_ROOT, 'packages/content/dist/narration.json');
    const narration = narrationJsonSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const styles = loadStyles(join(REPO_ROOT, 'packages/content/narration'));
    const { jobs, silent } = plan(narration, styles);
    const staticIds = Object.values(narration).flatMap((e) =>
      e.clips.filter((c) => !c.startsWith('$')),
    );
    const planned = new Set([...jobs.map((j) => j.id), ...silent]);
    expect(staticIds.filter((id) => !planned.has(id))).toEqual([]);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
  });
});
