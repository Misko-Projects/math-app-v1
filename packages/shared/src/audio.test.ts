import { describe, expect, it } from 'vitest';
import { audioManifestSchema, voiceClipId } from './audio';

describe('voiceClipId (02 §5.5)', () => {
  it("leaves the narrator's clip ids unchanged", () => {
    expect(voiceClipId('num.23#0', 'narrator')).toBe('num.23#0');
    expect(voiceClipId('num.23.end#0', 'narrator')).toBe('num.23.end#0');
  });

  it("prefixes another character's clip ids with the voice", () => {
    expect(voiceClipId('num.23#0', 'guide')).toBe('guide:num.23#0');
    expect(voiceClipId('num.7.end#0', 'glim')).toBe('glim:num.7.end#0');
  });

  it('voice-qualified ids are valid manifest clip ids', () => {
    const manifest = {
      version: 'v',
      clips: {
        'num.23#0': { file: 'a.ogg', durationMs: 400 },
        [voiceClipId('num.23#0', 'guide')]: { file: 'b.ogg', durationMs: 420 },
      },
    };
    expect(audioManifestSchema.parse(manifest)).toEqual(manifest);
  });
});
