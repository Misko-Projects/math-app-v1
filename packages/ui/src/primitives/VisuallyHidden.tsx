import type { ReactNode } from 'react';

const hiddenStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Text for screen readers only (06 §7), e.g. a label for an icon-only button. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span style={hiddenStyle}>{children}</span>;
}
