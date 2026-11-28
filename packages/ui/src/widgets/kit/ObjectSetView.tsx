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
/** Whether an object's centre lies in the frame cell whose top-left is (`cx`, `cy`), in cells. */
export function cellFilled(objects: readonly PlacedObject[], cx: number, cy: number): boolean {
  return objects.some((o) => {
    const x = o.x + o.scale / 2;
    const y = o.y + o.scale / 2;
    return x >= cx && x < cx + 1 && y >= cy && y < cy + 1;
  });
}

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
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: frame cells are positional
                    key={i}
                    className="ni-objects__cell"
                    // A cell an object covers draws no stitch under it (kit.css).
                    data-filled={
                      cellFilled(layout.objects, f.x + (i % f.cols), f.y + Math.floor(i / f.cols))
                        ? 'true'
                        : undefined
                    }
                  />
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
