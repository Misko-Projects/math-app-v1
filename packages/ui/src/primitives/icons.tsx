import type { ReactElement, SVGProps } from 'react';

/**
 * Chunky, rounded icons in the island style (05 §11): flat fills, a 3 px darker outline and one
 * soft highlight. All original. Icons are decorative (aria-hidden); the control around them carries
 * the accessible name. `tone="light"` draws a white glyph for dark buttons.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  tone?: 'color' | 'light';
}

function Svg({
  children,
  tone: _tone,
  ...props
}: IconProps & { children: ReactElement[] | ReactElement }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

const INK = 'var(--color-ink)';

export function HomeIcon({ tone = 'color', ...props }: IconProps) {
  const light = tone === 'light';
  return (
    <Svg {...props}>
      <path
        d="M10 23.5 24 11l14 12.5V38a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 10 38V23.5Z"
        fill={light ? '#fff' : 'var(--color-paper)'}
        stroke={light ? '#fff' : INK}
        strokeWidth="3"
      />
      <path
        d="M6 25 24 9l18 16"
        stroke={light ? '#fff' : 'var(--color-coral-deep)'}
        strokeWidth="4.5"
      />
      <path
        d="M20 40.5v-9a4 4 0 0 1 8 0v9"
        fill={light ? 'var(--color-sea-deep)' : 'var(--color-sea)'}
        stroke={light ? 'var(--color-sea-deep)' : INK}
        strokeWidth="3"
      />
    </Svg>
  );
}

export function LightbulbIcon({ tone = 'color', ...props }: IconProps) {
  const light = tone === 'light';
  return (
    <Svg {...props}>
      <path
        d="M24 6.5c-7.5 0-13 5.6-13 12.6 0 4.5 2.3 7.6 4.7 10 1.4 1.4 2.3 3 2.3 5v1.4h12v-1.4c0-2 .9-3.6 2.3-5 2.4-2.4 4.7-5.5 4.7-10 0-7-5.5-12.6-13-12.6Z"
        fill={light ? '#fff' : 'var(--color-sunshine)'}
        stroke={light ? '#fff' : INK}
        strokeWidth="3"
      />
      <path
        d="M18.5 15.5c1-2.4 3-3.8 5.5-4.1"
        stroke={light ? 'var(--color-sea-deep)' : '#fff'}
        strokeWidth="3"
        opacity={light ? 0.6 : 0.85}
      />
      <path d="M18.5 40h11M20.5 44h7" stroke={light ? '#fff' : INK} strokeWidth="3" />
    </Svg>
  );
}

export function SpeakerIcon({
  tone = 'color',
  waves = 2,
  ...props
}: IconProps & { waves?: 0 | 1 | 2 }) {
  const light = tone === 'light';
  const stroke = light ? '#fff' : INK;
  return (
    <Svg {...props}>
      <path
        d="M8 19.5a2.5 2.5 0 0 1 2.5-2.5H16l9-7.5v29L16 31h-5.5A2.5 2.5 0 0 1 8 28.5v-9Z"
        fill={light ? '#fff' : 'var(--color-sea)'}
        stroke={stroke}
        strokeWidth="3"
      />
      <path
        d="M31 18.5c1.6 1.5 2.5 3.4 2.5 5.5s-.9 4-2.5 5.5"
        stroke={stroke}
        strokeWidth="3.5"
        opacity={waves >= 1 ? 1 : 0}
        className="ni-wave ni-wave-1"
      />
      <path
        d="M35.5 13.5c3 2.8 4.8 6.5 4.8 10.5s-1.8 7.7-4.8 10.5"
        stroke={stroke}
        strokeWidth="3.5"
        opacity={waves >= 2 ? 1 : 0}
        className="ni-wave ni-wave-2"
      />
    </Svg>
  );
}

export function CheckIcon({ tone = 'color', ...props }: IconProps) {
  return (
    <Svg {...props}>
      <path d="m10 25 9 9 19-20" stroke={tone === 'light' ? '#fff' : INK} strokeWidth="6" />
    </Svg>
  );
}

export function CloseIcon({ tone = 'color', ...props }: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="m14 14 20 20M34 14 14 34"
        stroke={tone === 'light' ? '#fff' : INK}
        strokeWidth="5.5"
      />
    </Svg>
  );
}

export function ArrowIcon({ tone = 'color', ...props }: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M10 24h26M26 13l11 11-11 11"
        stroke={tone === 'light' ? '#fff' : INK}
        strokeWidth="5.5"
      />
    </Svg>
  );
}

/** A left arrow: "go back" (closing a sheet returns to the scene). */
export function BackIcon({ tone = 'color', ...props }: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M38 24H12M22 13 11 24l11 11"
        stroke={tone === 'light' ? '#fff' : INK}
        strokeWidth="5.5"
      />
    </Svg>
  );
}

export function StarIcon({ tone = 'color', ...props }: IconProps) {
  const light = tone === 'light';
  return (
    <Svg {...props}>
      <path
        d="m24 6 5.3 11 12 1.6-8.8 8.3 2.2 11.9L24 33.1l-10.7 5.7 2.2-11.9-8.8-8.3 12-1.6L24 6Z"
        fill={light ? '#fff' : 'var(--color-sunshine)'}
        stroke={light ? '#fff' : INK}
        strokeWidth="3"
      />
    </Svg>
  );
}

/**
 * The demo-mode "hand pointer" (03 §6.3): a friendly gloved hand whose finger points down, so it
 * can sit just above the target it invites the child to use.
 */
/**
 * Where the pointing hand's fingertip is drawn, as fractions of its box (the finger's rounded end,
 * x 20 and y 6.5 of the 48-unit path; `down` is the same path flipped). Placement code and tests
 * share these, so "on the target" means the drawn fingertip.
 */
export const HAND_POINTER_TIP = {
  up: { x: 20 / 48, y: 6.5 / 48 },
  down: { x: 20 / 48, y: 41.5 / 48 },
} as const;

export interface HandPointerIconProps extends IconProps {
  /** Which way the finger points: `down` (default) onto something below, `up` at something above. */
  direction?: 'down' | 'up';
}

export function HandPointerIcon({ direction = 'down', ...props }: HandPointerIconProps) {
  return (
    <Svg data-direction={direction} {...props}>
      <g transform={direction === 'up' ? undefined : 'matrix(1 0 0 -1 0 48)'}>
        <path
          d="M20 6.5a3.5 3.5 0 0 1 3.5 3.5v12.2l1-.2a3.3 3.3 0 0 1 3.9 2.3l.3-.1a3.3 3.3 0 0 1 4 2.4 3.3 3.3 0 0 1 4.3 3.2v5.5c0 5.7-4.6 10.2-10.3 10.2h-1.8c-3.2 0-6.2-1.5-8.1-4.1l-6.4-8.6a3.3 3.3 0 0 1 4.9-4.4l1.2 1.2V10A3.5 3.5 0 0 1 20 6.5Z"
          fill="#fff"
          stroke={INK}
          strokeWidth="3"
        />
        <path d="M28.4 24.3v5M33.2 26.6v4" stroke={INK} strokeWidth="2.5" />
      </g>
    </Svg>
  );
}

/** A wooden crate with a hammer resting on its lid: "still being built". */
export function CrateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="22" cy="43" rx="18" ry="2.5" fill="rgb(38 70 83 / 0.16)" />
      <rect
        x="5"
        y="18"
        width="32"
        height="23"
        rx="3"
        fill="var(--color-wood)"
        stroke={INK}
        strokeWidth="2.5"
      />
      <path
        d="M5 25.5h32M5 33h32M13 18v23M29 18v23"
        stroke="var(--color-wood-deep)"
        strokeWidth="2"
        opacity="0.8"
      />
      <path d="M7.5 21h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <rect x="5" y="18" width="32" height="23" rx="3" stroke={INK} strokeWidth="2.5" />
      <g transform="rotate(-32 30 14)">
        <rect
          x="17"
          y="12.5"
          width="22"
          height="4.5"
          rx="2.25"
          fill="var(--color-sun)"
          stroke={INK}
          strokeWidth="2"
        />
        <rect
          x="36"
          y="7"
          width="8"
          height="15.5"
          rx="2"
          fill="var(--color-pebble-deep)"
          stroke={INK}
          strokeWidth="2"
        />
      </g>
    </Svg>
  );
}
