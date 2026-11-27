// The guides a child chooses (05 §1, §10): the registry, the drawing and the name tag.

export { GuideProvider, useGuide } from './context';
export { Guide, type GuideProps } from './Guide';
export { GuideCheer } from './GuideCheer';
export { GuideNameTag } from './GuideNameTag';
export { GUIDES, type GuideDef, guideById, guideLabel, isKnownGuide } from './registry';
export { GUIDE_MOODS, type GuideMood } from './types';
