// The engine's view of a child (02 §5.8 `ChildContext`), built from the profile and settings.

import type { AgeBand, ChildContext, ChildProfile, ChildSettings } from '@number-island/shared';

const AGE_BAND: Record<ChildProfile['grade'], AgeBand> = {
  K: '5-6',
  '1': '5-6',
  '2': '7-8',
  '3': '7-8',
  '4': '9-10',
  '5': '9-10',
  '6': '11-12',
  '7': '11-12',
  '8': '13-14',
  HS: '13-14',
};

export function childContext(profile: ChildProfile, settings: ChildSettings): ChildContext {
  return {
    childId: profile.id,
    grade: profile.grade,
    ageBand: AGE_BAND[profile.grade],
    advanced: profile.advanced,
    isK: profile.grade === 'K',
    settings,
  };
}
