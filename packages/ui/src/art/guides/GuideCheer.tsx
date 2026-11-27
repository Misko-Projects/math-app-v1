import { Guide } from './Guide';

/**
 * The child's guide cheering at the stage corner on a right answer (05 §1): about a second, then
 * gone. An overlay that takes no layout room (placed absolutely in the stage's own box), never
 * takes a touch, and is hidden from screen readers (the right-answer cue already speaks). Under
 * reduced motion it only fades.
 */
export function GuideCheer({ guide }: { guide: string | null | undefined }) {
  return (
    <div className="ni-guide-cheer" aria-hidden="true" data-testid="guide-cheer">
      <Guide guide={guide} mood="cheer" height={104} />
    </div>
  );
}
