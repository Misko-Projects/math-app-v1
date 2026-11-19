import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import type { PaletteColor } from '../../tokens/tokens';
import { type DecorId, DecorTile, decorTileBox } from '../decor';
import {
  expectArtInsideCells,
  expectCellsApart,
  expectOneScreen,
  GALLERY_ROOM,
  GALLERY_VIEWPORT,
  infiniteAnimations,
} from '../decor/galleryChecks';
import {
  CONFETTI_BOX,
  Confetti,
  FIREFLY_BOX,
  Fireflies,
  SPARKLE_BOX,
  SPARKLE_PEAK,
  SPLASH_BOX,
  SPLASH_PEAK,
  Sparkle,
  Splash,
} from '.';
import { canvasSlotTaken } from './pixi';

/**
 * Art Gallery: effects (05 §11, 06 §6). Sparkle and Splash are SVG driven by Motion; Confetti and
 * Fireflies are particle-heavy and run on a lazily loaded Pixi canvas (one at a time), with a small
 * SVG fallback when WebGL is missing. Every effect is seeded; `progress` shows a still frame, which
 * is what these stories render unless you switch `play` on.
 */

type EffectName = 'sparkle' | 'splash' | 'confetti' | 'fireflies';

interface EffectArgs {
  effect: EffectName;
  progress: number;
  play: boolean;
  seed: number;
}

const EFFECTS: EffectName[] = ['sparkle', 'splash', 'confetti', 'fireflies'];

const EFFECT_NAME: Record<EffectName, string> = {
  sparkle: 'Sparkle',
  splash: 'Splash',
  confetti: 'Confetti',
  fireflies: 'Fireflies',
};

/** What each effect plays over in the game. */
const BACKDROP: Record<EffectName, PaletteColor> = {
  sparkle: 'sand',
  splash: 'sea',
  confetti: 'sky-light',
  fireflies: 'ink',
};

/** Each effect's design box (its aspect ratio). */
const EFFECT_BOX: Record<EffectName, { w: number; h: number }> = {
  sparkle: SPARKLE_BOX,
  splash: SPLASH_BOX,
  confetti: CONFETTI_BOX,
  fireflies: FIREFLY_BOX,
};

function Effect({
  effect,
  progress,
  seed,
  width,
  onDone,
}: {
  effect: EffectName;
  progress?: number;
  seed: number;
  width: number | string;
  onDone?: () => void;
}) {
  const common = { progress, seed, onDone, size: width };
  switch (effect) {
    case 'sparkle':
      return <Sparkle {...common} />;
    case 'splash':
      return <Splash {...common} />;
    case 'confetti':
      return <Confetti {...common} />;
    default:
      return <Fireflies {...common} />;
  }
}

const backdrop = (effect: EffectName): CSSProperties => ({
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  borderRadius: 24,
  background: `var(--color-${BACKDROP[effect]})`,
  border: '3px solid var(--color-sand-shadow)',
  overflow: 'hidden',
});

/**
 * A frame tile: the effect's backdrop at a fixed size, the effect as large as fits inside it,
 * whole and centred, so every tile in a gallery is the same size.
 */
const FRAME = { w: 196, h: 150, pad: 10, border: 3 } as const;
type TileSize = { w: number; h: number };
const frameArtW = (effect: EffectName, tile: TileSize = FRAME) => {
  const box = EFFECT_BOX[effect];
  const inset = 2 * (FRAME.pad + FRAME.border);
  return Math.floor(Math.min(tile.w - inset, ((tile.h - inset) * box.w) / box.h));
};

function FrameTile({
  id,
  effect,
  tile = FRAME,
  children,
}: {
  id: string;
  effect: EffectName;
  tile?: TileSize;
  children: ReactNode;
}) {
  return (
    <div
      data-cell={id}
      style={{
        ...backdrop(effect),
        position: 'relative',
        boxSizing: 'border-box',
        width: tile.w,
        height: tile.h,
        padding: FRAME.pad,
        border: `${FRAME.border}px solid var(--color-sand-shadow)`,
        borderRadius: 20,
      }}
    >
      {children}
    </div>
  );
}

const caption: CSSProperties = { margin: 0, color: 'var(--color-ink)', lineHeight: '20px' };

function Playground({ effect, progress, play, seed }: EffectArgs) {
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(0);
  const wide = effect === 'confetti' || effect === 'fireflies';
  return (
    <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
      <div style={{ ...backdrop(effect), width: wide ? 'min(720px, 90vw)' : 'min(360px, 90vw)' }}>
        <Effect
          key={`${effect}-${seed}-${run}-${play}`}
          effect={effect}
          seed={seed}
          progress={play ? undefined : progress}
          width="100%"
          onDone={() => setDone((n) => n + 1)}
        />
      </div>
      {play ? (
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          style={{
            minHeight: 64,
            padding: '0 28px',
            borderRadius: 18,
            font: 'inherit',
            fontWeight: 700,
            color: 'var(--color-ink)',
            background: 'var(--color-paper)',
            border: '3px solid var(--color-sand-deep)',
          }}
        >
          Play again (finished {done})
        </button>
      ) : null}
    </div>
  );
}

/** Every effect root sits wholly inside its tile (nothing cut off by the tile's rounded edge). */
async function expectEffectsInsideTiles(root: HTMLElement) {
  const problems: string[] = [];
  for (const tile of root.querySelectorAll<HTMLElement>('[data-cell]')) {
    const t = tile.getBoundingClientRect();
    for (const fx of tile.querySelectorAll<HTMLElement>('[data-effect]')) {
      const r = fx.getBoundingClientRect();
      if (r.left < t.left || r.right > t.right || r.top < t.top || r.bottom > t.bottom) {
        problems.push(`${tile.dataset.cell} spills out of its tile`);
      }
    }
  }
  await expect(problems).toEqual([]);
}

const meta = {
  title: 'Art Gallery/Effects',
  parameters: { ui: { stage: 'centered' }, ...GALLERY_VIEWPORT.parameters },
  globals: GALLERY_VIEWPORT.globals,
  argTypes: {
    effect: { control: 'inline-radio', options: EFFECTS },
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    play: { control: 'boolean' },
    seed: { control: { type: 'number', min: 1, max: 999 } },
  },
  args: { effect: 'sparkle', progress: 0.3, play: false, seed: 1 },
} satisfies Meta<EffectArgs>;

export default meta;
type Story = StoryObj<Meta<EffectArgs>>;

/** One effect: scrub `progress`, or switch `play` on to watch it live (Pixi for the particles). */
export const Controls: Story = {
  render: (args) => <Playground {...args} />,
  play: async ({ canvasElement, args }) => {
    const root = canvasElement.querySelector('[data-effect]') as HTMLElement;
    await expect(root.dataset.effect).toBe(args.effect);
    if (!args.play) await expect(root.dataset.renderer).toBe('still');
    await expectOneScreen();
  },
};

const STILLS = [0.1, 0.25, 0.4, 0.6, 0.85];
const FRAMES_LABEL_W = 130;
const FRAMES_GAP = { col: 14, row: 12 } as const;
const TITLE = { h: 24, gap: 10 } as const;

/**
 * Still frames of every effect through its life (the gallery and snapshot view): a row per effect,
 * a column per moment, every tile the same size.
 */
export const Frames: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <section aria-label="Every effect, frame by frame">
      <h2
        className="story-heading"
        style={{ margin: `0 0 ${TITLE.gap}px`, fontSize: '1.25rem', lineHeight: `${TITLE.h}px` }}
      >
        Every effect, frame by frame
      </h2>
      <div
        data-frames
        style={{
          display: 'grid',
          gridTemplateColumns: `${FRAMES_LABEL_W}px repeat(${STILLS.length}, ${FRAME.w}px)`,
          gap: `${FRAMES_GAP.row}px ${FRAMES_GAP.col}px`,
          alignItems: 'center',
          justifyItems: 'center',
          width: 'max-content',
          maxWidth: GALLERY_ROOM.w,
        }}
      >
        <span />
        {STILLS.map((p) => (
          <span key={p} className="story-cell__name" style={caption} data-col={p}>
            {Math.round(p * 100)}% through
          </span>
        ))}
        {EFFECTS.map((effect) => (
          <div key={effect} style={{ display: 'contents' }} data-row={effect}>
            <span
              className="story-heading"
              style={{ margin: 0, fontSize: '1.15rem', justifySelf: 'start' }}
            >
              {EFFECT_NAME[effect]}
            </span>
            {STILLS.map((p) => (
              <FrameTile key={p} id={`${effect}@${p}`} effect={effect}>
                <Effect effect={effect} progress={p} seed={7} width={frameArtW(effect)} />
              </FrameTile>
            ))}
          </div>
        ))}
      </div>
    </section>
  ),
  play: async ({ canvasElement }) => {
    const roots = [...canvasElement.querySelectorAll<HTMLElement>('[data-effect]')];
    await expect(roots.length).toBe(EFFECTS.length * STILLS.length);
    for (const r of roots) await expect(r.dataset.renderer).toBe('still');
    // Each row is one effect at every moment.
    for (const effect of EFFECTS) {
      const row = canvasElement.querySelectorAll(`[data-row="${effect}"] [data-effect]`);
      await expect([...row].map((r) => (r as HTMLElement).dataset.effect)).toEqual(
        STILLS.map(() => effect),
      );
    }
    // Still frames never open a WebGL canvas (02 §6: at most one, and only while playing).
    await expect(canvasElement.querySelectorAll('canvas').length).toBe(0);
    await expect(canvasSlotTaken()).toBe(false);
    await expectCellsApart(canvasElement);
    await expectEffectsInsideTiles(canvasElement);
    await expectOneScreen();
  },
};

const finished = new Set<string>();

/** The reduced-motion effect tiles: four across the room. */
const REDUCED_GAP = 24;
const REDUCED_TILE = {
  w: Math.floor((GALLERY_ROOM.w - (EFFECTS.length - 1) * REDUCED_GAP) / EFFECTS.length),
  h: 160,
};

const REDUCED_STATE: Record<EffectName, string> = {
  sparkle: 'this frame, faded in and out',
  splash: 'this frame, faded in and out',
  confetti: 'off',
  fireflies: 'a still glow',
};

/** The one frame a reduced-motion effect fades in and out (shown held still in the gallery). */
const SHOWN_FRAME: Partial<Record<EffectName, number>> = {
  sparkle: SPARKLE_PEAK,
  splash: SPLASH_PEAK,
};

/** Decor with idle loops (sails, flags, chimes, fronds, lanterns, water), all at one scale. */
const LOOPING: readonly DecorId[] = [
  'windmill',
  'flag-pole',
  'shell-chime',
  'palm-tree',
  'lantern-string',
  'fountain',
];
const LOOP_CARD = { pad: 10, border: 3, gap: 6, captionH: 20 } as const;
const LOOP_GAP = 16;
const loopTile = decorTileBox;
/** CSS px per scene unit for the looping decor: as large as one row across the room allows. */
const LOOP_SCALE = (() => {
  const chrome = LOOPING.length * 2 * (LOOP_CARD.pad + LOOP_CARD.border);
  const room = GALLERY_ROOM.w - (LOOPING.length - 1) * LOOP_GAP - chrome;
  const units = LOOPING.reduce((n, id) => n + loopTile(id).w, 0);
  return Math.floor((room / units) * 100) / 100;
})();
const LOOP_ART_H = Math.ceil(Math.max(...LOOPING.map((id) => loopTile(id).h)) * LOOP_SCALE);

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="story-heading"
      style={{ margin: 0, fontSize: '1.25rem', lineHeight: `${TITLE.h}px` }}
    >
      {children}
    </h2>
  );
}

/**
 * 06 §7 reduced motion: confetti is off, sparkle and splash become a fade (≤ 150 ms each way) and
 * fireflies a still glow; decor idle loops (windmill, flags, chimes, lanterns, fountain) stop.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  globals: { ...GALLERY_VIEWPORT.globals, motion: 'reduced' },
  render: () => {
    finished.clear();
    return (
      <div style={{ display: 'grid', gap: 28, width: `min(${GALLERY_ROOM.w}px, 100%)` }}>
        <section aria-label="Effects with reduced motion" style={{ display: 'grid', gap: 10 }}>
          <SectionTitle>Effects with reduced motion, after playing</SectionTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${EFFECTS.length}, ${REDUCED_TILE.w}px)`,
              gap: REDUCED_GAP,
            }}
          >
            {EFFECTS.map((effect) => (
              <figure
                key={effect}
                style={{ margin: 0, display: 'grid', gap: 6, justifyItems: 'center' }}
              >
                <FrameTile id={effect} effect={effect} tile={REDUCED_TILE}>
                  {/* The live effect under reduced motion (checked by the play test). Sparkle and
                      splash fade out within 150 ms, so the tile also shows the one frame they
                      fade in and out, held still; confetti shows nothing at all. */}
                  <div
                    style={{
                      position: SHOWN_FRAME[effect] === undefined ? 'static' : 'absolute',
                      opacity: SHOWN_FRAME[effect] === undefined ? 1 : 0,
                    }}
                    aria-hidden={SHOWN_FRAME[effect] === undefined ? undefined : true}
                  >
                    <Effect
                      effect={effect}
                      seed={3}
                      width={frameArtW(effect, REDUCED_TILE)}
                      onDone={() => finished.add(effect)}
                    />
                  </div>
                  {SHOWN_FRAME[effect] === undefined ? null : (
                    <div data-shown-frame={effect}>
                      <Effect
                        effect={effect}
                        seed={3}
                        progress={SHOWN_FRAME[effect]}
                        width={frameArtW(effect, REDUCED_TILE)}
                      />
                    </div>
                  )}
                  {effect === 'confetti' ? (
                    <span
                      className="story-cell__name"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      no confetti
                    </span>
                  ) : null}
                </FrameTile>
                <figcaption className="story-cell__name" style={caption}>
                  {EFFECT_NAME[effect]}: {REDUCED_STATE[effect]}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section aria-label="Decor idle loops, stopped" style={{ display: 'grid', gap: 10 }}>
          <SectionTitle>Decor idle loops, stopped</SectionTitle>
          <div style={{ display: 'flex', gap: LOOP_GAP, justifyContent: 'center' }}>
            {LOOPING.map((id) => (
              <figure
                key={id}
                data-cell={id}
                style={{
                  margin: 0,
                  display: 'grid',
                  gridTemplateRows: `${LOOP_ART_H}px ${LOOP_CARD.captionH}px`,
                  gap: LOOP_CARD.gap,
                  justifyItems: 'center',
                  padding: LOOP_CARD.pad,
                  borderRadius: 22,
                  border: `${LOOP_CARD.border}px solid var(--color-sand-deep)`,
                  background: 'var(--color-paper)',
                }}
              >
                <DecorTile
                  id={id}
                  ground="grass"
                  size={loopTile(id).w * LOOP_SCALE}
                  title={id.replaceAll('-', ' ')}
                  style={{ alignSelf: 'end' }}
                />
                <figcaption className="story-cell__name" style={caption}>
                  {id.replaceAll('-', ' ')}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const renderer = (e: EffectName) =>
      (canvasElement.querySelector(`[data-effect="${e}"]`) as HTMLElement).dataset.renderer;
    await expect(renderer('confetti')).toBe('off');
    await expect(renderer('fireflies')).toBe('static');
    await expect(renderer('sparkle')).toBe('fade');
    await expect(renderer('splash')).toBe('fade');
    // Confetti is over at once; sparkle and splash finish their short fades.
    await waitFor(() => expect([...finished].sort()).toEqual(['confetti', 'sparkle', 'splash']), {
      timeout: 2000,
    });
    await expect(document.querySelectorAll('canvas').length).toBe(0);
    await expect(canvasSlotTaken()).toBe(false);
    await expect(canvasElement.querySelectorAll('.motion-loop').length).toBeGreaterThan(0);
    await expect(infiniteAnimations().length).toBe(0);
    await expectCellsApart(canvasElement);
    await expectEffectsInsideTiles(canvasElement);
    await expectArtInsideCells(canvasElement);
    await expectOneScreen();
  },
};
