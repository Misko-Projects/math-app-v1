// @number-island/ui: design tokens, primitives, math widgets, avatar renderer, art kit, sfx (02 §2).
// Styles: import "@number-island/ui/theme.css", "@number-island/ui/primitives.css" and
// "@number-island/ui/art.css" after Tailwind.

// Art kit (05 §11, U02): island, road, buildings, characters, decor and effects as SVG components.
export * from './art';
// Audio (02 §5.5, A01): AudioManager, narration stitching, Web Speech fallback, SFX and music.
export * from './audio';

// Interaction primitives (06 §4, §7).
export {
  distanceToRect,
  findSnapTarget,
  type Point,
  type Rect,
  rectCenter,
} from './interaction/snap';
export { type TraceRecorder, useInteractionTrace } from './interaction/trace';
export {
  type DragItemProps,
  type DragToTarget,
  type DragToTargetOptions,
  useDragToTarget,
} from './interaction/useDragToTarget';
export {
  type PlaceEvent,
  type PlaceItemOptions,
  type PlaceTargetOptions,
  type PlaceVia,
  type TapToPlace,
  type TapToPlaceOptions,
  useTapToPlace,
} from './interaction/useTapToPlace';
// Preferences: age mode, reduced motion, tap-only, snap radius, audio, narration text.
export {
  type NarrationTextResolver,
  type UiPreferences,
  UiProvider,
  type UiProviderProps,
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useSystemReducedMotion,
  useUiPreferences,
} from './preferences/UiProvider';
// Primitives (06 §2, §4–§6).
export { BigButton, type BigButtonProps, type ButtonTone } from './primitives/BigButton';
export { CategoryMark, type CategoryMarkProps } from './primitives/CategoryMark';
export { IconButton, type IconButtonProps } from './primitives/IconButton';
export * as icons from './primitives/icons';
export { NumberDisplay, type NumberDisplayProps } from './primitives/NumberDisplay';
export { Panel, type PanelProps } from './primitives/Panel';
export { ProductTray, type ProductTrayProps, type TrayItem } from './primitives/ProductTray';
export {
  HintButton,
  type HintButtonProps,
  HomeButton,
  ReplayButton,
  type ReplayButtonProps,
} from './primitives/presets';
export { Sheet, type SheetProps } from './primitives/Sheet';
export { type BubbleTail, SpeechBubble, type SpeechBubbleProps } from './primitives/SpeechBubble';
export type { SpeakLabel } from './primitives/usePress';
export { VisuallyHidden } from './primitives/VisuallyHidden';
// Design tokens (TypeScript mirror of theme.css).
export * from './tokens/tokens';
// Widget registry (02 §5.2, 03 §6.3); see widgets/README.md.
export {
  createDemoController,
  type DemoControllerOptions,
  UnsupportedWidgetOpError,
  useWidgetDemo,
  type WidgetDemo,
  type WidgetDemoImpl,
} from './widgets/demo';
export { StimulusView, type StimulusViewProps } from './widgets/kit/StimulusView';
export { PlaceholderWidget } from './widgets/PlaceholderWidget';
export { registeredFormats, widgetRegistry } from './widgets/registry';
export type {
  ConfigFor,
  WidgetComponent,
  WidgetLoader,
  WidgetProps,
  WidgetRegistry,
} from './widgets/types';
export { preloadWidget, WidgetHost, type WidgetHostProps } from './widgets/WidgetHost';
