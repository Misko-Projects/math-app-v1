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
 * in Storybook). States must stay distinct in every column by shape, outline and position.
 */
export function CvdCompare({ children, col = 260 }: { children: ReactNode; col?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${col}px, 1fr))`,
        gap: 20,
        width: 'min(1200px, 100%)',
      }}
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        {CVD_FILTERS.filter((f) => f.matrix).map((f) => (
          <filter key={f.id} id={`art-cvd-${f.id}`}>
            <feColorMatrix type="matrix" values={f.matrix as string} />
          </filter>
        ))}
      </svg>
      {CVD_FILTERS.map((f) => (
        <figure
          key={f.id}
          className="story-cell"
          style={{
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
