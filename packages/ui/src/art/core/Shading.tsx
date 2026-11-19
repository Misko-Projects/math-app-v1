import { paint } from './paint';

/**
 * The two shading marks every art piece uses (05 §11: "one soft highlight and a contact shadow").
 * No gradients: the shadow is a flat, translucent ink ellipse and the highlight a flat, translucent
 * cloud shape.
 */

export interface ContactShadowProps {
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
  /** 0–1. Default 0.18: soft enough to read as ground contact, never a dark blob. */
  opacity?: number;
}

/** The soft oval under anything that stands on the ground. */
export function ContactShadow({ cx, cy, rx, ry = rx * 0.28, opacity = 0.18 }: ContactShadowProps) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={paint('ink')} opacity={opacity} />;
}

export interface HighlightProps {
  /** An SVG path for the highlight shape (usually a short crescent on the lit side, top-left). */
  d: string;
  opacity?: number;
}

/** The one soft highlight, on the top-left (the island's light always comes from the top-left). */
export function Highlight({ d, opacity = 0.42 }: HighlightProps) {
  return <path d={d} fill={paint('cloud')} opacity={opacity} />;
}
