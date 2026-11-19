import type { ReactNode } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { type ArtProps, ArtSvg } from '../core/ArtSvg';
import { paint, STROKE } from '../core/paint';
import { ContactShadow } from '../core/Shading';

/** Material icons are drawn on a 64 × 64 design square (crisp at 48 px and at 96 px). */
export const MATERIAL_DESIGN_SIZE = 64;

export interface MaterialSvgProps extends ArtProps {
  id: string;
  /** Half-width of the contact shadow. */
  shadow: number;
  /** y of the contact shadow (the ground line). */
  ground?: number;
  children: ReactNode;
}

/** The root of every material icon: the design square, a contact shadow and a test hook. */
export function MaterialSvg({ id, shadow, ground = 56, children, ...art }: MaterialSvgProps) {
  return (
    <ArtSvg
      width={MATERIAL_DESIGN_SIZE}
      height={MATERIAL_DESIGN_SIZE}
      {...art}
      rootProps={{ 'data-material': id }}
    >
      <ContactShadow cx={32} cy={ground} rx={shadow} ry={4.5} />
      {children}
    </ArtSvg>
  );
}

/**
 * The silhouette line of an icon: a stroke-only path laid over the faces, in a dark shade that
 * keeps the icon ≥ 3:1 on paper, sand and the product tray (materials/contrast.ts). Inner seams
 * stay in each fill's own lighter outline shade (OUTLINE_OF), so the icon reads as one chunky
 * product with soft inner detail.
 */
export function Contour({ d, color }: { d: string; color: PaletteColor }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={paint(color)}
      strokeWidth={STROKE.outline}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/** A short highlight stroke on the lit (top-left) side. */
export function Shine({
  d,
  width = 3.5,
  opacity = 0.75,
}: {
  d: string;
  width?: number;
  opacity?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={paint('cloud')}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
    />
  );
}

/** A four-point glint (gems, light, star shards). */
export function Glint({ x, y, r = 5 }: { x: number; y: number; r?: number }) {
  const k = r * 0.28;
  return (
    <path
      d={`M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`}
      fill={paint('cloud')}
      stroke={paint('sunshine-deep')}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  );
}
