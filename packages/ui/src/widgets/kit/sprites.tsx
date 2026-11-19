import type { NarrationKey, SpriteId } from '@number-island/shared';
import type { ReactElement } from 'react';
import { MEASURE_DRAWINGS } from './sprites-measure';

/**
 * Countable object sprites for the math widgets (05 §11 art direction): cozy flat vector, a 3 px
 * outline in the fill's darker shade, one soft highlight and a contact shadow. All original. Each
 * sprite draws in a 64 × 64 box and is decorative (aria-hidden): the control around it carries the
 * accessible name, from `spriteNameKey`.
 *
 * Sprite ids come from the generators (`ObjectSet.sprite`, 03 §5.1). An id without its own drawing
 * renders as a pebble, so a new content sprite never breaks a widget.
 */

/** A sprite's tint for coloured sub-groups (`ObjectSet.groups`) and highlighted objects. */
export type SpriteTone = 'a' | 'b';

const SHADOW = <ellipse cx="32" cy="57" rx="20" ry="4.5" fill="rgb(38 70 83 / 0.18)" />;

const HIGHLIGHT = (d: string) => (
  <path d={d} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" fill="none" />
);

/** Fill and outline for each tone (group b uses a darker, warmer pair: lightness differs too). */
function toneFill(base: { fill: string; line: string }, tone: SpriteTone) {
  return tone === 'b' ? { fill: 'var(--color-sea-deep)', line: 'var(--color-sea-dark)' } : base;
}

type Draw = (tone: SpriteTone) => ReactElement;

const shell: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' }, tone);
  // A scallop: a fan of ribs from the hinge, a wavy top edge, and two small "ears" at the hinge.
  return (
    <>
      {SHADOW}
      <path
        d="M22 47l-7 6h12l3-4M42 47l7 6H37l-3-4"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M32 52C22 47 9 36 7 24c3-3 6-3 8-1 1-5 5-8 9-6 2-5 6-7 8-7s6 2 8 7c4-2 8 1 9 6 2-2 5-2 8 1-2 12-15 23-25 28Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M32 50V13M32 50 23 18M32 50 41 18M32 50 15 25M32 50 49 25"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      {HIGHLIGHT('M17 28c2-4 5-7 9-8')}
    </>
  );
};

const fish: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sunshine)', line: 'var(--color-sun-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <path
        d="M6 22c5 3 8 6 10 10-2 4-5 7-10 10 1-6 1-14 0-20Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M14 32c4-10 13-16 24-16 9 0 16 7 19 16-3 9-10 16-19 16-11 0-20-6-24-16Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M33 21c-3 6-3 16 0 22" stroke={c.line} strokeWidth="2.5" opacity="0.55" />
      <circle cx="46" cy="29" r="3.5" fill="var(--color-ink)" />
      <circle cx="47.2" cy="27.8" r="1.2" fill="#fff" />
      {HIGHLIGHT('M24 22c3-2 6-3 9-3')}
    </>
  );
};

const starfish: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sun)', line: 'var(--color-sun-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <path
        d="M32 5c2.6 0 4 6.5 5.6 13.2 6.6-.6 14.6-1.7 15.6.9 1 2.6-5.6 7-11 11.4 2.6 6.3 6.3 13.4 4.2 15.3-2.1 1.9-8.6-3-14.4-6.6-5.8 3.6-12.3 8.5-14.4 6.6-2.1-1.9 1.6-9 4.2-15.3-5.4-4.4-12-8.8-11-11.4 1-2.6 9-1.5 15.6-.9C28 11.5 29.4 5 32 5Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="21" r="2" fill={c.line} opacity="0.6" />
      <circle cx="26" cy="28" r="2" fill={c.line} opacity="0.6" />
      <circle cx="38" cy="28" r="2" fill={c.line} opacity="0.6" />
      <circle cx="32" cy="32" r="2" fill={c.line} opacity="0.6" />
      {HIGHLIGHT('M29.5 12c.6-2 1.4-3 2.5-3')}
    </>
  );
};

const crab: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <path
        d="M14 44l-6 7M20 47l-3 7M50 44l6 7M44 47l3 7"
        stroke={c.line}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M18 30c-6-1-11-6-10-12 4 0 6 2 7 4 1-4 4-6 7-6-1 5 0 9 3 12"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M46 30c6-1 11-6 10-12-4 0-6 2-7 4-1-4-4-6-7-6 1 5 0 9-3 12"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="32" cy="38" rx="18" ry="12" fill={c.fill} stroke={c.line} strokeWidth="3" />
      <path d="M27 27v-4M37 27v-4" stroke={c.line} strokeWidth="3" strokeLinecap="round" />
      <circle cx="27" cy="21" r="3.5" fill="#fff" stroke="var(--color-ink)" strokeWidth="2" />
      <circle cx="37" cy="21" r="3.5" fill="#fff" stroke="var(--color-ink)" strokeWidth="2" />
      <circle cx="27.5" cy="21.5" r="1.4" fill="var(--color-ink)" />
      <circle cx="37.5" cy="21.5" r="1.4" fill="var(--color-ink)" />
      <path
        d="M27 41c3 2.5 7 2.5 10 0"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {HIGHLIGHT('M20 34c2-3 5-4.5 8-5')}
    </>
  );
};

const leaf: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-leaf)', line: 'var(--color-leaf-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <path
        d="M10 50C8 28 22 10 52 8c2 26-12 42-36 44"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M10 52c10-14 22-26 36-36M24 38l-1-9M31 31l-1-8M33 30l8 1M25 37l9 1"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {HIGHLIGHT('M44 14c-6 1-11 3-15 6')}
    </>
  );
};

const stone: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-pebble)', line: 'var(--color-pebble-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <path
        d="M9 38c0-14 10-25 24-25 13 0 22 9 22 22 0 11-9 18-23 18S9 49 9 38Z"
        fill={c.fill}
        stroke={tone === 'b' ? c.line : 'var(--color-ink-soft)'}
        strokeWidth="3"
      />
      <path d="M20 36c3 1 6 1 9-1M36 42c3 0 5-1 7-3" stroke={c.line} strokeWidth="2.5" />
      {HIGHLIGHT('M19 27c3-4 7-6 12-6.5')}
    </>
  );
};

const pebble: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sea)', line: 'var(--color-sea-dark)' }, tone);
  return (
    <>
      {SHADOW}
      <path
        d="M10 34c0-12 9.5-22 23-22 12 0 21 8 21 20 0 11-9 19-22 19S10 45 10 34Z"
        fill={tone === 'b' ? 'var(--color-sunshine)' : c.fill}
        stroke={tone === 'b' ? 'var(--color-sun-deep)' : c.line}
        strokeWidth="3"
      />
      {HIGHLIGHT('M21 25c2.6-3.6 6.6-5.6 11-5.8')}
    </>
  );
};

const stick: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <rect
        x="10"
        y="27"
        width="44"
        height="12"
        rx="6"
        transform="rotate(-20 32 33)"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      <path d="M41 22l5-6" stroke={c.line} strokeWidth="3" strokeLinecap="round" />
      {HIGHLIGHT('M19 33l16-6')}
    </>
  );
};

const plank: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <rect
        x="6"
        y="22"
        width="52"
        height="20"
        rx="5"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      <path d="M12 32h18M36 29h14M34 36h10" stroke={c.line} strokeWidth="2.5" opacity="0.6" />
      <circle cx="47" cy="34" r="2.5" fill={c.line} opacity="0.6" />
      {HIGHLIGHT('M12 26h20')}
    </>
  );
};

const firefly: Draw = (tone) => {
  // The body outline is wood-deep, not sunshine-deep: a yellow outline falls under 3:1 on the
  // sand trays fireflies sit on (06 §7); wood-deep reads at about 4.4:1 on sand.
  const c = toneFill({ fill: 'var(--color-sunshine)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      {SHADOW}
      <circle cx="32" cy="34" r="18" fill="var(--color-sunshine-light)" opacity="0.6" />
      <ellipse
        cx="22"
        cy="22"
        rx="9"
        ry="6"
        transform="rotate(-30 22 22)"
        fill="#fff"
        stroke="var(--color-ink-soft)"
        strokeWidth="2.5"
      />
      <ellipse
        cx="42"
        cy="22"
        rx="9"
        ry="6"
        transform="rotate(30 42 22)"
        fill="#fff"
        stroke="var(--color-ink-soft)"
        strokeWidth="2.5"
      />
      <ellipse cx="32" cy="36" rx="9" ry="12" fill={c.fill} stroke={c.line} strokeWidth="3.5" />
      <circle cx="32" cy="22" r="6" fill="var(--color-ink)" />
      {HIGHLIGHT('M28 32c1-2 2-3 4-3.5')}
    </>
  );
};

const counter: Draw = (tone) => (
  <>
    {SHADOW}
    <circle
      cx="32"
      cy="32"
      r="21"
      fill={tone === 'b' ? 'var(--color-sunshine)' : 'var(--color-coral)'}
      stroke={tone === 'b' ? 'var(--color-sun-deep)' : 'var(--color-coral-deep)'}
      strokeWidth="3"
    />
    {HIGHLIGHT('M20 24c2.5-3.5 6-5.5 10-6')}
  </>
);

const DRAWINGS: Readonly<Record<string, Draw>> = {
  shell,
  fish,
  starfish,
  crab,
  leaf,
  stone,
  pebble,
  stick,
  plank,
  firefly,
  counter,
  // U05 (#14): measuring, weighing, solid-shaped and scene objects (sprites-measure.tsx).
  ...MEASURE_DRAWINGS,
};

/** Sprite ids with their own drawing (others render as a pebble). */
export const SPRITE_IDS = Object.keys(DRAWINGS);

/** The narration key that names a sprite (ui.sprite.<id>), for labels and spoken names. */
export function spriteNameKey(sprite: SpriteId): NarrationKey {
  return `ui.sprite.${sprite in DRAWINGS ? sprite : 'pebble'}`;
}

export interface ObjectSpriteProps {
  sprite: SpriteId;
  tone?: SpriteTone;
  className?: string;
}

/** One countable object (decorative SVG; the surrounding control names it). */
export function ObjectSprite({ sprite, tone = 'a', className }: ObjectSpriteProps) {
  const draw = DRAWINGS[sprite] ?? pebble;
  return (
    <svg
      className={['ni-sprite', className].filter(Boolean).join(' ')}
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      data-sprite={sprite}
      data-tone={tone}
    >
      {draw(tone)}
    </svg>
  );
}
