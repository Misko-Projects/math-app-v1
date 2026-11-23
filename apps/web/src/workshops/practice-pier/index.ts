// Practice Pier's workshop definition (02 §5.6; 05 §4): the plain pier that hosts every format
// and produces whatever the request asks for. Only the definition is here; the screen loads on
// demand.

import { ITEM_FORMATS } from '@number-island/shared';
import type { AppWorkshop } from '../types';

export const practicePier: AppWorkshop = {
  id: 'practice-pier',
  name: 'Practice Pier',
  formats: [...ITEM_FORMATS],
  strands: [],
  building: 'practice-pier',
  produces: [],
  load: () => import('./PierWorkshop'),
};
