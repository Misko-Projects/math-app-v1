import type { NarrationKey } from '@number-island/shared';
import { IconButton } from './IconButton';
import { HomeIcon, LightbulbIcon, SpeakerIcon } from './icons';
import type { SpeakLabel } from './usePress';

interface PresetProps {
  onPress?: () => void;
  disabled?: boolean;
  caption?: boolean;
  speak?: SpeakLabel;
  /** Override the default narration key. */
  label?: NarrationKey;
  className?: string;
}

/** 05 §4 rule 6: the big "home" button returns to the island at any time. */
export function HomeButton({ label = 'ui.btn.home', ...props }: PresetProps) {
  return <IconButton label={label} icon={<HomeIcon />} tone="cloud" {...props} />;
}

export interface HintButtonProps extends PresetProps {
  /** The runner suggests a hint (proactive nudge): the lightbulb glows. */
  glow?: boolean;
}

/** 06 §2: the lightbulb hint button. Disabled when the hint ladder is used up. */
export function HintButton({
  label = 'ui.btn.hint',
  glow = false,
  className,
  ...props
}: HintButtonProps) {
  return (
    <IconButton
      label={label}
      icon={<LightbulbIcon />}
      tone="cloud"
      className={['ni-hint', className].filter(Boolean).join(' ')}
      data={{ 'data-glow': glow ? 'true' : undefined }}
      {...props}
    />
  );
}

export interface ReplayButtonProps extends PresetProps {
  /** Narration is playing: the speaker's waves ripple. */
  playing?: boolean;
}

/**
 * 06 §5: every instruction has a replay button. It never speaks its own label, because pressing it
 * replays the prompt.
 */
export function ReplayButton({
  label = 'ui.btn.replay',
  playing = false,
  className,
  speak = 'never',
  ...props
}: ReplayButtonProps) {
  return (
    <IconButton
      label={label}
      icon={<SpeakerIcon tone="light" />}
      tone="sea"
      speak={speak}
      className={['ni-replay', className].filter(Boolean).join(' ')}
      data={{ 'data-playing': playing ? 'true' : undefined }}
      {...props}
    />
  );
}
