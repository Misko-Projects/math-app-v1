// The audio slice of the family settings (02 §5.8 `FamilySettings`: `music`, `volumes`,
// `voiceRate`). The settings document itself, its schema and defaults live in packages/shared; this
// module only maps it onto the AudioManager and clamps what a stale or hand-edited document holds.
import { type FamilySettings, withSettingDefaults } from '@number-island/shared';

export interface AudioSettings {
  /** 0..1 per bus. */
  volumes: { voice: number; sfx: number; music: number };
  /** 0.8..1.2; scales Web Speech rate and clip playbackRate alike. */
  voiceRate: number;
  /** FamilySettings.music: when false no music plays (a requested track resumes when re-enabled). */
  musicEnabled: boolean;
}

export const VOICE_RATE_MIN = 0.8;
export const VOICE_RATE_MAX = 1.2;
/** Used only to repair a non-finite stored volume. */
const DEFAULT_VOLUMES = { voice: 1, sfx: 0.8, music: 0.5 };

export function audioSettingsFromFamily(
  s: Pick<FamilySettings, 'music' | 'volumes' | 'voiceRate'>,
): AudioSettings {
  return normalizeAudioSettings({
    volumes: s.volumes,
    voiceRate: s.voiceRate,
    musicEnabled: s.music,
  });
}

/** Family defaults (02 §5.9 F4): voice 1, sfx 0.8, music 0.5, rate 1, music on. */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = audioSettingsFromFamily(
  withSettingDefaults({ kind: 'family' }),
);

export function normalizeAudioSettings(s: AudioSettings): AudioSettings {
  return {
    volumes: {
      voice: unit(s.volumes.voice, DEFAULT_VOLUMES.voice),
      sfx: unit(s.volumes.sfx, DEFAULT_VOLUMES.sfx),
      music: unit(s.volumes.music, DEFAULT_VOLUMES.music),
    },
    voiceRate: Number.isFinite(s.voiceRate)
      ? Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, s.voiceRate))
      : 1,
    musicEnabled: s.musicEnabled,
  };
}

/** Merges a partial update into current settings, then normalizes. */
export function mergeAudioSettings(
  current: AudioSettings,
  patch: Partial<Omit<AudioSettings, 'volumes'>> & { volumes?: Partial<AudioSettings['volumes']> },
): AudioSettings {
  return normalizeAudioSettings({
    volumes: { ...current.volumes, ...patch.volumes },
    voiceRate: patch.voiceRate ?? current.voiceRate,
    musicEnabled: patch.musicEnabled ?? current.musicEnabled,
  });
}

function unit(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}
