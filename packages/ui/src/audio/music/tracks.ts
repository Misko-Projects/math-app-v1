/*
 * Procedural music tracks (05 §12). Design note: the track recipes.
 *
 * Every track is original and written here as data: a tempo, a major key, an 8-bar chord
 * progression (one chord per bar) and a few instrument parts on a 16th-note grid. Melodies use
 * major-scale degrees (mostly the pentatonic ones); accompaniment parts name chord tones of the
 * current bar, so every pitch is in key and nothing clashes. Melodies are sparse (long notes and
 * whole empty bars) so a loop can run for 15 minutes under narration without fatigue.
 *
 * Variation: each track has three melody variants (A, B and a tacet pass with accompaniment only).
 * Pass 0 always plays A; later passes pick a variant from a seeded PRNG keyed by the pass number.
 * The accompaniment is identical every pass, and the chords always restart at bar 1, so every pass
 * joins the next one seamlessly. The tested invariant: two passes with the same variant produce
 * identical events (shifted by whole loops).
 *
 * Mixing: a track sums into its own bus with a soft dotted-eighth echo on melodic parts, a gentle
 * 7 kHz lowpass, and a level chosen so the whole track peaks below ~0.35 (it sits under the voice).
 *
 * - island (hub): F major, 88 bpm, light swing. Marimba melody, offbeat ukulele-like pluck, soft
 *   triangle pad, round sine bass on beats 1 and 3, a barely-there offbeat shaker.
 *   I – iii – IV – I – vi – IV – ii – V.
 * - festival: G major, 100 bpm. Soft FM bell melody, bouncy pluck, root–fifth–octave bass, a pad,
 *   woodblock on beats 2 and 4, light shaker. I – IV – V – I – vi – IV – ii – V.
 * - sunset (wind-down): D major, 66 bpm, 3/4. Music-box melody over a slow warm pad, a gentle harp
 *   pluck and one bass note per bar. I – vi – IV – I – ii – V – IV – I.
 * - workshop.shore (Road Crew, Lantern Grove, Treasure Beach, Practice Pier): C major, 92 bpm.
 *   Light and curious: a 3-3-2 pluck arpeggio, questioning marimba phrases that rise, a soft pad.
 *   I – iii – vi – IV – I – iii – ii – V.
 * - workshop.harbor (Ten-Boat Dock, Brick Factory, Builder's Yard): B♭ major, 96 bpm. Steady and
 *   busy: an 8th-note marimba ostinato, woodblock and log-drum percussion, plucked melody.
 *   I – IV – I – V – vi – IV – ii – V.
 * - workshop.garden (Garden Terraces, Bakery, Rhythm Orchard): A major, 104 bpm, light swing.
 *   Sunny and plucky: offbeat ukulele chord chops, a marimba tune, walking root–fifth bass, shaker.
 *   I – IV – I – V – IV – I – ii – V.
 * - workshop.town (Market, Clock Tower & Ferry, Weigh Station, Puzzle Tower): E♭ major, 90 bpm.
 *   Tick-tock: high and low woodblocks alternate on every beat, staccato pluck melody, a bell
 *   chime every four bars, short bass notes. I – vi – ii – V – I – vi – IV – V.
 *
 * Pattern notation (one string per bar, tokens separated by spaces, each token `grid` 16ths long):
 * - melody: scale degree 1–7 of the key, `'` raises an octave and `,` lowers one (repeatable);
 * - chord: chord-tone index of the bar's chord (0 root, 1 third, 2 fifth, 3 root an octave up, …),
 *   `,` lowers an octave;
 * - pad: `x` plays the whole chord;
 * - perc: `x` full hit, `o` soft hit, at the part's fixed pitch;
 * - everywhere: `-` holds the previous note, `.` is a rest.
 */

export const MUSIC_IDS = [
  'island',
  'festival',
  'sunset',
  'workshop.shore',
  'workshop.harbor',
  'workshop.garden',
  'workshop.town',
] as const;

export type KnownMusicId = (typeof MUSIC_IDS)[number];

const known: ReadonlySet<string> = new Set(MUSIC_IDS);

export function isKnownMusic(id: string): id is KnownMusicId {
  return known.has(id);
}

export const MUSIC_CATALOG: Record<KnownMusicId, { label: string; use: string }> = {
  island: { label: 'Island loop', use: 'The island hub' },
  festival: { label: 'Festival theme', use: 'Festivals and celebrations' },
  sunset: { label: 'Sunset theme', use: 'Winding down at the end of a session' },
  'workshop.shore': {
    label: 'Shore workshops',
    use: 'Road Crew, Lantern Grove, Treasure Beach, Practice Pier',
  },
  'workshop.harbor': {
    label: 'Harbor workshops',
    use: "Ten-Boat Dock, Brick Factory, Builder's Yard",
  },
  'workshop.garden': {
    label: 'Garden workshops',
    use: 'Garden Terraces, Bakery, Rhythm Orchard',
  },
  'workshop.town': {
    label: 'Town workshops',
    use: 'Market, Clock Tower & Ferry, Weigh Station, Puzzle Tower',
  },
};

export type InstrumentId =
  | 'marimba'
  | 'pluck'
  | 'pad'
  | 'bass'
  | 'bell'
  | 'musicbox'
  | 'shaker'
  | 'woodblock'
  | 'logdrum';

interface PartBase {
  instrument: InstrumentId;
  /** Part volume, 0–1 (multiplies the event velocity). */
  level: number;
  /** 16th-note steps per token. */
  grid: number;
  /**
   * melody: MIDI note of scale degree 1. chord/pad: lowest MIDI note of the voicing window (one
   * octave). perc: the MIDI pitch of every hit.
   */
  register: number;
  /** Send to the track's soft echo, 0–1. */
  echo?: number;
}

export interface MelodyPart extends PartBase {
  kind: 'melody';
  /** One entry per track variant (or a single entry used for every variant); one string per bar. */
  variants: readonly (readonly string[])[];
}

export interface PatternPart extends PartBase {
  kind: 'chord' | 'pad' | 'perc';
  /** One bar repeated for every bar, or one string per bar. */
  pattern: string | readonly string[];
}

export type PartDef = MelodyPart | PatternPart;

export interface TrackDef {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  /** Pitch class of the major key's tonic (0 = C). */
  tonic: number;
  /** Roman numeral per bar (I ii iii IV V vi), optionally with 6, 7 or add9 (pad voicings only). */
  progression: readonly string[];
  /** Delay of off-beat 8ths, as a fraction of a 16th step. */
  swing: number;
  /** Track output level before the player's fade gain. */
  level: number;
  /** Number of melody variants (pass 0 always plays variant 0). */
  variants: number;
  seed: number;
  parts: readonly PartDef[];
}

/** 16th-note steps per beat for every track. */
export const STEPS_PER_BEAT = 4;

const R8 = '. . . . . . . .';
const R6 = '. . . . . .';
const tacet8: readonly string[] = Array.from({ length: 8 }, () => R8);
const tacet6: readonly string[] = Array.from({ length: 8 }, () => R6);

export const TRACKS: Record<KnownMusicId, TrackDef> = {
  island: {
    bpm: 88,
    beatsPerBar: 4,
    bars: 8,
    tonic: 5, // F
    progression: ['Iadd9', 'iii', 'IV6', 'I', 'vi', 'IV', 'ii7', 'V'],
    swing: 0.12,
    level: 0.36,
    variants: 3,
    seed: 101,
    parts: [
      {
        kind: 'melody',
        instrument: 'marimba',
        level: 0.8,
        grid: 2,
        register: 65, // F4
        echo: 0.35,
        variants: [
          [
            '3 - 5 - . . . .',
            '3 - 2 - 3 . . .',
            "1' - . 6 - . . .",
            '5 - - - . . . .',
            '6 - 5 - 3 - . .',
            '2 - 3 - 1 - . .',
            '2 - - . 6, - . .',
            '2 - - - . . . .',
          ],
          [
            '. . 5 - 6 - 5 .',
            '3 - - - . . . .',
            "4 - 6 - 1' - . .",
            '5 - - - . . . .',
            '. . 3 - 5 - 6 .',
            "1' - - - 6 - . .",
            '5 - 4 - 2 - . .',
            '2 - - - - - . .',
          ],
          tacet8,
        ],
      },
      {
        kind: 'chord',
        instrument: 'pluck',
        level: 0.45,
        grid: 2,
        register: 60,
        pattern: '. 1 . 2 . 1 . 2',
      },
      { kind: 'pad', instrument: 'pad', level: 0.55, grid: 16, register: 53, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'bass',
        level: 0.75,
        grid: 2,
        register: 40,
        pattern: '0 - - . 2 - . .',
      },
      {
        kind: 'perc',
        instrument: 'shaker',
        level: 0.35,
        grid: 2,
        register: 77,
        pattern: '. o . o . o . x',
      },
    ],
  },

  festival: {
    bpm: 100,
    beatsPerBar: 4,
    bars: 8,
    tonic: 7, // G
    progression: ['I', 'IV', 'V', 'I', 'vi', 'IV', 'ii', 'V'],
    swing: 0,
    level: 0.39,
    variants: 3,
    seed: 202,
    parts: [
      {
        kind: 'melody',
        instrument: 'bell',
        level: 0.7,
        grid: 2,
        register: 79, // G5
        echo: 0.3,
        variants: [
          [
            '1 . 3 . 5 - . .',
            '6 - 5 . 6 - . .',
            '5 - 2 - . . . .',
            '3 - 1 - . . . .',
            '3 . 5 . 6 - . .',
            "5 - 6 - 1' - . .",
            '6 - 5 - 4 - . .',
            '2 - - - . . . .',
          ],
          [
            '5 . 5 . 6 . 5 .',
            "1' - - - . . . .",
            '. . 2 . 5 . 2 .',
            '3 - - - . . . .',
            '. . 3 . 5 . 6 .',
            '6 - - - . . . .',
            '. . 6 . 5 . 4 .',
            '2 - - - 5, - . .',
          ],
          tacet8,
        ],
      },
      {
        kind: 'chord',
        instrument: 'pluck',
        level: 0.4,
        grid: 2,
        register: 62,
        pattern: '0 . 1 2 . 1 2 .',
      },
      { kind: 'pad', instrument: 'pad', level: 0.4, grid: 16, register: 55, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'bass',
        level: 0.75,
        grid: 2,
        register: 40,
        pattern: '0 . 2 . 3 . 2 .',
      },
      {
        kind: 'perc',
        instrument: 'woodblock',
        level: 0.3,
        grid: 4,
        register: 79,
        pattern: '. x . x',
      },
      {
        kind: 'perc',
        instrument: 'shaker',
        level: 0.3,
        grid: 2,
        register: 79,
        pattern: '. o . x . o . x',
      },
    ],
  },

  sunset: {
    bpm: 66,
    beatsPerBar: 3,
    bars: 8,
    tonic: 2, // D
    progression: ['Iadd9', 'vi', 'IV', 'I6', 'ii7', 'V', 'IV', 'I'],
    swing: 0,
    level: 0.42,
    variants: 3,
    seed: 303,
    parts: [
      {
        kind: 'melody',
        instrument: 'musicbox',
        level: 0.75,
        grid: 2,
        register: 74, // D5
        echo: 0.4,
        variants: [
          [
            '5 - - - 3 -',
            '3 - 1 - - -',
            '6 - 5 - 4 -',
            '3 - - - - -',
            '2 - 4 - 6 -',
            '5 - - - 2 -',
            '1 - 6, - 4, -',
            '1 - - - - -',
          ],
          [
            ". . 1' - 6 -",
            '3 - - - . .',
            '. . 2 - 1 -',
            '1 - - - . .',
            '. . 4 - 6 -',
            '5 - - - . .',
            '4 - 3 - 2 -',
            '1 - - - - -',
          ],
          tacet6,
        ],
      },
      { kind: 'pad', instrument: 'pad', level: 0.65, grid: 12, register: 50, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'pluck',
        level: 0.28,
        grid: 2,
        register: 57,
        echo: 0.3,
        pattern: '0 . 1 . 2 .',
      },
      { kind: 'chord', instrument: 'bass', level: 0.6, grid: 4, register: 38, pattern: '0 - .' },
    ],
  },

  'workshop.shore': {
    bpm: 92,
    beatsPerBar: 4,
    bars: 8,
    tonic: 0, // C
    progression: ['I', 'iii', 'vi', 'IV', 'I', 'iii', 'ii', 'V'],
    swing: 0,
    level: 0.355,
    variants: 3,
    seed: 404,
    parts: [
      {
        kind: 'melody',
        instrument: 'marimba',
        level: 0.75,
        grid: 2,
        register: 72, // C5
        echo: 0.35,
        variants: [
          [
            '5 - . 6 5 - . .',
            '3 - . . . . . .',
            '6 - . 5 3 - . .',
            '6 - - - . . . .',
            '. . 5 - 3 - 1 -',
            '2 - 3 - . . . .',
            '6 - - . 4 - 2 -',
            '5, - - - . . . .',
          ],
          [
            '. . . . 3 - 5 -',
            '7 - - - . . . .',
            ". . . . 6 - 1' -",
            '6 - - - . . . .',
            '. . . . 5 - 3 -',
            '5 - - - . . . .',
            '. . 2 - 4 - 6 -',
            '5 - - - . . . .',
          ],
          tacet8,
        ],
      },
      {
        kind: 'chord',
        instrument: 'pluck',
        level: 0.4,
        grid: 1,
        register: 60,
        pattern: '0 . . 2 . . 3 . . 2 . . 1 . . .',
      },
      { kind: 'pad', instrument: 'pad', level: 0.4, grid: 16, register: 55, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'bass',
        level: 0.65,
        grid: 2,
        register: 40,
        pattern: '0 - . . 0 . . .',
      },
      {
        kind: 'perc',
        instrument: 'shaker',
        level: 0.3,
        grid: 2,
        register: 72,
        pattern: '. . . o . . . o',
      },
    ],
  },

  'workshop.harbor': {
    bpm: 96,
    beatsPerBar: 4,
    bars: 8,
    tonic: 10, // B♭
    progression: ['I', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V'],
    swing: 0,
    level: 0.35,
    variants: 3,
    seed: 505,
    parts: [
      {
        kind: 'melody',
        instrument: 'pluck',
        level: 0.75,
        grid: 2,
        register: 70, // B♭4
        echo: 0.3,
        variants: [
          [
            "1' - 6 - 5 - . .",
            '6 - - - . . . .',
            '3 - 5 - 6 - 5 -',
            '2 - - - . . . .',
            '3 - 5 - 6 - . .',
            '6 - 5 - 4 - . .',
            '2 - - - 6, - . .',
            '5, - - - . . . .',
          ],
          [
            '. . 1 - 3 - 5 -',
            '6 - - - . . . .',
            '. . 5 - 3 - 1 -',
            '2 - - - . . . .',
            '. . 3 - 5 - 6 -',
            "1' - - - . . . .",
            '. . 6 - 4 - 2 -',
            '5, - - - . . . .',
          ],
          tacet8,
        ],
      },
      {
        kind: 'chord',
        instrument: 'marimba',
        level: 0.4,
        grid: 2,
        register: 58,
        pattern: '0 2 1 2 0 2 1 2',
      },
      { kind: 'pad', instrument: 'pad', level: 0.3, grid: 16, register: 53, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'bass',
        level: 0.7,
        grid: 2,
        register: 40,
        pattern: '0 . . 0 2 . . .',
      },
      {
        kind: 'perc',
        instrument: 'woodblock',
        level: 0.28,
        grid: 2,
        register: 77,
        pattern: 'x . o . x . o o',
      },
      {
        kind: 'perc',
        instrument: 'logdrum',
        level: 0.45,
        grid: 4,
        register: 46,
        pattern: 'x . o .',
      },
    ],
  },

  'workshop.garden': {
    bpm: 104,
    beatsPerBar: 4,
    bars: 8,
    tonic: 9, // A
    progression: ['I', 'IV', 'I', 'V', 'IV', 'I', 'ii', 'V'],
    swing: 0.1,
    level: 0.41,
    variants: 3,
    seed: 606,
    parts: [
      {
        kind: 'melody',
        instrument: 'marimba',
        level: 0.75,
        grid: 2,
        register: 69, // A4
        echo: 0.3,
        variants: [
          [
            '1 - 3 - 5 - 3 -',
            '6 - - - 5 - . .',
            '5 - 6 - 5 - 3 -',
            '2 - - - . . . .',
            ". . 6 - 1' - 6 -",
            '5 - - - 3 - . .',
            '2 - 4 - 6 - . .',
            '5 - - - . . . .',
          ],
          [
            '. . 5 - 5 - 6 -',
            "1' - - - . . . .",
            '. . 3 - 3 - 5 -',
            '5 - - - . . . .',
            ". . 6 - 6 - 1' -",
            '3 - - - . . . .',
            '. . 2 - 2 - 4 -',
            '2 - - - . . . .',
          ],
          tacet8,
        ],
      },
      {
        kind: 'pad',
        instrument: 'pluck',
        level: 0.3,
        grid: 2,
        register: 57,
        pattern: '. x . x . x . x',
      },
      { kind: 'pad', instrument: 'pad', level: 0.25, grid: 16, register: 57, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'bass',
        level: 0.7,
        grid: 2,
        register: 40,
        pattern: '0 . 2 . 0 . 2 .',
      },
      {
        kind: 'perc',
        instrument: 'shaker',
        level: 0.3,
        grid: 2,
        register: 69,
        pattern: '. o . o . o . o',
      },
    ],
  },

  'workshop.town': {
    bpm: 90,
    beatsPerBar: 4,
    bars: 8,
    tonic: 3, // E♭
    progression: ['I', 'vi', 'ii', 'V', 'I', 'vi', 'IV', 'V'],
    swing: 0,
    level: 0.47,
    variants: 3,
    seed: 707,
    parts: [
      {
        kind: 'melody',
        instrument: 'pluck',
        level: 0.7,
        grid: 2,
        register: 75, // E♭5
        echo: 0.25,
        variants: [
          [
            '1 . 3 . 5 . 3 .',
            "6 . 1' . 6 . . .",
            '2 . 4 . 6 . . .',
            '5 . . . . . . .',
            "3 . 5 . 1' . 5 .",
            '6 . . . 3 . . .',
            "4 . 6 . 1' . . .",
            "5 . 7 . 2' . . .",
          ],
          [
            '. . . . 5 . 5 .',
            '6 . . . . . . .',
            '. . . . 4 . 4 .',
            '5 . . . . . . .',
            ". . . . 1' . 1' .",
            '6 . . . . . . .',
            '. . . . 6 . 4 .',
            '5 . . . . . . .',
          ],
          tacet8,
        ],
      },
      {
        kind: 'melody',
        instrument: 'bell',
        level: 0.35,
        grid: 2,
        register: 75,
        echo: 0.4,
        variants: [["1' - - - . . . .", R8, R8, R8, '5 - - - . . . .', R8, R8, R8]],
      },
      {
        kind: 'perc',
        instrument: 'woodblock',
        level: 0.26,
        grid: 4,
        register: 82,
        pattern: 'x . x .',
      },
      {
        kind: 'perc',
        instrument: 'woodblock',
        level: 0.22,
        grid: 4,
        register: 75,
        pattern: '. x . x',
      },
      { kind: 'pad', instrument: 'pad', level: 0.25, grid: 16, register: 55, pattern: 'x' },
      {
        kind: 'chord',
        instrument: 'bass',
        level: 0.6,
        grid: 2,
        register: 40,
        pattern: '0 . . . 2 . . .',
      },
    ],
  },
};
