// Road Crew's workshop definition (02 §5.6; 05 §4 W1): the crew that makes the stones of the
// Numbered Road, by counting on and back, filling missing numbers, hopping and ordering. Only the
// definition is here; the screen loads on demand.

import type { AppWorkshop } from '../types';

export const roadCrew: AppWorkshop = {
  id: 'road-crew',
  name: 'Road Crew',
  formats: ['hundred-chart', 'number-line-jump', 'tap-count', 'order'],
  strands: ['CNT', 'CMP'],
  building: 'road-crew',
  produces: ['stone'],
  load: () => import('./RoadCrewWorkshop'),
};
