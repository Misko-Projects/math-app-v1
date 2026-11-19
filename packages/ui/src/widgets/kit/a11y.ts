/**
 * ARIA for a static picture: a named `img` when it has a label, otherwise hidden (it is decoration
 * inside a control or region that names it).
 */
export function pictureProps(
  label: string | undefined,
): { role: 'img'; 'aria-label': string } | { 'aria-hidden': true } {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
}
