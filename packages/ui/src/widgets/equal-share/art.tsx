import type { ReactNode } from 'react';

/**
 * Art for the equal-share widget, in the island style (05 §11): cozy flat vector, a 3 px darker
 * outline, one soft highlight and a contact shadow. All original. Everything is decorative
 * (aria-hidden): the control or region around it carries the name.
 *
 * Pebblings are drawn as small round pebble critters with a sprout on top: no blocks, no numbers
 * and no pebbles to count on their bodies (a Pebbling's own number is never part of a share), so
 * they look nothing like Numberblocks or DragonBox Nooms (AGENTS.md, content and art rules).
 */

const INK = 'var(--color-ink)';
const INK_SOFT = 'var(--color-ink-soft)';

function Svg({ children, viewBox = '0 0 48 48' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Body colours for the pebblings round the table (decoration only, never a quantity). */
const PEBBLING_TONES = [
  { fill: 'var(--color-pebble)', line: INK_SOFT, cheek: 'var(--color-coral)' },
  { fill: 'var(--color-sand)', line: 'var(--color-wood-deep)', cheek: 'var(--color-coral)' },
  { fill: 'var(--color-shallows)', line: 'var(--color-sea-dark)', cheek: 'var(--color-sun)' },
  {
    fill: 'var(--color-sunshine-light)',
    line: 'var(--color-sun-deep)',
    cheek: 'var(--color-coral)',
  },
] as const;

/** A Pebbling: a round, smooth pebble critter with big eyes, a smile, stubby feet and a sprout. */
export function PebblingArt({ variant = 0 }: { variant?: number }) {
  const c = PEBBLING_TONES[variant % PEBBLING_TONES.length] ?? PEBBLING_TONES[0];
  return (
    <Svg viewBox="0 0 100 100">
      {/* Feet. */}
      <ellipse cx="36" cy="88" rx="9" ry="5.5" fill={c.fill} stroke={c.line} strokeWidth="3" />
      <ellipse cx="64" cy="88" rx="9" ry="5.5" fill={c.fill} stroke={c.line} strokeWidth="3" />
      {/* Sprout. */}
      <path d="M50 26c0-7 1-12 4-15" stroke="var(--color-leaf-deep)" strokeWidth="3.5" />
      <path
        d="M54 12c5-5 13-5 17-2-3 5-10 8-17 2Z"
        fill="var(--color-leaf-light)"
        stroke="var(--color-leaf-deep)"
        strokeWidth="3"
      />
      <path
        d="M51 17c-4-5-11-6-15-3 3 5 9 7 15 3Z"
        fill="var(--color-leaf)"
        stroke="var(--color-leaf-deep)"
        strokeWidth="3"
      />
      {/* Little arms held out, ready to be given something. */}
      <path d="M14 60c-6 1-9 5-9 9" stroke={c.line} strokeWidth="4" />
      <path d="M86 60c6 1 9 5 9 9" stroke={c.line} strokeWidth="4" />
      {/* The round pebble body. */}
      <path
        d="M50 24c24 0 38 17 38 37 0 17-15 26-38 26S12 78 12 61c0-20 14-37 38-37Z"
        fill={c.fill}
        stroke={c.line}
        strokeWidth="3"
      />
      <path
        d="M24 46c3-7 9-12 17-14"
        stroke="#fff"
        strokeWidth="4"
        opacity="0.65"
        strokeLinecap="round"
      />
      {/* Face. */}
      <ellipse cx="38" cy="57" rx="5.5" ry="7" fill={INK} />
      <ellipse cx="62" cy="57" rx="5.5" ry="7" fill={INK} />
      <circle cx="40" cy="54.5" r="2" fill="#fff" />
      <circle cx="64" cy="54.5" r="2" fill="#fff" />
      <ellipse cx="28" cy="67" rx="5" ry="3" fill={c.cheek} opacity="0.55" />
      <ellipse cx="72" cy="67" rx="5" ry="3" fill={c.cheek} opacity="0.55" />
      <path d="M43 69c4 4 10 4 14 0" stroke={INK} strokeWidth="3" />
    </Svg>
  );
}

/** A friendly seagull sitting on a wooden post. */
export function SeagullArt() {
  return (
    <Svg viewBox="0 0 100 116">
      {/* The post, with a rope round it. */}
      <path
        d="M36 66h28v42c0 2-2 4-4 4H40c-2 0-4-2-4-4V66Z"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <ellipse
        cx="50"
        cy="66"
        rx="14"
        ry="4"
        fill="var(--color-sand)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path d="M43 76v28M57 76v28" stroke="var(--color-wood-deep)" strokeWidth="2" opacity="0.5" />
      <path d="M36 86c9 4 19 4 28 0" stroke="var(--color-sand-deep)" strokeWidth="4" />
      {/* Feet on the post. */}
      <path d="M44 64v-6M56 64v-6" stroke="var(--color-sun-deep)" strokeWidth="3.5" />
      <path d="M40 64h8M52 64h8" stroke="var(--color-sun-deep)" strokeWidth="3.5" />
      {/* Tail and body. */}
      <path d="M22 44l-12 6 14 2" fill="var(--color-pebble)" stroke={INK_SOFT} strokeWidth="3" />
      <path
        d="M20 44c0-12 12-20 28-20 14 0 24 8 24 20 0 10-10 16-26 16-16 0-26-6-26-16Z"
        fill="var(--color-cloud)"
        stroke={INK_SOFT}
        strokeWidth="3"
      />
      {/* Wing. */}
      <path
        d="M24 42c6-6 18-8 28-4-4 9-16 13-28 4Z"
        fill="var(--color-pebble)"
        stroke={INK_SOFT}
        strokeWidth="3"
      />
      {/* Head, eye and beak. */}
      <circle cx="66" cy="22" r="13" fill="var(--color-cloud)" stroke={INK_SOFT} strokeWidth="3" />
      <path
        d="M77 22l14 3-14 5c-2-2-2-6 0-8Z"
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
      />
      <circle cx="69" cy="19" r="3" fill={INK} />
      <circle cx="70" cy="18" r="1" fill="#fff" />
      <path d="M60 14c3-3 8-3 11-1" stroke="#fff" strokeWidth="3" opacity="0.8" />
    </Svg>
  );
}

// ---------- icons (48 × 48) ----------

const dot = (cx: number, cy: number, fill = 'var(--color-coral)', key?: string) => (
  <circle
    key={key ?? `${cx}-${cy}`}
    cx={cx}
    cy={cy}
    r="4.5"
    fill={fill}
    stroke="var(--color-coral-deep)"
    strokeWidth="2"
  />
);

/** "Give one to each": one counter fans out to three spots. */
export function DealRoundIcon() {
  return (
    <Svg>
      <circle cx="24" cy="10" r="6" fill="var(--color-sunshine)" stroke={INK} strokeWidth="3" />
      <path d="M20 16 10 30M24 17v13M28 16l10 14" stroke="var(--color-cloud)" strokeWidth="3.5" />
      <path
        d="M6 27l4 4 3-5M21 28l3 4 3-4M35 26l3 5 4-4"
        stroke="var(--color-cloud)"
        strokeWidth="3"
      />
      <ellipse
        cx="9"
        cy="40"
        rx="7"
        ry="4"
        fill="var(--color-cloud)"
        stroke={INK}
        strokeWidth="2.5"
      />
      <ellipse
        cx="24"
        cy="40"
        rx="7"
        ry="4"
        fill="var(--color-cloud)"
        stroke={INK}
        strokeWidth="2.5"
      />
      <ellipse
        cx="39"
        cy="40"
        rx="7"
        ry="4"
        fill="var(--color-cloud)"
        stroke={INK}
        strokeWidth="2.5"
      />
    </Svg>
  );
}

/** A small seagull head. */
function GullHead({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="16" cy="16" r="12" fill="var(--color-cloud)" stroke={INK} strokeWidth="3" />
      <path
        d="M26 15l12 3-12 4c-1-2-1-5 0-7Z"
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        strokeWidth="2.5"
      />
      <circle cx="19" cy="13" r="2.6" fill={INK} />
    </g>
  );
}

/** "Give the seagull what is left": a counter hops to the seagull. */
export function GiveSeagullIcon() {
  return (
    <Svg>
      <GullHead x={14} y={6} scale={0.95} />
      <path d="M6 40c2-10 6-14 12-14" stroke="var(--color-cloud)" strokeWidth="3.5" />
      <path d="M13 23l5 3-4 4" stroke="var(--color-cloud)" strokeWidth="3" />
      <circle cx="7" cy="41" r="5" fill="var(--color-sunshine)" stroke={INK} strokeWidth="2.5" />
    </Svg>
  );
}

/** The seagull region and the leftover ask. */
export function SeagullIcon() {
  return (
    <Svg>
      <GullHead x={2} y={6} scale={1.15} />
    </Svg>
  );
}

/** Reason: the shares are not the same (a tall stack beside a short one, with ≠). */
export function UnequalIcon() {
  return (
    <Svg>
      <rect x="3" y="40" width="16" height="4" rx="2" fill={INK} />
      <rect x="29" y="40" width="16" height="4" rx="2" fill={INK} />
      {dot(11, 34)}
      {dot(11, 24)}
      {dot(11, 14)}
      {dot(37, 34)}
      <path d="M20 22h8M20 28h8M27 18l-6 14" stroke={INK} strokeWidth="2.8" />
    </Svg>
  );
}

/** Reason: there are enough to go round again (a round arrow). */
export function GoRoundIcon() {
  return (
    <Svg>
      <path d="M38 22a14 14 0 1 1-6-11" stroke={INK} strokeWidth="4" />
      <path d="M26 6l7 5-5 7" stroke={INK} strokeWidth="4" />
      {dot(24, 24, 'var(--color-sunshine)')}
    </Svg>
  );
}

/** A woven basket (region icon; empty: the reason the seagull has nothing to take). */
export function BasketIcon({ empty = false }: { empty?: boolean }) {
  return (
    <Svg>
      {empty ? null : (
        <>
          {dot(17, 17, 'var(--color-sunshine)')}
          {dot(27, 15, 'var(--color-sunshine)')}
          {dot(33, 20, 'var(--color-sunshine)')}
        </>
      )}
      <path
        d="M6 22h36l-4 18c-1 3-3 4-6 4H16c-3 0-5-1-6-4L6 22Z"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path d="M9 30h30M11 37h26" stroke="var(--color-wood-deep)" strokeWidth="2.5" />
      <path d="M18 22v21M30 22v21" stroke="var(--color-wood-deep)" strokeWidth="2" opacity="0.6" />
      {empty ? <path d="M15 12h18" stroke={INK} strokeWidth="3" strokeDasharray="3 5" /> : null}
    </Svg>
  );
}

/** A pebbling's face (region icon). */
export function PebblingIcon() {
  return (
    <Svg>
      <path
        d="M24 9c12 0 19 9 19 19 0 9-8 14-19 14S5 37 5 28C5 18 12 9 24 9Z"
        fill="var(--color-pebble)"
        stroke={INK_SOFT}
        strokeWidth="3"
      />
      <ellipse cx="18" cy="26" rx="3" ry="4" fill={INK} />
      <ellipse cx="30" cy="26" rx="3" ry="4" fill={INK} />
      <path d="M20 33c2.5 2 5.5 2 8 0" stroke={INK} strokeWidth="2.5" />
      <path d="M24 9c0-3 1-5 3-6" stroke="var(--color-leaf-deep)" strokeWidth="2.5" />
    </Svg>
  );
}

/** A plate (region icon). */
export function PlateIcon() {
  return (
    <Svg>
      <ellipse
        cx="24"
        cy="27"
        rx="20"
        ry="13"
        fill="var(--color-paper)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
      />
      <ellipse cx="24" cy="26" rx="12" ry="7" stroke="var(--color-sun)" strokeWidth="2.5" />
    </Svg>
  );
}

/** "How many for each?": one counter landing on one plate. */
export function AskEachIcon() {
  return (
    <Svg>
      <ellipse
        cx="24"
        cy="36"
        rx="18"
        ry="7"
        fill="var(--color-paper)"
        stroke={INK}
        strokeWidth="3"
      />
      <path d="M24 6v14" stroke={INK} strokeWidth="3" />
      <path d="M19 15l5 6 5-6" stroke={INK} strokeWidth="3" />
      {dot(24, 33, 'var(--color-sunshine)')}
    </Svg>
  );
}

/** Two shares side by side: equal (fair, with =) or not (not fair, with ≠). */
function Shares({ left, right, equal }: { left: number; right: number; equal: boolean }) {
  const stack = (x: number, n: number) =>
    Array.from({ length: n }, (_, i) => dot(x, 36 - i * 9, 'var(--color-coral)', `${x}-${i}`));
  return (
    <Svg>
      <rect x="2" y="42" width="17" height="4" rx="2" fill={INK} />
      <rect x="29" y="42" width="17" height="4" rx="2" fill={INK} />
      {stack(10.5, left)}
      {stack(37.5, right)}
      <path d="M20 22h8M20 29h8" stroke={INK} strokeWidth="3" />
      {equal ? null : <path d="M27 17l-6 16" stroke={INK} strokeWidth="3" />}
    </Svg>
  );
}

export const FairIcon = () => <Shares left={3} right={3} equal />;
export const NotFairIcon = () => <Shares left={3} right={1} equal={false} />;

/** "Is it fair?": a level balance. */
export function AskFairIcon() {
  return (
    <Svg>
      <path d="M24 8v32M14 42h20M6 16h36" stroke={INK} strokeWidth="3.5" />
      <path
        d="M6 16l-4 10h8l-4-10ZM42 16l-4 10h8l-4-10Z"
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="2.5"
      />
    </Svg>
  );
}

/** Even: pairs of dots, every one with a partner. */
export function EvenIcon() {
  return (
    <Svg>
      {[10, 24, 38].map((y) => (
        <g key={y}>
          <rect x="7" y={y - 6} width="34" height="12" rx="6" stroke={INK} strokeWidth="2.5" />
          {dot(15, y)}
          {dot(33, y)}
        </g>
      ))}
    </Svg>
  );
}

/** Odd: pairs, plus one left over without a partner. */
export function OddIcon() {
  return (
    <Svg>
      {[10, 24].map((y) => (
        <g key={y}>
          <rect x="7" y={y - 6} width="34" height="12" rx="6" stroke={INK} strokeWidth="2.5" />
          {dot(15, y)}
          {dot(33, y)}
        </g>
      ))}
      {dot(15, 38, 'var(--color-sunshine)')}
      <path d="M27 38h12" stroke={INK} strokeWidth="2.5" strokeDasharray="2 4" />
    </Svg>
  );
}

/** "Even or odd?": a pair and a single. */
export function AskEvenOddIcon() {
  return (
    <Svg>
      <rect x="4" y="12" width="24" height="12" rx="6" stroke={INK} strokeWidth="2.5" />
      {dot(10, 18)}
      {dot(22, 18)}
      {dot(36, 18, 'var(--color-sunshine)')}
      <path d="M20 32c0-3 2-5 4-5s4 1.5 4 4c0 3-4 3-4 6M24 42v.5" stroke={INK} strokeWidth="3" />
    </Svg>
  );
}
