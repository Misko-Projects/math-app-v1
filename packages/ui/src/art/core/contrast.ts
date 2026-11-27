import { artColor, contrastRatio, type Lighting, type PaletteColor } from '../../tokens/tokens';

export interface ArtContrastPair {
  use: string;
  fg: PaletteColor;
  bg: PaletteColor;
  /** 4.5 for numerals and controls, 3 for icons, rings and outlines (06 §7). */
  min: 4.5 | 3;
}

/**
 * Every numeral, ring, icon and state-outline pair the art kit draws on the island, with its 06 §7
 * threshold. art.test.ts checks each by day and at sunset; the style guide shows the ratios. Add a
 * row whenever a component draws a new meaningful mark on a new background.
 */
export const ART_CONTRAST_PAIRS: readonly ArtContrastPair[] = [
  { use: 'Road stone numeral', fg: 'ink', bg: 'pebble', min: 4.5 },
  { use: 'Planned stone numeral', fg: 'ink-soft', bg: 'pebble', min: 4.5 },
  { use: 'Counting stone numeral (on its glow)', fg: 'ink', bg: 'sunshine-light', min: 4.5 },
  { use: 'Next / counting stone ring on sand', fg: 'ink', bg: 'sand', min: 3 },
  { use: 'Next / counting stone ring on grass', fg: 'ink', bg: 'leaf-light', min: 3 },
  { use: 'Next / counting stone ring on the road trail', fg: 'ink', bg: 'sand-shadow', min: 3 },
  { use: 'Flag pole, flag and sparkle outlines on grass', fg: 'ink', bg: 'leaf-light', min: 3 },
  { use: 'Flag pole, flag and sparkle outlines on sand', fg: 'ink', bg: 'sand', min: 3 },
  { use: 'Plot marker outline on sand', fg: 'ink', bg: 'sand', min: 3 },
  { use: 'Plot marker outline on grass', fg: 'ink', bg: 'leaf-light', min: 3 },
  { use: 'Plot marker plus (ink on cloud)', fg: 'ink', bg: 'cloud', min: 3 },
  { use: 'Selected plot check (cloud on ink)', fg: 'cloud', bg: 'ink', min: 3 },
];

/**
 * The contrast of a pair under a lighting (the sunset remap applies to both colours). Art is drawn
 * in the legacy art palette pinned on its root (theme.css), so the pair is measured in it.
 */
export function pairRatio(p: Pick<ArtContrastPair, 'fg' | 'bg'>, lighting: Lighting): number {
  return contrastRatio(artColor(p.fg, lighting), artColor(p.bg, lighting));
}
