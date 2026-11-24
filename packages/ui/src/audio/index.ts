// Audio (02 §5.5): the AudioManager, narration stitching, the Web Speech fallback, procedural SFX
// and music. apps/web wires one manager per app (narration.json and manifest loaders, unlock on the
// Profile Picker's first tap, family settings → configure).
export {
  type AudioEvent,
  type AudioListener,
  type AudioState,
  type AudioTimers,
  createAudioManager,
  DUCK_LEVEL,
  isFeedbackKey,
  loadAudioManifest,
  WebAudioManager,
  type WebAudioManagerOptions,
} from './AudioManager';
export { isKnownMusic, type KnownMusicId, MUSIC_CATALOG, MUSIC_IDS } from './music/tracks';
export { type LinePlan, type PlannedClip, planLine, planPhrases } from './narration';
export {
  type SaidHow,
  type SpokenLineRequest,
  sayLines,
  sayThrough,
  tellLines,
  whenQuiet,
} from './sayLines';
export {
  type AudioSettings,
  audioSettingsFromFamily,
  DEFAULT_AUDIO_SETTINGS,
  mergeAudioSettings,
  normalizeAudioSettings,
} from './settings';
export { isKnownSfx, type KnownSfxId, SFX_CATALOG, SFX_IDS } from './sfx/catalog';
export { expandSlot, parseSlotToken, SlotError, type SlotToken } from './slots';
export { createWebSpeech, pickVoices, type SpeechBackend, type SpeechHandle } from './speech';
