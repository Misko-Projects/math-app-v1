import { type FormatModel, formatModel, type ShapeComposeState } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useSubmitGuard } from '../kit';
import { useAvailableSize } from '../kit/useAvailableSize';
import type { WidgetProps } from '../types';
import { DotGrid } from './DotGrid';
import { FillOutline } from './FillOutline';
import { PlaceRelative } from './PlaceRelative';
import type { Config } from './shared';
import './shape-compose.css';

/**
 * `shape-compose` (03 §5.5), concrete and pictorial (02 §5.9 K1):
 * - `fill-outline`: fill an outline with pattern blocks or shapes (`compose.fill`);
 * - `place-relative`: put an item where a position word says (`compose.relative`);
 * - `draw-on-grid`, `build-sticks`: draw a closed shape on dots or build it with sticks
 *   (`grid.polygon`).
 * The widget keeps the engine model's state; every response comes from
 * `formatModel('shape-compose').toResponse`.
 *
 * Demo ops: `drag-piece {id, to, rot, layer?}`, `rotate {id}`, `draw-edge {from, to}`,
 * `highlight-region {relation}`, plus `answer`.
 */
export function ShapeComposeWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = formatModel('shape-compose') as
    | FormatModel<'shape-compose', ShapeComposeState>
    | undefined;
  if (!model) throw new Error('shape-compose has no engine model');
  const trace = useInteractionTrace(onInteract);
  const root = useRef<HTMLDivElement>(null);
  const avail = useAvailableSize(root);
  const [state, setState] = useState<ShapeComposeState>(() => model.initialState(config));
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;
  const apply = (a: WidgetAction) => setState((s) => model.apply(s, a));
  const response = model.toResponse(state);
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });
  const props = {
    config,
    tier,
    model,
    state,
    apply,
    interactive,
    setDemoBusy,
    trace,
    submit,
    response,
    demo,
    avail,
  };
  return (
    <div
      ref={root}
      className="ni-scomp"
      data-mode={config.mode}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      {config.mode === 'fill-outline' ? (
        <FillOutline {...props} />
      ) : config.mode === 'place-relative' ? (
        <PlaceRelative {...props} />
      ) : (
        <DotGrid {...props} />
      )}
    </div>
  );
}

export default ShapeComposeWidget;
