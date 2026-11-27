/**
 * A guide's moods (05 §1): `idle` at rest, `talk` while its line is spoken, `point` showing the
 * child where to look, `cheer` when a request is done, `think` during a lesson. Every guide has
 * every mood.
 */
export type GuideMood = 'idle' | 'talk' | 'point' | 'cheer' | 'think';
export const GUIDE_MOODS: readonly GuideMood[] = ['idle', 'talk', 'point', 'cheer', 'think'];
