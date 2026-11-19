import type { CSSProperties, ReactNode, Ref } from 'react';
import type { Lighting } from '../../tokens/tokens';

/** Props every art component accepts (05 §11 implementation note). */
export interface ArtProps {
  /** Rendered width (CSS length or px). Height follows the art's aspect ratio. Default: 100%. */
  size?: number | string;
  /**
   * Accessible name. Art is decorative by default (`aria-hidden`); pass a title when the art is
   * the only thing that says what it is (for example a gallery tile or a picture-only button).
   */
  title?: string;
  /** Day or sunset (05 §3). A standalone piece re-tints itself; inside a scene it inherits. */
  lighting?: Lighting;
  className?: string;
  style?: CSSProperties;
}

export interface ArtSvgProps extends ArtProps {
  /** viewBox width and height, in art units (the design size). */
  width: number;
  height: number;
  /** viewBox origin, when the art reaches outside 0,0 (for example a cast shadow). */
  originX?: number;
  originY?: number;
  /**
   * `width` (default): the art is `size` wide and its height follows. `fill`: the SVG fills its
   * container on both axes and the art scales to fit inside it, whole and centred (06 §1: the map
   * scales to fit, landscape or portrait); what it draws past its viewBox shows around it (a
   * full-screen scene bleeds its sky and sea, so no edge is ever unpainted). Give the container
   * `overflow: hidden`.
   */
  fit?: 'width' | 'fill';
  children: ReactNode;
  /** Extra attributes for the root (for example data-* test hooks). */
  rootProps?: Record<`data-${string}`, string | number | undefined>;
  /** A ref to the root `<svg>` (for example to measure how large the art is drawn). */
  svgRef?: Ref<SVGSVGElement>;
}

/**
 * The root of every art component: an SVG at its design size that scales to `size`. It carries
 * `data-lighting` so the theme's sunset remap (theme.css) applies to everything inside it.
 */
export function ArtSvg({
  width,
  height,
  originX = 0,
  originY = 0,
  size = '100%',
  fit = 'width',
  title,
  lighting,
  className,
  style,
  children,
  rootProps,
  svgRef,
}: ArtSvgProps) {
  const fill = fit === 'fill';
  return (
    <svg
      ref={svgRef}
      viewBox={`${originX} ${originY} ${width} ${height}`}
      width={fill ? '100%' : size}
      height={fill ? '100%' : undefined}
      preserveAspectRatio={fill ? 'xMidYMid meet' : undefined}
      style={{ display: 'block', overflow: 'visible', height: fill ? '100%' : 'auto', ...style }}
      className={className}
      data-lighting={lighting}
      data-fit={fill ? 'fill' : undefined}
      focusable="false"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rootProps}
    >
      {children}
    </svg>
  );
}
