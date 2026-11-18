/**
 * Colour-vision deficiency simulation matrices (06 §7: verify the palette with a CVD simulation in
 * Storybook), applied with an SVG `feColorMatrix`. Used by the Foundations and Art Gallery stories.
 */
export interface CvdFilter {
  id: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
  name: string;
  /** feColorMatrix `values`, or null for typical vision. */
  matrix: string | null;
}

export const CVD_FILTERS: readonly CvdFilter[] = [
  { id: 'none', name: 'Typical vision', matrix: null },
  {
    id: 'protanopia',
    name: 'Protanopia',
    matrix: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  },
  {
    id: 'deuteranopia',
    name: 'Deuteranopia',
    matrix: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  },
  {
    id: 'tritanopia',
    name: 'Tritanopia',
    matrix: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
  },
  {
    id: 'achromatopsia',
    name: 'Achromatopsia',
    matrix: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0',
  },
];

/** Apply a 4×5 feColorMatrix to an #rrggbb colour (for contrast checks under simulated CVD). */
export function simulateCvd(hex: string, filter: CvdFilter): string {
  if (!filter.matrix) return hex;
  const m = filter.matrix.trim().split(/\s+/).map(Number);
  const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const out = [0, 1, 2].map((row) => {
    const r = m.slice(row * 5, row * 5 + 5);
    const v =
      (r[0] ?? 0) * (rgb[0] ?? 0) +
      (r[1] ?? 0) * (rgb[1] ?? 0) +
      (r[2] ?? 0) * (rgb[2] ?? 0) +
      (r[4] ?? 0);
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
