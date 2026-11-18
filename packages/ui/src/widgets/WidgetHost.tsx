import type {
  InteractionEvent,
  ItemFormat,
  ResponseValue,
  Tier,
  WidgetConfig,
} from '@number-island/shared';
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type LazyExoticComponent,
  lazy,
  type ReactNode,
  Suspense,
  useMemo,
} from 'react';
import { createDemoController, type WidgetDemo } from './demo';
import { PlaceholderWidget } from './PlaceholderWidget';
import { widgetRegistry } from './registry';
import type { WidgetLoader, WidgetProps, WidgetRegistry } from './types';

type AnyWidget = ComponentType<WidgetProps<WidgetConfig>>;

const lazyCache = new WeakMap<WidgetLoader, LazyExoticComponent<AnyWidget>>();

function lazyWidget(loader: WidgetLoader): LazyExoticComponent<AnyWidget> {
  let component = lazyCache.get(loader);
  if (!component) {
    component = lazy(loader as unknown as () => Promise<{ default: AnyWidget }>);
    lazyCache.set(loader, component);
  }
  return component;
}

function loaderFor(registry: WidgetRegistry, format: ItemFormat): WidgetLoader | undefined {
  return registry[format] as WidgetLoader | undefined;
}

/** Starts loading a format's widget ahead of time (06 §8: prefetch the recommended workshop). */
export function preloadWidget(format: ItemFormat, registry: WidgetRegistry = widgetRegistry): void {
  void loaderFor(registry, format)?.().catch(() => {});
}

export interface WidgetHostProps {
  config: WidgetConfig;
  tier: Tier;
  disabled?: boolean;
  onResponse: (response: ResponseValue) => void;
  onInteract?: (event: InteractionEvent) => void;
  /** A lesson's DemoController (createDemoController). Omit outside lessons. */
  demo?: WidgetDemo;
  /**
   * Identity of the item shown (e.g. the GeneratedItem's template id and seed). A new value
   * remounts the widget with fresh state, even when the format is the same: one widget instance
   * shows one item.
   */
  itemKey?: string | number;
  /** Override the registry (stories, tests). Defaults to the app's widgetRegistry. */
  registry?: WidgetRegistry;
  className?: string;
}

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/** Shows the placeholder if the widget throws. Keyed per item, so a new item starts clean. */
class WidgetErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ui] widget failed; showing the placeholder', error, info.componentStack);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const noop = () => {};

/**
 * Renders the registered widget for `config.format` with the registry props contract
 * (widgets/README.md). Unregistered formats, and widgets that fail to load or render, show the
 * PlaceholderWidget. While a widget's chunk loads, the area stays empty: child screens never show
 * skeleton loaders (06 §8).
 */
export function WidgetHost({
  config,
  tier,
  disabled = false,
  onResponse,
  onInteract = noop,
  demo,
  itemKey,
  registry = widgetRegistry,
  className,
}: WidgetHostProps) {
  const instanceKey = `${config.format}:${itemKey ?? ''}`;
  const fallbackDemo = useMemo(() => createDemoController(), []);
  const props: WidgetProps<WidgetConfig> = {
    config,
    tier,
    disabled,
    onResponse,
    onInteract,
    demo: demo ?? fallbackDemo,
  };
  const loader = loaderFor(registry, config.format);
  const placeholder = <PlaceholderWidget key={instanceKey} {...props} />;
  let body: ReactNode = placeholder;
  if (loader) {
    const Widget = lazyWidget(loader);
    body = (
      <WidgetErrorBoundary key={instanceKey} fallback={placeholder}>
        <Suspense fallback={<div className="ni-widget__loading" />}>
          <Widget {...props} />
        </Suspense>
      </WidgetErrorBoundary>
    );
  }
  return (
    <div
      className={['ni-widget', className].filter(Boolean).join(' ')}
      data-format={config.format}
      data-tier={tier}
      data-registered={loader ? 'true' : 'false'}
    >
      {body}
    </div>
  );
}
