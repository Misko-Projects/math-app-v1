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
 */
export function usePixiEffect(
  active: boolean,
  host: RefObject<HTMLDivElement | null>,
  designWidth: number,
  build: PixiBuild,
  onFinish: () => void,
): PixiStatus {
  const [status, setStatus] = useState<PixiStatus>('idle');
  const buildRef = useLatest(build);
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
    let app: Application | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const teardown = () => {
      if (app) {
        const a = app;
        app = null;
        a.ticker?.stop();
        a.destroy({ removeView: true }, { children: true });
      }
      releaseCanvasSlot(owner);
    };
    (async () => {
      try {
        const pixi = await loadPixi();
        const el = host.current;
        if (cancelled || !el) return;
        const width = el.clientWidth || designWidth;
        const height = el.clientHeight || designWidth * 0.75;
        const a = new pixi.Application();
        await a.init({
          width,
          height,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          preference: 'webgl',
        });
        if (cancelled) {
          a.destroy({ removeView: true }, { children: true });
          return;
        }
        app = a;
        Object.assign(a.canvas.style, {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
        });
        a.canvas.setAttribute('aria-hidden', 'true');
        a.canvas.dataset.effectCanvas = 'pixi';
        el.appendChild(a.canvas);
        const update = buildRef.current(pixi, a, width / designWidth);
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
  }, [active, host, designWidth, buildRef, finishRef]);

  return status;
}
