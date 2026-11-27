import { ArtSvg } from '../core/ArtSvg';
import { FeltDefs } from './felt';
import { guideById, guideLabel } from './registry';
import type { GuideMood } from './types';

export interface GuideProps {
  /** The child's guide id (`ChildProfile.guide`); unknown or missing draws the first guide. */
  guide: string | null | undefined;
  mood?: GuideMood;
  /** Drawn height in CSS px; the width follows the guide's own proportions. */
  height: number;
  /**
   * Decorative by default (a name tag or a button says who it is). `labelled` gives the picture
   * its accessible name ("22, the bunny").
   */
  labelled?: boolean;
  /** A gentle idle bob (stopped under reduced motion by the theme). */
  bob?: boolean;
  className?: string;
}

/** A guide in one mood (05 §1): felt and stitch, the same at every size from 960×600 up. */
export function Guide({
  guide,
  mood = 'idle',
  height,
  labelled = false,
  bob = false,
  className,
}: GuideProps) {
  const def = guideById(guide);
  const { x, y, w, h } = def.box;
  const classes = [bob ? 'motion-safe:animate-bob' : '', className ?? ''].join(' ').trim();
  return (
    <ArtSvg
      originX={x}
      originY={y}
      width={w}
      height={h}
      size={(height * w) / h}
      title={labelled ? guideLabel(def) : undefined}
      className={classes || undefined}
      rootProps={{ 'data-character': 'guide', 'data-guide': def.id, 'data-mood': mood }}
    >
      <FeltDefs>
        <def.Figure mood={mood} />
      </FeltDefs>
    </ArtSvg>
  );
}
