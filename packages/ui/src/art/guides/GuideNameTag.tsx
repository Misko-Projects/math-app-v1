import { guideById } from './registry';

/**
 * The guide's name on its felt tag (05 §1). Inside a control that already says who the guide is,
 * the tag is decorative; on its own it carries the accessible name ("22, the bunny").
 */
export function GuideNameTag({
  guide,
  fontSize = 28,
  decorative = false,
  className,
}: {
  guide: string | null | undefined;
  fontSize?: number;
  decorative?: boolean;
  className?: string;
}) {
  const def = guideById(guide);
  return (
    <span
      className={className ? `ni-name-tag ${className}` : 'ni-name-tag'}
      style={{ fontSize }}
      data-guide-tag={def.id}
      aria-hidden={decorative ? true : undefined}
    >
      {def.name}
      {/* Read as "22, the bunny" (a screen reader says the numeral as twenty-two). */}
      {decorative ? null : <span className="ni-visually-hidden">, the {def.animal}</span>}
    </span>
  );
}
