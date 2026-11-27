import type { WidgetConfig } from '@number-island/shared';
import { BigButton } from '../primitives/BigButton';
import { ArrowIcon, CrateIcon } from '../primitives/icons';
import { SpeechBubble } from '../primitives/SpeechBubble';
import { useWidgetDemo } from './demo';
import type { WidgetProps } from './types';

/**
 * Shown for a format with no registered widget (or one that failed to load). The guide says the game is
 * still being built, and "next" answers `skip` so the session moves on instead of getting stuck.
 * In development a tag names the missing format.
 */
export function PlaceholderWidget({
  config,
  disabled,
  onResponse,
  demo,
}: WidgetProps<WidgetConfig>) {
  // No demo ops: any op is unsupported (throws in development, skipped in production).
  useWidgetDemo(demo, { ops: [], play: async () => {}, invite: () => {} });
  return (
    <div className="ni-placeholder" data-format={config.format}>
      <div className="ni-placeholder__art">
        <CrateIcon />
      </div>
      <SpeechBubble say="ui.widget.coming-soon" tail="left" tone="sky" />
      <BigButton
        label="ui.btn.next"
        icon={<ArrowIcon tone="light" />}
        tone="sea"
        disabled={disabled}
        onPress={() => onResponse({ kind: 'skip' })}
      />
      {import.meta.env?.DEV ? (
        <code className="ni-placeholder__dev" aria-hidden="true">
          {config.format}
        </code>
      ) : null}
    </div>
  );
}
