import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import type { PaletteColor } from '../../tokens/tokens';
import { DecorTile } from '../decor';
import {
  expectCellsApart,
  expectNoSidewaysScroll,
  infiniteAnimations,
} from '../decor/galleryChecks';
import { GallerySection } from '../gallery/Gallery';
import { Confetti, Fireflies, Sparkle, Splash } from '.';
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

/** What each effect plays over in the game. */
const BACKDROP: Record<EffectName, PaletteColor> = {
  sparkle: 'sand',
  splash: 'sea',
  confetti: 'sky-light',
  fireflies: 'ink',
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

function Cell({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <figure data-cell={id} style={{ margin: 0, display: 'grid', gap: 6, justifyItems: 'center' }}>
      {children}
      <figcaption className="story-cell__name" style={{ color: 'var(--color-ink)' }}>
        {label}
      </figcaption>
    </figure>
  );
}

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

const meta = {
  title: 'Art Gallery/Effects',
  parameters: { ui: { stage: 'padded' } },
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
    await expectNoSidewaysScroll();
  },
};

const STILLS = [0.1, 0.25, 0.4, 0.6, 0.85];
const STILL_WIDTH: Record<EffectName, number> = {
  sparkle: 150,
  splash: 180,
  confetti: 196,
  fireflies: 196,
};

/** Still frames of every effect through its life (the gallery and snapshot view). */
export const Frames: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 28, width: 'min(1200px, 100%)', margin: '0 auto' }}>
      {EFFECTS.map((effect) => (
        <GallerySection key={effect} title={effect[0]?.toUpperCase() + effect.slice(1)}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
            {STILLS.map((p) => (
              <Cell key={p} id={`${effect}@${p}`} label={`${Math.round(p * 100)}%`}>
                <div style={{ ...backdrop(effect), padding: 8 }}>
                  <Effect effect={effect} progress={p} seed={7} width={STILL_WIDTH[effect]} />
                </div>
              </Cell>
            ))}
          </div>
        </GallerySection>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const roots = [...canvasElement.querySelectorAll<HTMLElement>('[data-effect]')];
    await expect(roots.length).toBe(EFFECTS.length * STILLS.length);
    for (const r of roots) await expect(r.dataset.renderer).toBe('still');
    // Still frames never open a WebGL canvas (02 §6: at most one, and only while playing).
    await expect(canvasElement.querySelectorAll('canvas').length).toBe(0);
    await expect(canvasSlotTaken()).toBe(false);
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

const finished = new Set<string>();

const REDUCED_STATE: Record<EffectName, string> = {
  sparkle: 'a short fade',
  splash: 'a short fade',
  confetti: 'off',
  fireflies: 'still glow',
};

/**
 * 06 §7 reduced motion: confetti is off, sparkle and splash become a fade (≤ 150 ms each way) and
 * fireflies a still glow; decor idle loops (windmill, flags, chimes, lanterns, fountain) stop.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  globals: { motion: 'reduced' },
  render: () => {
    finished.clear();
    return (
      <div style={{ display: 'grid', gap: 28, width: 'min(1200px, 100%)', margin: '0 auto' }}>
        <GallerySection title="Effects, playing, with reduced motion">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
            {EFFECTS.map((effect) => (
              <Cell key={effect} id={effect} label={`${effect}: ${REDUCED_STATE[effect]}`}>
                <div
                  style={{
                    ...backdrop(effect),
                    width: STILL_WIDTH[effect] + 40,
                    height: 176,
                    boxSizing: 'border-box',
                  }}
                >
                  <Effect
                    effect={effect}
                    seed={3}
                    width={STILL_WIDTH[effect]}
                    onDone={() => finished.add(effect)}
                  />
                </div>
              </Cell>
            ))}
          </div>
        </GallerySection>
        <GallerySection title="Decor idle loops, stopped">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              justifyContent: 'center',
              alignItems: 'flex-end',
            }}
          >
            {(
              [
                'windmill',
                'flag-pole',
                'shell-chime',
                'palm-tree',
                'lantern-string',
                'fountain',
              ] as const
            ).map((id) => (
              <Cell key={id} id={id} label={id.replace('-', ' ')}>
                <DecorTile
                  id={id}
                  ground="grass"
                  size={id === 'fountain' || id === 'lantern-string' ? 260 : 130}
                />
              </Cell>
            ))}
          </div>
        </GallerySection>
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
    await expect(infiniteAnimations().length).toBe(0);
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};
