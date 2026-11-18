import type { WidgetAction } from '@number-island/shared';
import { useEffect, useRef } from 'react';

/**
 * Demo mode (03 §6.3). A lesson or hint drives a widget through a DemoController it owns; the
 * widget implements the ops through `useWidgetDemo`.
 */

/** What a widget implements for demo mode. */
export interface WidgetDemoImpl {
  /** The ops this widget can animate (its format's op list, 03 §5.5). */
  ops: readonly string[];
  /** Animate one op and resolve when the animation ends (instantly with reduced motion). */
  play: (action: WidgetAction) => Promise<void>;
  /** Highlight the target of a child step (pulsing outline, hand pointer); null clears it. */
  invite: (action: WidgetAction | null) => void;
}

/** The `demo` prop every widget receives (WidgetProps.demo). */
export interface WidgetDemo {
  /** Play one op. Waits for the widget to mount. See DemoController for unsupported ops. */
  play: (action: WidgetAction) => Promise<void>;
  /** Highlight the target of a child step, or clear the highlight with null. */
  invite: (action: WidgetAction | null) => void;
  /** Ops the mounted widget supports (empty until it mounts). */
  readonly ops: readonly string[];
  /** @internal The widget registers its implementation here (useWidgetDemo). */
  bind: (impl: WidgetDemoImpl) => () => void;
}

/** A widget received an op its format doesn't define (03 §6.3). */
export class UnsupportedWidgetOpError extends Error {
  constructor(
    readonly op: string,
    readonly supported: readonly string[],
  ) {
    super(`Widget does not support demo op "${op}" (supports: ${supported.join(', ') || 'none'})`);
    this.name = 'UnsupportedWidgetOpError';
  }
}

export interface DemoControllerOptions {
  /**
   * 03 §6.3: an unsupported op throws in development and is skipped in production.
   * Defaults to `import.meta.env.DEV`.
   */
  strict?: boolean;
  /** Warn sink for skipped ops in production (default console.warn). */
  warn?: (message: string) => void;
  /**
   * Error sink for an unsupported op in an invite queued before the widget mounted, in
   * development (default console.error).
   */
  error?: (err: UnsupportedWidgetOpError) => void;
}

/**
 * Creates the controller a lesson host passes as a widget's `demo` prop and drives with
 * `play()` / `invite()`. Calls made before the widget mounts wait for it. A remount re-binds.
 */
export function createDemoController(options: DemoControllerOptions = {}): WidgetDemo {
  const strict = options.strict ?? Boolean(import.meta.env?.DEV);
  const warn = options.warn ?? ((m: string) => console.warn(m));
  const error = options.error ?? ((e: UnsupportedWidgetOpError) => console.error(e));
  let impl: WidgetDemoImpl | null = null;
  let waiting: (() => void)[] = [];
  let pendingInvite: WidgetAction | null | undefined;

  const whenBound = () =>
    impl ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve));

  const unsupported = (action: WidgetAction, supported: readonly string[]) => {
    const err = new UnsupportedWidgetOpError(action.op, supported);
    if (strict) throw err;
    warn(`[ui] ${err.message}; skipped`);
  };

  return {
    get ops() {
      return impl?.ops ?? [];
    },
    async play(action) {
      // A waiter resumes a microtask after bind, by which time the widget may have unbound again
      // (a remount): wait until one is actually bound.
      let current = impl;
      while (!current) {
        await whenBound();
        current = impl;
      }
      if (!current.ops.includes(action.op)) {
        unsupported(action, current.ops);
        return;
      }
      await current.play(action);
    },
    invite(action) {
      if (!impl) {
        pendingInvite = action;
        return;
      }
      if (action && !impl.ops.includes(action.op)) {
        unsupported(action, impl.ops);
        return;
      }
      impl.invite(action);
    },
    bind(next) {
      impl = next;
      const ready = waiting;
      waiting = [];
      for (const resolve of ready) resolve();
      if (pendingInvite !== undefined) {
        const action = pendingInvite;
        pendingInvite = undefined;
        if (action === null || next.ops.includes(action.op)) {
          next.invite(action);
        } else {
          // Same policy as a live invite, except that in development it is reported through
          // `error` rather than thrown: bind runs in the widget's mount effect, and a throw there
          // would tear down the widget tree.
          const err = new UnsupportedWidgetOpError(action.op, next.ops);
          if (strict) error(err);
          else warn(`[ui] ${err.message}; skipped`);
        }
      }
      return () => {
        if (impl === next) impl = null;
      };
    },
  };
}

/**
 * Registers a widget's demo implementation on its `demo` prop for as long as it is mounted. The
 * latest `play`/`invite` closures are always used, so they may read current state.
 */
export function useWidgetDemo(demo: WidgetDemo | undefined, impl: WidgetDemoImpl): void {
  const latest = useRef(impl);
  latest.current = impl;
  const opsKey = impl.ops.join('|');
  useEffect(() => {
    if (!demo) return;
    const ops = opsKey ? opsKey.split('|') : [];
    return demo.bind({
      ops,
      play: (action) => latest.current.play(action),
      invite: (action) => latest.current.invite(action),
    });
  }, [demo, opsKey]);
}

/** Resolves after `ms` (0 resolves on the next task). For demo animations. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
