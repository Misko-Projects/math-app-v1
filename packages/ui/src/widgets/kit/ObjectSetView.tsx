import type { CSSProperties, ReactNode } from 'react';
import { pictureProps } from './a11y';
import type { ObjectLayout, PlacedObject } from './layout';
import { ObjectSprite } from './sprites';
import './kit.css';

export interface ObjectSetViewProps {
  layout: ObjectLayout;
  /** Cell size in CSS px. Defaults to the largest size that fits `maxWidth` × `maxHeight`. */
  cell?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Smallest cell, for interactive objects that must stay tap-sized (06 §4). */
  minCell?: number;
  /** Render each object yourself (e.g. as a tap target). Receives the absolute-position style. */
  renderObject?: (object: PlacedObject, style: CSSProperties) => ReactNode;
  /** Accessible name of the picture (static pictures only; interactive ones name each object). */
  label?: string;
  className?: string;
}

/** The cell size that fits a layout into a box, clamped to [minCell, 112]. */
export function fitCell(
  layout: Pick<ObjectLayout, 'width' | 'height'>,
  maxWidth: number,
  maxHeight: number,
  minCell = 28,
): number {
  const fit = Math.min(maxWidth / layout.width, maxHeight / layout.height, 112);
  return Math.max(minCell, Math.floor(fit));
}

/**
 * Draws a laid-out object set (layout.ts): sprites at their cells, ten-frame outlines behind them.
 * Static by default (one `img` with `label`); pass `renderObject` to make objects interactive.
 */
export function ObjectSetView({
  layout,
  cell,
  maxWidth = 640,
  maxHeight = 320,
  minCell,
  renderObject,
  label,
  className,
}: ObjectSetViewProps) {
  const size = cell ?? fitCell(layout, maxWidth, maxHeight, minCell);
  const style = {
    '--cell': `${size}px`,
    width: layout.width * size,
    height: layout.height * size,
  } as CSSProperties;
  const interactive = renderObject !== undefined;
  return (
    <div
      className={['ni-objects', className].filter(Boolean).join(' ')}
      style={style}
      {...(interactive ? { role: 'group', 'aria-label': label } : pictureProps(label))}
    >
      {layout.frames.map((f) => {
        const kind = f.kind ?? 'grid';
        return (
          <div
            key={`${f.x}:${f.y}`}
            className="ni-objects__frame"
            data-kind={kind}
            aria-hidden="true"
            style={{
              left: f.x * size,
              top: f.y * size,
              width: f.cols * size,
              height: f.rows * size,
              gridTemplateColumns: kind === 'grid' ? `repeat(${f.cols}, 1fr)` : undefined,
            }}
          >
            {kind === 'grid'
              ? Array.from({ length: f.cols * f.rows }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: frame cells are positional
                  <span key={i} className="ni-objects__cell" />
                ))
              : null}
          </div>
        );
      })}
      {layout.objects.map((o) => {
        const objectStyle: CSSProperties = {
          left: o.x * size,
          top: o.y * size,
          width: o.scale * size,
          height: o.scale * size,
        };
        if (renderObject) return renderObject(o, objectStyle);
        return (
          <span
            key={`${o.kind}-${o.index}`}
            className="ni-objects__item"
            style={objectStyle}
            data-group={o.group}
            data-marked={o.marked ? 'true' : undefined}
          >
            <ObjectSprite sprite={o.sprite} tone={o.tone} variant={o.index} />
          </span>
        );
      })}
    </div>
  );
}
