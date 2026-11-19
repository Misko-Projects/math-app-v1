import type { FormatModel, ShapeComposeState } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import type { TraceRecorder } from '../../interaction/trace';
import type { WidgetDemo } from '../demo';
import type { AvailableSize } from '../kit/useAvailableSize';
import type { ConfigFor } from '../types';

/** Room for the Check button (icon only in K, with its word from G1). */
export const CHECK_W = 190;

/** 03 §5.5 shape-compose ops, plus the generic answer op. */
export const OPS = ['drag-piece', 'rotate', 'draw-edge', 'highlight-region', 'answer'] as const;

export type Config = ConfigFor<'shape-compose'>;

/** What the mode components share (ShapeComposeWidget owns the state and the response). */
export interface ModeProps {
  config: Config;
  tier: 'concrete' | 'pictorial' | 'abstract';
  model: FormatModel<'shape-compose', ShapeComposeState>;
  state: ShapeComposeState;
  apply: (action: WidgetAction) => void;
  interactive: boolean;
  setDemoBusy: (busy: boolean) => void;
  trace: TraceRecorder;
  submit: () => void;
  response: ResponseValue | null;
  demo: WidgetDemo;
  avail: AvailableSize | null;
}

/** "Take one back": undoes the last piece or line (06 §4: an undo, never a penalty). */
export function UndoButton({
  label,
  disabled,
  onPress,
  invited,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  invited?: boolean;
}) {
  return (
    <button
      type="button"
      className={['ni-scomp__undo', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
    >
      <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true" focusable="false">
        <path
          d="M14 18h16a10 10 0 0 1 0 20H18"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M20 8 8 18l12 10z" fill="var(--color-ink)" />
      </svg>
    </button>
  );
}
