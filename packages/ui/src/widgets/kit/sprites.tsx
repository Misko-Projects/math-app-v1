import type { NarrationKey, SpriteId } from '@number-island/shared';
import { type ReactElement, useId } from 'react';
import grainUrl from '../../tokens/felt-grain.webp';
import { drawFelt, FELT_KINDS, isFeltKind } from './felt-sprites';
import { MEASURE_DRAWINGS } from './sprites-measure';

/**
 * Countable object sprites for the math widgets (05 §11, Felt & Stitch). The counted kinds
 * (crab, shell, fish, starfish, leaf, pebble, firefly, dot, stone and the counters) are cut felt
 * in `felt-sprites.tsx`, with detail by drawn size. The rest keep their shapes in the felt
 * palette: an outline in the fill's darker shade and a cream running stitch. No sprite has a
 * shadow shape under it; the felt lift is a CSS drop-shadow on the svg (kit.css). All original.
 * Each sprite draws in a 64 × 64 box and is decorative (aria-hidden): the control around it
 * carries the accessible name, from `spriteNameKey`.
 *
 * Sprite ids come from the generators (`ObjectSet.sprite`, 03 §5.1). An id without its own drawing
 * renders as a pebble, so a new content sprite never breaks a widget.
 */

/** A sprite's tint for coloured sub-groups (`ObjectSet.groups`) and highlighted objects. */
/**
 * `a` and `b` are the two group tones. `red`, `white` and `blue` are the colours a story names
 * for its groups (story-problem): terracotta, cream felt with a dark edge (it reads on the cream
 * mat), and the denim of tone `b`.
 */
export type SpriteTone = 'a' | 'b' | 'red' | 'white' | 'blue';

/** A cream running stitch where the old drawings had a gloss line. */
const HIGHLIGHT = (d: string) => (
  <path
    d={d}
    stroke="var(--color-paper)"
    strokeWidth="2"
    strokeDasharray="3.4 2.8"
    strokeLinecap="round"
    fill="none"
  />
);

/** Fill and outline for each tone (group b uses a darker, warmer pair: lightness differs too). */
function toneFill(base: { fill: string; line: string }, tone: SpriteTone) {
  switch (tone) {
    case 'b':
    case 'blue':
      return { fill: 'var(--color-sea-deep)', line: 'var(--color-sea-dark)' };
    case 'red':
      return { fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' };
    case 'white':
      return { fill: 'var(--color-cloud)', line: 'var(--color-ink)' };
    default:
      return base;
  }
}

type Draw = (tone: SpriteTone) => ReactElement;

const stick: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
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

/*
 * Measuring objects (compare and order items: heavier, longer, taller). Each is drawn at its size
 * class, since size can be a deliberate cue: small things (dot, button, thimble, spoon, cube,
 * feather) fill about 60 % of the box, medium ones (apple, cup, coconut, rock, brick, melon) about
 * 80 %, large ones (pumpkin, crate, log, balloon, anchor, kite) the whole box.
 */

/** A stroked line drawn as a band: a `width` core in the fill with a 3 px outline either side. */
const band = (d: string, width: number, c: { fill: string; line: string }) => (
  <>
    <path d={d} stroke={c.line} strokeWidth={width + 6} strokeLinecap="round" fill="none" />
    <path d={d} stroke={c.fill} strokeWidth={width} strokeLinecap="round" fill="none" />
  </>
);

const button: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-leaf)', line: 'var(--color-leaf-deep)' }, tone);
  return (
    <>
      <circle cx="32" cy="37" r="17" fill={c.fill} stroke={c.line} strokeWidth="3" />
      <circle
        cx="32"
        cy="37"
        r="11.5"
        fill="none"
        stroke={c.line}
        strokeWidth="2.5"
        opacity="0.6"
      />
      <circle cx="28" cy="33" r="2.4" fill={c.line} />
      <circle cx="36" cy="33" r="2.4" fill={c.line} />
      <circle cx="28" cy="41" r="2.4" fill={c.line} />
      <circle cx="36" cy="41" r="2.4" fill={c.line} />
      {HIGHLIGHT('M19.5 32c1.6-3.4 4.2-6 7.5-7.5')}
    </>
  );
};

const thimble: Draw = (tone) => {
  // Silver: the outline is ink-soft (as on the stone), since pebble-deep is too faint on sand.
  const c = toneFill({ fill: 'var(--color-pebble)', line: 'var(--color-ink-soft)' }, tone);
  const pits = tone === 'b' ? c.line : 'var(--color-pebble-deep)';
  return (
    <>
      <path
        d="M20 49l2.5-20c0-7 4-11 9.5-11s9.5 4 9.5 11l2.5 20Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g fill={pits}>
        <circle cx="29" cy="25" r="1.6" />
        <circle cx="35" cy="25" r="1.6" />
        <circle cx="26" cy="31" r="1.6" />
        <circle cx="32" cy="31" r="1.6" />
        <circle cx="38" cy="31" r="1.6" />
        <circle cx="29" cy="37" r="1.6" />
        <circle cx="35" cy="37" r="1.6" />
        <circle cx="26" cy="43" r="1.6" />
        <circle cx="32" cy="43" r="1.6" />
        <circle cx="38" cy="43" r="1.6" />
      </g>
      <rect
        x="17.5"
        y="47"
        width="29"
        height="7"
        rx="3.5"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      {HIGHLIGHT('M25.5 28c.3-2.6 1.3-4.5 3-5.6')}
    </>
  );
};

const spoon: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-pebble)', line: 'var(--color-ink-soft)' }, tone);
  // Drawn upright, then laid down with the bowl a little raised.
  return (
    <>
      <g transform="translate(0 9) rotate(68 32 34)">
        <path
          d="M30 29.5 29 50a3 3 0 0 0 6 0l-1-20.5Z"
          fill={c.fill}
          stroke={c.line}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <ellipse cx="32" cy="21" rx="7.5" ry="9.5" fill={c.fill} stroke={c.line} strokeWidth="3" />
        <ellipse cx="32" cy="22" rx="4" ry="5.5" fill={c.line} opacity="0.2" />
        {HIGHLIGHT('M28 18c.5-1.8 1.5-3.2 3-4')}
      </g>
    </>
  );
};

const cube: Draw = (tone) => {
  // A small block in three-quarter view (a length unit: "how many cubes long").
  const c = toneFill({ fill: 'var(--color-sunshine)', line: 'var(--color-sun-deep)' }, tone);
  return (
    <>
      <path
        d="M17 28l9-9h26v26l-9 9H17Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M43 28l9-9v26l-9 9Z" fill={c.line} opacity="0.35" />
      <path
        d="M17 28h26v26M43 28l9-9"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
      {HIGHLIGHT('M22 33v10')}
    </>
  );
};

const brick: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' }, tone);
  return (
    <>
      <path
        d="M7 34l9-9h41v19l-9 9H7Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M48 34l9-9v19l-9 9Z" fill={c.line} opacity="0.35" />
      <path
        d="M7 34h41v19M48 34l9-9"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
      <g fill={c.line} opacity="0.55">
        <circle cx="30" cy="40" r="1.4" />
        <circle cx="38" cy="47" r="1.4" />
        <circle cx="19" cy="47" r="1.4" />
      </g>
      {HIGHLIGHT('M12 39h12')}
    </>
  );
};

const cup: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sky)', line: 'var(--color-sea-deep)' }, tone);
  return (
    <>
      {band('M46 26c10 0 10 16 0 16', 3.5, c)}
      <path
        d="M12 19v25c0 6 4 10 10 10h14c6 0 10-4 10-10V19Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="29" cy="19" rx="17" ry="5" fill={c.fill} stroke={c.line} strokeWidth="3" />
      <ellipse cx="29" cy="19.8" rx="12.5" ry="2.6" fill={c.line} opacity="0.5" />
      <path d="M12 33h34" stroke={c.line} strokeWidth="2.5" opacity="0.45" />
      {HIGHLIGHT('M17.5 39v8')}
    </>
  );
};

const apple: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' }, tone);
  return (
    <>
      <path
        d="M32 21c-6-5-21-5-22 11-1 13 9 23 17 23 2.5 0 3.5-1 5-1s2.5 1 5 1c8 0 18-10 17-23-1-16-16-16-22-11Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M32 22c0-5 1-9 3.5-12"
        stroke="var(--color-wood-deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M35 15c3.5-6 10-7.5 14.5-5.5C47.5 14.5 41 17 35 15Z"
        fill="var(--color-leaf)"
        stroke="var(--color-leaf-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M27.5 22.5c2.5 1.5 6.5 1.5 9 0"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      {HIGHLIGHT('M16.5 31c.3-4 2.3-7 5.5-8.5')}
    </>
  );
};

const coconut: Draw = (tone) => {
  // Hairy husk lines run pole to pole and the three "eyes" sit at the top (not a cookie or a ball).
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      <path
        d="M32 12c12 0 21 10 21 22.5S44 55 32 55s-21-8-21-20.5S20 12 32 12Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      <path
        d="M22 18c-6 7-8 22-2 33M27 31c-2.5 7-2 15 0 22M42 18c6 7 8 22 2 33M37 31c2.5 7 2 15 0 22"
        stroke={c.line}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="5 3"
        opacity="0.6"
        fill="none"
      />
      <circle cx="28" cy="20.5" r="2.5" fill={c.line} />
      <circle cx="36" cy="20.5" r="2.5" fill={c.line} />
      <circle cx="32" cy="26.5" r="2.5" fill={c.line} />
      {HIGHLIGHT('M16.5 30c1-4.5 3.5-8 7-10')}
    </>
  );
};

const melon: Draw = (tone) => {
  // A whole striped watermelon (heavy-looking; a slice would read as light).
  const c = toneFill({ fill: 'var(--color-leaf-light)', line: 'var(--color-leaf-deep)' }, tone);
  return (
    <>
      <ellipse cx="32" cy="37" rx="24.5" ry="17.5" fill={c.fill} stroke={c.line} strokeWidth="3" />
      <path
        d="M9 35c9-10 37-10 46 0M8 38.5c10 2 38 2 48 0M10 43c10 9 34 9 44 0"
        stroke={c.line}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
        fill="none"
      />
      <path
        d="M56 36l3.5-2.5"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {HIGHLIGHT('M16 28c4-3 9-4.8 14-5.3')}
    </>
  );
};

const rock: Draw = (tone) => {
  // A chunky boulder with a lit facet (the stone is smooth and pale; the pebble small and blue).
  const c = toneFill({ fill: 'var(--color-pebble-deep)', line: 'var(--color-ink-soft)' }, tone);
  return (
    <>
      <path
        d="M8 53l3-18 11-15 17-4 12 8 6 17-4 12Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M11 35l11-15 17-4-3 15-16 7Z" fill="var(--color-cloud)" opacity="0.3" />
      <path
        d="M20 38l16-7 3-15M36 31l15 9"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {HIGHLIGHT('M16 32l6-8.5')}
    </>
  );
};

const pumpkin: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sun)', line: 'var(--color-sun-deep)' }, tone);
  return (
    <>
      <path
        d="M30 21c-.5-5 .5-9 3.5-12l4 2.5c-2.5 2.5-3.5 5.5-3.5 9.5Z"
        fill="var(--color-leaf)"
        stroke="var(--color-leaf-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 20c-9-5-27-2-27.5 16C4 50 15 56 24 53.5c3 1.5 13 1.5 16 0C49 56 60 50 59.5 36 59 18 41 15 32 20Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M24 21c-6 6-7 25 0 32.5M40 21c6 6 7 25 0 32.5M14 23.5c-4 8-4 20 2 27.5M50 23.5c4 8 4 20-2 27.5"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.75"
        fill="none"
      />
      <path
        d="M36 14c4-3.5 9.5-2.5 10 1.5"
        stroke="var(--color-leaf-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {HIGHLIGHT('M27 28c.6-2.4 1.8-4.2 3.6-5.4')}
    </>
  );
};

const crate: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      <rect
        x="6"
        y="9"
        width="52"
        height="45"
        rx="4"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      <rect
        x="13"
        y="16"
        width="38"
        height="31"
        rx="1.5"
        fill="none"
        stroke={c.line}
        strokeWidth="2.5"
      />
      <path d="M13 26.5h38M13 36.5h38" stroke={c.line} strokeWidth="2.5" opacity="0.5" />
      {band('M17 43 47 20', 3.5, c)}
      <g fill={c.line}>
        <circle cx="9.5" cy="12.5" r="1.5" />
        <circle cx="54.5" cy="12.5" r="1.5" />
        <circle cx="9.5" cy="50.5" r="1.5" />
        <circle cx="54.5" cy="50.5" r="1.5" />
      </g>
      {HIGHLIGHT('M14 12.5h18')}
    </>
  );
};

const log: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      <path
        d="M27 23l-2.5-7.5 5-1.5 3 8"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M49 22H14C8.5 22 4.5 29 4.5 37S8.5 52 14 52h35Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M11 40h14M19 46.5h20M31 37.5h11"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <ellipse
        cx="49"
        cy="37"
        rx="9"
        ry="15"
        fill="var(--color-sand)"
        stroke={c.line}
        strokeWidth="3"
      />
      <ellipse
        cx="49"
        cy="37"
        rx="5.2"
        ry="9"
        fill="none"
        stroke={c.line}
        strokeWidth="2"
        opacity="0.6"
      />
      <ellipse cx="49" cy="37" rx="1.8" ry="3.2" fill={c.line} opacity="0.6" />
      {HIGHLIGHT('M12 28h20')}
    </>
  );
};

const balloon: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' }, tone);
  return (
    <>
      <path
        d="M32 49c-2.5 2.5 2.5 4 0 6.5"
        stroke="var(--color-ink-soft)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M29 50l3-4.5 3 4.5Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 3c11.5 0 20 8.5 20 19.5 0 11.5-9.5 21-20 24C21.5 43.5 12 34 12 22.5 12 11.5 20.5 3 32 3Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      {HIGHLIGHT('M18.5 20c1-5 4.5-8.5 9-10')}
    </>
  );
};

const kite: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sunshine)', line: 'var(--color-sun-deep)' }, tone);
  const bow = { fill: 'var(--color-coral)', stroke: 'var(--color-coral-deep)' };
  return (
    <>
      <path
        d="M32 46c-5.5 3.5 5.5 6 0 11"
        stroke="var(--color-ink-soft)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M32 3l22 18-22 25-22-25Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M32 3 10 21h22ZM32 21h22L32 46Z" fill={c.line} opacity="0.25" />
      <path d="M32 4v41M11 21h42" stroke={c.line} strokeWidth="2.5" opacity="0.7" />
      <path
        d="M26.5 48.5l5 2.5-5 2.5ZM36.5 48.5l-5 2.5 5 2.5Z"
        {...bow}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {HIGHLIGHT('M17 20l8-6.5')}
    </>
  );
};

const anchor: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-pebble-deep)', line: 'var(--color-ink-soft)' }, tone);
  const arms = 'M32 16v37M21 22h22M13 40c2 9 9.5 14 19 14s17-5 19-14';
  return (
    <>
      <circle cx="32" cy="10" r="5" fill="none" stroke={c.line} strokeWidth="10" />
      {band(arms, 5, c)}
      <circle cx="32" cy="10" r="5" fill="none" stroke={c.fill} strokeWidth="4" />
      <path
        d="M6.5 44 12 33l6.5 8.5ZM57.5 44 52 33l-6.5 8.5Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {HIGHLIGHT('M31 27v12')}
    </>
  );
};

const feather: Draw = (tone) => {
  // Long but thin and light: a narrow vane with a notch on each side, quill showing.
  const c = toneFill({ fill: 'var(--color-shallows)', line: 'var(--color-sea-deep)' }, tone);
  return (
    <>
      <g transform="rotate(38 32 33)">
        <path
          d="M32 7c6 4 9 14 8.5 24-.4 8-3.5 14-8.5 18-5-4-8.1-10-8.5-18C23 21 26 11 32 7Z"
          fill={c.fill}
          stroke={c.line}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M40.5 25l-5 2.5M23.6 35l5 2"
          stroke={c.line}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M32 22l5.5-4M32 31l6.5-4M32 40l5.5-3.5M32 27l-5.5-4M32 36l-6-3.5"
          stroke={c.line}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path d="M32 12v45" stroke={c.line} strokeWidth="2.5" strokeLinecap="round" />
        {HIGHLIGHT('M27.5 19c.6-2.5 1.6-4.5 3-6')}
      </g>
    </>
  );
};

const fishingRod: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' }, tone);
  return (
    <>
      <path
        d="M53 8v34"
        stroke="var(--color-ink-soft)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {band('M12 53 53 8', 2.5, c)}
      {band('M12 53l7-7.5', 5, { fill: 'var(--color-ink-soft)', line: 'var(--color-ink)' })}
      <circle
        cx="24.5"
        cy="45.5"
        r="5"
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        strokeWidth="2.5"
      />
      <circle
        cx="53"
        cy="45"
        r="4.5"
        fill="var(--color-cloud)"
        stroke="var(--color-coral-deep)"
        strokeWidth="2.5"
      />
      <path d="M48.5 45a4.5 4.5 0 0 1 9 0Z" fill="var(--color-coral)" />
      <path
        d="M53 49.5v3.5c0 2.2-3 2.2-3 0"
        stroke="var(--color-ink-soft)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {HIGHLIGHT('M22.5 43.5c.6-.9 1.4-1.5 2.4-1.8')}
    </>
  );
};

const rope: Draw = (tone) => {
  // A coil seen from above, the loose end trailing out to the right; dashes give the twist.
  const c = toneFill({ fill: 'var(--color-sand-deep)', line: 'var(--color-wood-deep)' }, tone);
  const coil =
    'M28.5 36a3.5 3.5 0 0 1 7 0 7 7 0 0 1-14 0 10.5 10.5 0 0 1 21 0 14 14 0 0 1-28 0 17.5 17.5 0 0 1 35 0c0 8 2.5 13 8 16';
  return (
    <>
      {band(coil, 4, c)}
      <path
        d={coil}
        stroke={c.line}
        strokeWidth="4"
        strokeDasharray="1.6 3.2"
        opacity="0.45"
        fill="none"
      />
      <path
        d="M57.5 52l2.5 2M57.5 52l1 3.5"
        stroke={c.line}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {HIGHLIGHT('M21 22.4c2.3-1.8 4.8-3 7.5-3.5')}
    </>
  );
};

const ribbon: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sky)', line: 'var(--color-sea-deep)' }, tone);
  const shape = { fill: c.fill, stroke: c.line, strokeWidth: 3, strokeLinejoin: 'round' as const };
  return (
    <>
      <path d="M30 34 21 52l5-1.5 2.5 4.5L34 35Z" {...shape} />
      <path d="M34 34l9 18-5-1.5-2.5 4.5L30 35Z" {...shape} />
      <path d="M31 31c-6-9-19-15-23-8-3.5 7 10 14 23 10Z" {...shape} />
      <path d="M33 31c6-9 19-15 23-8 3.5 7-10 14-23 10Z" {...shape} />
      <path
        d="M28 30.5c-4-3.5-10-5.5-14-5M36 30.5c4-3.5 10-5.5 14-5"
        stroke={c.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
        fill="none"
      />
      <rect x="27.5" y="27" width="9" height="10" rx="3.5" {...shape} />
      {HIGHLIGHT('M11.5 24.5c1.8-2.4 4.5-3 7.5-2.4')}
    </>
  );
};

// ---------- daily events (TIM.08: put the day in order) ----------
//
// Five pictures a child reads as one day without words: waking up (the sun rising behind a bed),
// breakfast (a bowl and spoon), lunch (a sandwich), dinner (a plate with a knife and fork) and
// bedtime (the same bed under a moon and stars). No letters and no clock faces (clocks belong to
// the time-telling skills). The two bed pictures differ by what is in the sky and by the blanket
// (warm by day, dark blue by night), so they stay apart even when small.

const METAL = { fill: 'var(--color-pebble)', line: 'var(--color-ink-soft)' };
const WOOD = { fill: 'var(--color-wood)', line: 'var(--color-wood-deep)' };

/** The bed of the two bed pictures: head and foot boards, mattress, pillow and a blanket. */
const bed = (blanket: { fill: string; line: string }) => (
  <>
    <rect x="5" y="27" width="8" height="28" rx="3" {...WOOD} stroke={WOOD.line} strokeWidth="3" />
    <rect x="51" y="38" width="8" height="17" rx="3" {...WOOD} stroke={WOOD.line} strokeWidth="3" />
    <rect
      x="11"
      y="45"
      width="42"
      height="8"
      rx="2"
      fill="var(--color-cloud)"
      stroke="var(--color-pebble-deep)"
      strokeWidth="3"
    />
    <rect
      x="14"
      y="37"
      width="13"
      height="9"
      rx="4"
      fill="var(--color-cloud)"
      stroke="var(--color-pebble-deep)"
      strokeWidth="3"
    />
    <path
      d="M27 41h25v12H27c-2.5-3-2.5-9 0-12Z"
      fill={blanket.fill}
      stroke={blanket.line}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M33 41v12"
      stroke={blanket.line}
      strokeWidth="2.5"
      strokeLinecap="round"
      opacity="0.5"
    />
  </>
);

const eventWakeUp: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-coral)', line: 'var(--color-coral-deep)' }, tone);
  return (
    <>
      <path
        d="M40 20v-6.5M52 25l4.3-4.3M28 25l-4.3-4.3M56.4 32.6l4.9-1.3M23.6 32.6l-4.9-1.3"
        stroke="var(--color-sun-deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle
        cx="40"
        cy="37"
        r="12"
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
      />
      {HIGHLIGHT('M33 31c1.5-2 3.5-3.3 6-3.8')}
      {bed(c)}
    </>
  );
};

const eventBreakfast: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sky)', line: 'var(--color-sea-deep)' }, tone);
  return (
    <>
      {band('M39 29 54 10', 3, METAL)}
      <path
        d="M7 30h50c0 14-10 24-25 24S7 44 7 30Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse
        cx="32"
        cy="30"
        rx="25"
        ry="6.5"
        fill="var(--color-cloud)"
        stroke={c.line}
        strokeWidth="3"
      />
      {[
        [21, 30],
        [29, 28.5],
        [36.5, 31.5],
        [27.5, 32.8],
        [44, 29.5],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="2.8"
          fill="var(--color-sunshine)"
          stroke="var(--color-sun-deep)"
          strokeWidth="1.5"
        />
      ))}
      <path d="M12 40h40" stroke={c.line} strokeWidth="2.5" opacity="0.45" />
      {HIGHLIGHT('M14.5 43c1.5 3.5 4 6 7.5 7.5')}
    </>
  );
};

const eventLunch: Draw = (tone) => {
  const bread = toneFill({ fill: 'var(--color-sand)', line: 'var(--color-wood-deep)' }, tone);
  const layer = { strokeWidth: 3, strokeLinejoin: 'round' as const };
  return (
    <>
      {/* The lower slice, then ham, cheese (a corner hanging over), lettuce, and the top slice
          seen a little from above, so it reads as sliced bread, not a bun. */}
      <rect
        x="8"
        y="46"
        width="48"
        height="8"
        rx="3"
        fill={bread.fill}
        stroke={bread.line}
        {...layer}
      />
      <rect
        x="7"
        y="41"
        width="50"
        height="6"
        rx="3"
        fill="var(--color-coral)"
        stroke="var(--color-coral-deep)"
        {...layer}
      />
      <path
        d="M9 37h46v4.5H37l-5 5.5-5-5.5H9Z"
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        {...layer}
      />
      <path
        d="M6 36c3-4.5 6 1.5 9.5-2s6 1.5 9.5-2 6 1.5 9.5-2 6 1.5 9.5-2 6 2 8 0c2 2.5 0 6-2 6H8c-2 0-3-2-2-4Z"
        fill="var(--color-leaf)"
        stroke="var(--color-leaf-deep)"
        {...layer}
      />
      <path d="M8 31v-2l8-11h32l8 11v2Z" fill={bread.fill} stroke={bread.line} {...layer} />
      <path
        d="M9.5 29h45"
        stroke={bread.line}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      {HIGHLIGHT('M20 22.5h13')}
    </>
  );
};

const eventDinner: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-cloud)', line: 'var(--color-pebble-deep)' }, tone);
  return (
    <>
      <circle cx="32" cy="35" r="16" fill={c.fill} stroke={c.line} strokeWidth="3" />
      <circle cx="32" cy="35" r="10.5" fill="none" stroke={c.line} strokeWidth="2" opacity="0.5" />
      <path
        d="M27 37.5c0-5 4-8 9-6.5 4 1.2 5 6 1.5 8.5s-10.5 2.5-10.5-2Z"
        fill="var(--color-coral)"
        stroke="var(--color-coral-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {[
        [26, 31],
        [24.5, 36.5],
        [29, 41.5],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="2.6"
          fill="var(--color-leaf)"
          stroke="var(--color-leaf-deep)"
          strokeWidth="1.5"
        />
      ))}
      {/* Fork (left) and knife (right), handles down. */}
      <path
        d="M4.5 15v8c0 3 1.5 4.5 3.5 4.5s3.5-1.5 3.5-4.5v-8M8 15v38"
        fill="none"
        stroke={METAL.line}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M57.5 14c-4.5 4-5.5 12-4.5 19h4.5Z"
        fill={METAL.fill}
        stroke={METAL.line}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M56 35v18" stroke={METAL.line} strokeWidth="4" strokeLinecap="round" />
      {HIGHLIGHT('M21.5 28c2-3 5-5 8.5-5.5')}
    </>
  );
};

const eventBedtime: Draw = (tone) => {
  const c = toneFill({ fill: 'var(--color-sea-deep)', line: 'var(--color-sea-dark)' }, tone);
  const glow = {
    fill: 'var(--color-sunshine)',
    stroke: 'var(--color-sun-deep)',
    strokeLinejoin: 'round' as const,
  };
  return (
    <>
      <path d="M43 6a12 12 0 1 0 13 17 10 10 0 0 1-13-17Z" {...glow} strokeWidth="3" />
      <path
        d="M22 9l1.8 3.7 3.7 1.8-3.7 1.8L22 20l-1.8-3.7-3.7-1.8 3.7-1.8Z"
        {...glow}
        strokeWidth="2"
      />
      <path
        d="M31 24l1.3 2.7 2.7 1.3-2.7 1.3L31 32l-1.3-2.7-2.7-1.3 2.7-1.3Z"
        {...glow}
        strokeWidth="2"
      />
      {bed(c)}
    </>
  );
};

const DRAWINGS: Readonly<Record<string, Draw>> = {
  stick,
  plank,
  // U05 (#14): containers, solid-shaped and scene objects that have no drawing above
  // (sprites-measure.tsx).
  ...MEASURE_DRAWINGS,
  button,
  thimble,
  spoon,
  cube,
  feather,
  apple,
  cup,
  coconut,
  rock,
  brick,
  melon,
  pumpkin,
  crate,
  log,
  balloon,
  anchor,
  kite,
  'fishing-rod': fishingRod,
  rope,
  ribbon,
  'event-wake-up': eventWakeUp,
  'event-breakfast': eventBreakfast,
  'event-lunch': eventLunch,
  'event-dinner': eventDinner,
  'event-bedtime': eventBedtime,
};

/** Sprite ids with their own drawing (others render as a pebble). */
export const SPRITE_IDS = [...Object.keys(FELT_KINDS), ...Object.keys(DRAWINGS)];

/** The narration key that names a sprite (ui.sprite.<id>), for labels and spoken names. */
export function spriteNameKey(sprite: SpriteId): NarrationKey {
  return `ui.sprite.${isFeltKind(sprite) || sprite in DRAWINGS ? sprite : 'pebble'}`;
}

export interface ObjectSpriteProps {
  sprite: SpriteId;
  tone?: SpriteTone;
  /**
   * Which face a crab wears (from 48 px up; the body never changes). Pass the object's identity
   * (its `obj-<i>` index), never its position or render order, so it keeps its face for as long
   * as it exists. Other sprites ignore it.
   */
  variant?: number;
  className?: string;
}

/** One countable object (decorative SVG; the surrounding control names it). */
export function ObjectSprite({ sprite, tone = 'a', variant = 0, className }: ObjectSpriteProps) {
  const grain = `ni-grain${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const legacy = DRAWINGS[sprite];
  const felt = legacy === undefined;
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
      data-felt={felt ? '' : undefined}
      data-variant={sprite === 'crab' ? variant : undefined}
    >
      {felt ? (
        <>
          <defs>
            <pattern id={grain} width={64} height={64} patternUnits="userSpaceOnUse">
              <image href={grainUrl} width={64} height={64} />
            </pattern>
          </defs>
          {drawFelt(isFeltKind(sprite) ? sprite : 'pebble', tone, grain, variant)}
        </>
      ) : (
        legacy(tone)
      )}
    </svg>
  );
}
