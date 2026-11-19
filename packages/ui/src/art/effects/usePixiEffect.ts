import type { Application } from 'pixi.js';
import { type RefObject, useEffect, useState } from 'react';
import { acquireCanvasSlot, loadPixi, releaseCanvasSlot, webglAvailable } from './pixi';
import { useLatest } from './playhead';

/** How a live Pixi effect is being drawn. */
export type PixiStatus = 'idle' | 'pixi' | 'svg' | 'done';

export type PixiModule = typeof import('pixi.js');

/**
 * Builds the scene once Pixi is ready and returns the per-frame update: given the ms since the
 * start, it positions the sprites and returns true when the effect is finished.
 */
export type PixiBuild = (
  pixi: PixiModule,
  app: Application,
  scale: number,
) => (ms: number) => boolean;

/**
 * Runs a particle effect on a lazily loaded Pixi canvas inside `host` (02 §1, §6): pixi.js is
 * imported only here, on first use; the effect takes the single WebGL canvas slot and destroys its
 * canvas on finish or unmount. When WebGL is unavailable (headless CI) or the slot is taken, the
 * status is `svg` and the caller draws its small SVG fallback instead of crashing.
 *
 * `build` is the run: memoise it on the particle layout. A new `build` (a new seed, count or
 * duration in place) tears the canvas down and plays the new scene from the start. The slot is
 * held until the effect's Application is destroyed, including one still initialising when the
 * effect is cancelled, so two WebGL contexts never overlap.
 */
export function usePixiEffect(
  active: boolean,
  host: RefObject<HTMLDivElement | null>,
  designWidth: number,
  build: PixiBuild,
  onFinish: () => void,
): PixiStatus {
  const [status, setStatus] = useState<PixiStatus>('idle');
  const finishRef = useLatest(onFinish);

  useEffect(() => {
    if (!active) {
      setStatus('idle');
      return;
    }
    const owner = Symbol('pixi-effect');
    if (!webglAvailable() || !acquireCanvasSlot(owner)) {
      setStatus('svg');
      return;
    }
    setStatus('pixi');
    let cancelled = false;
    /** True while `Application.init` is in flight: it may still create a WebGL context. */
    let initialising = false;
    let app: Application | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const teardown = () => {
      if (app) {
        const a = app;
        app = null;
        a.ticker?.stop();
        a.destroy({ removeView: true }, { children: true });
      }
      // During an init the slot stays taken: once the init settles, its Application is
      // destroyed and only then is the slot released (below).
      if (!initialising) releaseCanvasSlot(owner);
    };
    (async () => {
      try {
        const pixi = await loadPixi();
        const el = host.current;
        if (cancelled || !el) return;
        const width = el.clientWidth || designWidth;
        const height = el.clientHeight || designWidth * 0.75;
        const a = new pixi.Application();
        initialising = true;
        try {
          await a.init({
            width,
            height,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: Math.min(2, window.devicePixelRatio || 1),
            preference: 'webgl',
          });
        } finally {
          initialising = false;
        }
        app = a;
        if (cancelled) {
          // Cancelled while initialising: destroy it, then let go of the slot.
          teardown();
          return;
        }
        Object.assign(a.canvas.style, {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
        });
        a.canvas.setAttribute('aria-hidden', 'true');
        a.canvas.dataset.effectCanvas = 'pixi';
        el.appendChild(a.canvas);
        const update = build(pixi, a, width / designWidth);
        const start = performance.now();
        update(0);
        a.ticker.add(() => {
          if (!app) return;
          if (update(performance.now() - start)) {
            a.ticker.stop();
            // Destroy outside the ticker callback.
            timer = setTimeout(() => {
              teardown();
              if (!cancelled) {
                setStatus('done');
                finishRef.current();
              }
            }, 0);
          }
        });
      } catch {
        teardown();
        if (!cancelled) setStatus('svg');
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      teardown();
    };
  }, [active, host, designWidth, build, finishRef]);

  return status;
}
