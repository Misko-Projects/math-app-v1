// The sound effects of 05 §12, by id. Labels are English developer-facing text for the audio dev
// tool page; children never read them.

export const SFX_IDS = [
  'chime',
  'knock',
  'fuse',
  'pop',
  'horn',
  'twinkle',
  'coin',
  'page',
  'build-tap',
] as const;

export type KnownSfxId = (typeof SFX_IDS)[number];

const known: ReadonlySet<string> = new Set(SFX_IDS);

export function isKnownSfx(id: string): id is KnownSfxId {
  return known.has(id);
}

export const SFX_CATALOG: Record<KnownSfxId, { label: string; use: string }> = {
  chime: { label: 'Pebble chime', use: 'Correct answer' },
  knock: { label: 'Soft wood knock', use: 'Try again (never a buzzer)' },
  fuse: { label: 'Fuse shimmer', use: 'Pebbles or ten units fusing together' },
  pop: { label: 'Product pop', use: 'A product appears after a correct action' },
  horn: { label: 'Boat horn', use: 'The Ten-Boat or the ferry sails' },
  twinkle: { label: 'Firefly twinkle', use: 'Lantern Grove fireflies' },
  coin: { label: 'Coin clink', use: 'Market coins and the till' },
  page: { label: 'Page turn', use: 'Turning a page or panel' },
  'build-tap': { label: 'Construction tap', use: 'Building and placing pieces' },
};
