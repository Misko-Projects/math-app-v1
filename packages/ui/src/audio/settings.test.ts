import { withSettingDefaults } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  audioSettingsFromFamily,
  DEFAULT_AUDIO_SETTINGS,
  mergeAudioSettings,
  normalizeAudioSettings,
} from './settings';

describe('audio settings (FamilySettings slice)', () => {
  it('defaults follow the family defaults (02 §5.9 F4)', () => {
    expect(DEFAULT_AUDIO_SETTINGS).toEqual({
      volumes: { voice: 1, sfx: 0.8, music: 0.5 },
      voiceRate: 1,
      musicEnabled: true,
    });
  });

  it('maps a family settings document', () => {
    const family = withSettingDefaults({
      kind: 'family',
      value: { music: false, volumes: { music: 0.2 }, voiceRate: 0.9 },
    });
    expect(audioSettingsFromFamily(family)).toEqual({
      volumes: { voice: 1, sfx: 0.8, music: 0.2 },
      voiceRate: 0.9,
      musicEnabled: false,
    });
  });

  it('clamps out-of-range and repairs non-finite values', () => {
    expect(
      normalizeAudioSettings({
        volumes: { voice: 2, sfx: -1, music: Number.NaN },
        voiceRate: 5,
        musicEnabled: true,
      }),
    ).toEqual({ volumes: { voice: 1, sfx: 0, music: 0.5 }, voiceRate: 1.2, musicEnabled: true });
    expect(mergeAudioSettings(DEFAULT_AUDIO_SETTINGS, { voiceRate: 0.1 }).voiceRate).toBe(0.8);
  });

  it('merges partial volume updates', () => {
    expect(mergeAudioSettings(DEFAULT_AUDIO_SETTINGS, { volumes: { sfx: 0.3 } }).volumes).toEqual({
      voice: 1,
      sfx: 0.3,
      music: 0.5,
    });
  });
});
