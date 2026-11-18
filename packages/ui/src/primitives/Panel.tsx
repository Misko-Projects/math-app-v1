import type { ElementType, ReactNode } from 'react';

export interface PanelProps {
  children?: ReactNode;
  /** A heading drawn in the display face. */
  title?: ReactNode;
  tone?: 'paper' | 'sand' | 'sky' | 'wood';
  /** Render as a section (with an accessible name from `title`) or a plain div. */
  as?: 'div' | 'section';
  className?: string;
  'aria-label'?: string;
}

/** A soft, rounded card surface: paper, sand, sky or driftwood (05 §11). */
export function Panel({
  children,
  title,
  tone = 'paper',
  as = 'div',
  className,
  'aria-label': ariaLabel,
}: PanelProps) {
  const Tag: ElementType = as;
  return (
    <Tag
      className={['ni-panel', className].filter(Boolean).join(' ')}
      data-tone={tone}
      aria-label={ariaLabel}
    >
      {title ? <h2 className="ni-panel__title">{title}</h2> : null}
      {children}
    </Tag>
  );
}
