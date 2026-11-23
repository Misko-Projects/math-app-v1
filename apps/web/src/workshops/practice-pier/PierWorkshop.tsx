// Practice Pier as a workshop module (02 §5.6): the island's request, played on the pier's screen.
// The pier's own summary screen comes before the exit, so every way out reports `completed` when
// the request ran to its end and `child-exit` otherwise; a wind-down ends the request itself.

import type { AppWorkshopProps } from '../types';
import { PierRequest } from './PierPage';

export default function PierWorkshop({ runner, onExit }: AppWorkshopProps) {
  return (
    <PierRequest
      runner={runner}
      onLeave={(summary) =>
        onExit(
          summary.reason === 'wind-down'
            ? 'wind-down'
            : summary.reason === 'child-exit'
              ? 'child-exit'
              : 'completed',
        )
      }
    />
  );
}
