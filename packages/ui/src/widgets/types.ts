import type {
  InteractionEvent,
  ItemFormat,
  ResponseValue,
  Tier,
  WidgetConfig,
} from '@number-island/shared';
import type { ComponentType } from 'react';
import type { WidgetDemo } from './demo';

/** The WidgetConfig variant for one format (03 §5.5). */
export type ConfigFor<F extends ItemFormat> = Extract<WidgetConfig, { format: F }>;

/**
 * The props every widget receives: the registry contract (U01; 02 §5.2, 03 §5.5, §6.3).
 * See widgets/README.md for the full contract.
 */
export interface WidgetProps<C extends WidgetConfig = WidgetConfig> {
  /** Everything the widget needs to render this item (`GeneratedItem.widget`). */
  config: C;
  /** CPA tier to render (05 §4 rule 4): draggable objects, a drawn picture, or symbols. */
  tier: Tier;
  /** No input: demo playback, feedback showing, or waiting for the runner. */
  disabled: boolean;
  /**
   * The child's answer, once per submission (the widget's own "check" or end-state action). The
   * widget never judges correctness: the runner calls `checkResponse` (03 §5.5).
   */
  onResponse: (response: ResponseValue) => void;
  /** Every manipulative interaction, in order, for the trace (03 §5.1). */
  onInteract: (event: InteractionEvent) => void;
  /** Demo mode for lessons and hints (03 §6.3). Bind it with `useWidgetDemo`. */
  demo: WidgetDemo;
}

/** A widget component for one format. */
export type WidgetComponent<F extends ItemFormat = ItemFormat> = ComponentType<
  WidgetProps<ConfigFor<F>>
>;

/** Lazily loads a format's widget, so each widget ships in its workshop's chunk (02 §6). */
export type WidgetLoader<F extends ItemFormat = ItemFormat> = () => Promise<{
  default: WidgetComponent<F>;
}>;

/** format → widget loader. Exactly one widget per format (02 §5.2); missing formats show a placeholder. */
export type WidgetRegistry = { readonly [F in ItemFormat]?: WidgetLoader<F> };
