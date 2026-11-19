import type { ReactNode } from 'react';
import { CVD_FILTERS } from '../../tokens/cvd';

// Art Gallery story helpers (stories only, not exported from the package).

/**
 * A labelled grid of art states (uses the Storybook preview's .story-grid / .story-cell). Cells sit
 * on a shared baseline, so captions line up even when the art differs in height.
 */
export function GalleryGrid({ children, col = 200 }: { children: ReactNode; col?: number }) {
  return (
    <div
      className="story-grid"
      style={{ ['--story-col' as string]: `${col}px`, alignItems: 'end' }}
    >
      {children}
    </div>
  );
}

export function GalleryCell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="story-cell" style={{ margin: 0 }}>
      {children}
      <figcaption className="story-cell__name">{name}</figcaption>
    </figure>
  );
}

export function GallerySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
      <h2 className="story-heading" style={{ margin: 0, justifySelf: 'start' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The same art under each simulated colour-vision deficiency (06 §7: verify with a CVD simulation
 * in Storybook). States must stay distinct in every column by shape, outline and position. Cards
 * wrap centred, so an odd last card sits in the middle, not alone at the left.
 */
export function CvdCompare({ children, col = 260 }: { children: ReactNode; col?: number }) {
  return (
    <div
      data-cvd-grid
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 20,
        width: 'min(1200px, 100%)',
        margin: '0 auto',
      }}
    >
      <CvdFilterDefs />
      {CVD_FILTERS.map((f) => (
        <figure
          key={f.id}
          className="story-cell"
          style={{
            boxSizing: 'border-box',
            flex: `0 1 ${col}px`,
            minWidth: 0,
            margin: 0,
            padding: 16,
            borderRadius: 28,
            background: 'var(--color-paper)',
            border: '3px solid var(--color-sand-deep)',
          }}
          data-cvd={f.id}
        >
          <div style={{ filter: f.matrix ? `url(#art-cvd-${f.id})` : undefined, width: '100%' }}>
            {children}
          </div>
          <figcaption className="story-cell__name">{f.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The CVD simulation filters (`url(#art-cvd-<id>)`), defined once per story. */
export function CvdFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      {CVD_FILTERS.filter((f) => f.matrix).map((f) => (
        <filter key={f.id} id={`art-cvd-${f.id}`}>
          <feColorMatrix type="matrix" values={f.matrix as string} />
        </filter>
      ))}
    </svg>
  );
}

export interface CvdMatrixColumn {
  key: string;
  label: string;
  /** Column width in CSS px. */
  width: number;
}

/** Fixed sizes of a CvdMatrix, so a page can work out how much room its art has. */
export const CVD_MATRIX = {
  labelW: 150,
  pad: 12,
  border: 3,
  headH: 20,
  gap: { row: 8, col: 16 },
} as const;

/**
 * 06 §7 colour-vision check as a labelled matrix: a row per simulation (typical vision first) and a
 * column per item, its name on top; each cell draws `cell(key)` through its row's filter, art
 * centred and bottom-aligned, so every row reads like the first.
 */
export function CvdMatrix({
  columns,
  cell,
  headSize = '0.95rem',
  rowGap = CVD_MATRIX.gap.row,
  colGap = CVD_MATRIX.gap.col,
}: {
  columns: readonly CvdMatrixColumn[];
  cell: (key: string) => ReactNode;
  headSize?: string;
  rowGap?: number;
  colGap?: number;
}) {
  const label = {
    margin: 0,
    whiteSpace: 'nowrap',
    lineHeight: `${CVD_MATRIX.headH}px`,
  } as const;
  return (
    <div
      data-cvd-matrix
      style={{
        display: 'grid',
        gridTemplateColumns: `${CVD_MATRIX.labelW}px ${columns.map((c) => `${c.width}px`).join(' ')}`,
        gap: `${rowGap}px ${colGap}px`,
        alignItems: 'end',
        justifyItems: 'center',
        justifyContent: 'center',
        padding: CVD_MATRIX.pad,
        borderRadius: 24,
        border: `${CVD_MATRIX.border}px solid var(--color-sand-deep)`,
        background: 'var(--color-paper)',
        boxSizing: 'border-box',
      }}
    >
      <CvdFilterDefs />
      <span />
      {columns.map((c) => (
        <span
          key={c.key}
          className="story-cell__name"
          style={{ ...label, fontSize: headSize }}
          data-col={c.key}
        >
          {c.label}
        </span>
      ))}
      {CVD_FILTERS.map((f) => (
        <div key={f.id} style={{ display: 'contents' }} data-cvd-row={f.id}>
          <span
            className="story-cell__name"
            style={{ ...label, justifySelf: 'start', alignSelf: 'center', textAlign: 'left' }}
          >
            {f.name}
          </span>
          {columns.map((c) => (
            <div
              key={c.key}
              data-cvd={f.id}
              data-cvd-cell={c.key}
              style={{
                display: 'flex',
                justifyContent: 'center',
                filter: f.matrix ? `url(#art-cvd-${f.id})` : undefined,
              }}
            >
              {cell(c.key)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
