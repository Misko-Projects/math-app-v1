import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect, fn, waitFor } from 'storybook/test';
import { UiProvider } from '../../preferences/UiProvider';
import { Confetti, Fireflies, fireflies, Sparkle, Splash } from '.';
import { acquireCanvasSlot, canvasSlotTaken, releaseCanvasSlot, setPixiTestDouble } from './pixi';
import type { PixiModule } from './usePixiEffect';

/*
 * Test only (not a gallery view, hidden from the sidebar and the visual snapshots): the effects'
 * lifetimes. Each play function mounts effects into its own React roots, drives them (rerenders,
 * unmounts, reduced motion on and off) and checks the canvas slot, the renderer and `onDone`.
 * The Pixi path runs on a fake pixi.js (setPixiTestDouble), because headless browsers usually
 * have no WebGL; the SVG fallback is forced by holding the canvas slot.
 */

/** A recording stand-in for a Pixi Graphics: the circle radii it drew, and its transform. */
class FakeGraphics {
  readonly radii: number[] = [];
  readonly position = {
    x: 0,
    y: 0,
    set: (x: number, y: number) => Object.assign(this.position, { x, y }),
  };
  readonly scale = { set: (_x: number, _y?: number) => {} };
  rotation = 0;
  alpha = 1;
  circle(_x: number, _y: number, r: number) {
    this.radii.push(r);
    return this;
  }
  poly() {
    return this;
  }
  roundRect() {
    return this;
  }
  fill() {
    return this;
  }
  stroke() {
    return this;
  }
}

/** Calls its listeners once a frame, like Pixi's ticker, until stopped. */
class FakeTicker {
  private readonly listeners: (() => void)[] = [];
  private raf = 0;
  private running = true;
  add(listener: () => void) {
    this.listeners.push(listener);
    const step = () => {
      if (!this.running) return;
      for (const l of this.listeners) l();
      if (this.running) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    return this;
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

interface FakeApp {
  readonly canvas: HTMLCanvasElement;
  readonly stage: { children: FakeGraphics[] };
  destroyed: boolean;
  /** Whether the canvas slot was still taken when this app was destroyed. */
  slotTakenAtDestroy: boolean | null;
}

/** A fake pixi.js module. With `deferInit`, every Application's init waits for `finishInit()`. */
function fakePixi({ deferInit = false } = {}) {
  const apps: FakeApp[] = [];
  let finishInit = () => {};
  const gate = deferInit
    ? new Promise<void>((resolve) => {
        finishInit = resolve;
      })
    : Promise.resolve();
  class Application implements FakeApp {
    readonly canvas = document.createElement('canvas');
    readonly ticker = new FakeTicker();
    readonly stage = {
      children: [] as FakeGraphics[],
      addChild: (...g: FakeGraphics[]) => {
        this.stage.children.push(...g);
      },
    };
    destroyed = false;
    slotTakenAtDestroy: boolean | null = null;
    constructor() {
      apps.push(this);
    }
    init() {
      return gate;
    }
    destroy() {
      this.destroyed = true;
      this.slotTakenAtDestroy = canvasSlotTaken();
      this.ticker.stop();
      this.canvas.remove();
    }
  }
  const module = { Application, Graphics: FakeGraphics } as unknown as PixiModule;
  setPixiTestDouble(async () => module);
  return {
    apps,
    finishInit: () => finishInit(),
    /** The app still alive (the last one not destroyed). */
    live: () => apps.findLast((a) => !a.destroyed),
    restore: () => setPixiTestDouble(null),
  };
}

/** A React root of its own inside the story, rendered synchronously. */
function mountRoot(host: HTMLElement) {
  const el = document.createElement('div');
  host.appendChild(el);
  const root = createRoot(el);
  return {
    el,
    render(node: ReactNode, { reduced = false, strict = false } = {}) {
      const tree = <UiProvider reducedMotion={reduced}>{node}</UiProvider>;
      flushSync(() => root.render(strict ? <StrictMode>{tree}</StrictMode> : tree));
    },
    renderer: () => el.querySelector<HTMLElement>('[data-effect]')?.dataset.renderer,
    unmount() {
      root.unmount();
      el.remove();
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Holds the one canvas slot, so effects draw their SVG fallback (with or without WebGL). */
function holdCanvasSlot() {
  const owner = Symbol('test');
  acquireCanvasSlot(owner);
  return () => releaseCanvasSlot(owner);
}

const meta = {
  title: 'Art Gallery/Effects/Lifecycle (tests)',
  tags: ['!dev', '!autodocs', '!visual'],
  parameters: { controls: { disable: true } },
  render: () => <section aria-label="Effect lifecycle tests" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A Pixi effect unmounted while its Application is still initialising keeps the canvas slot until
 * that Application has settled and been destroyed, so a second effect cannot open a second WebGL
 * context meanwhile (it draws the SVG fallback).
 */
export const SlotHeldWhileInitialising: Story = {
  play: async ({ canvasElement }) => {
    const pixi = fakePixi({ deferInit: true });
    const first = mountRoot(canvasElement);
    const second = mountRoot(canvasElement);
    try {
      first.render(<Confetti seed={1} count={4} />);
      await waitFor(() => expect(pixi.apps.length).toBe(1));
      await waitFor(() => expect(first.renderer()).toBe('pixi'));
      first.unmount();
      await expect(canvasSlotTaken(), 'the slot is held while init is pending').toBe(true);
      second.render(<Confetti seed={2} count={4} />);
      await waitFor(() => expect(second.renderer()).toBe('svg'));
      await expect(pixi.apps.length, 'no second Application').toBe(1);
      pixi.finishInit();
      const app = pixi.apps[0] as FakeApp;
      await waitFor(() => expect(app.destroyed).toBe(true));
      await expect(app.slotTakenAtDestroy, 'destroyed before the slot is released').toBe(true);
      await expect(canvasSlotTaken()).toBe(false);
      await expect(app.canvas.isConnected).toBe(false);
    } finally {
      first.unmount();
      second.unmount();
      pixi.restore();
    }
  },
};

/** Fireflies' Pixi circles for a layout: per fly a halo (two circles) and a core. */
const fireflyRadii = (seed: number, count: number) =>
  fireflies(seed, count, 3).flatMap((f) => [[f.r * 4, f.r * 2.2], [f.r * 1.1]]);
const sceneRadii = (app: FakeApp | undefined) => app?.stage.children.map((g) => g.radii);

/**
 * Changing seed, count or duration in place (same key) rebuilds the Pixi scene: the new layout is
 * drawn, and a newly finite firefly run ends, removes its canvas and calls `onDone` once.
 */
export const RebuildsInPlace: Story = {
  play: async ({ canvasElement }) => {
    const pixi = fakePixi();
    const lab = mountRoot(canvasElement);
    try {
      const onDone = fn();
      lab.render(<Fireflies seed={1} count={6} onDone={onDone} />);
      await waitFor(() => expect(sceneRadii(pixi.live())).toEqual(fireflyRadii(1, 6)));
      await waitFor(() => expect(lab.renderer()).toBe('pixi'));
      lab.render(<Fireflies seed={2} count={4} duration={300} onDone={onDone} />);
      await waitFor(() => expect(sceneRadii(pixi.live())).toEqual(fireflyRadii(2, 4)));
      await expect(pixi.apps.filter((a) => !a.destroyed).length, 'one live canvas').toBe(1);
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await waitFor(() => expect(lab.renderer()).toBe('done'));
      await expect(lab.el.querySelectorAll('canvas').length).toBe(0);
      await expect(canvasSlotTaken()).toBe(false);

      const confettiDone = fn();
      lab.render(<Confetti seed={1} count={4} onDone={confettiDone} />);
      await waitFor(() => expect(pixi.live()?.stage.children.length).toBe(4));
      lab.render(<Confetti seed={1} count={7} onDone={confettiDone} />);
      await waitFor(() => expect(pixi.live()?.stage.children.length).toBe(7));
      await waitFor(() => expect(confettiDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    } finally {
      lab.unmount();
      pixi.restore();
    }
    await expect(canvasSlotTaken()).toBe(false);
  },
};

/** Moves `performance.now()` (Motion's clock) on by `ms` while `during` runs. */
async function withClockAhead(ms: number, during: () => Promise<void>) {
  const realNow = performance.now.bind(performance);
  Object.defineProperty(performance, 'now', { configurable: true, value: () => realNow() + ms });
  try {
    await during();
  } finally {
    Reflect.deleteProperty(performance, 'now');
  }
}

const firstFly = (el: HTMLElement) =>
  el.querySelector<SVGGElement>('[data-particle="firefly"]')?.getAttribute('style') ?? null;

/**
 * The SVG fireflies live as long as the Pixi ones: a finite run disappears and calls `onDone`
 * once. Under reduced motion a finite still swarm also disappears when it ends.
 */
export const FirefliesFallbackFiniteRun: Story = {
  play: async ({ canvasElement }) => {
    const release = holdCanvasSlot();
    const lab = mountRoot(canvasElement);
    try {
      const onDone = fn();
      lab.render(<Fireflies seed={4} duration={300} onDone={onDone} />);
      await waitFor(() => expect(lab.renderer()).toBe('svg'));
      await expect(lab.el.querySelector('svg')).not.toBeNull();
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await waitFor(() => expect(lab.el.querySelector('svg'), 'the swarm is gone').toBeNull());
      await waitFor(() => expect(lab.renderer()).toBe('done'));
      await sleep(400);
      await expect(onDone).toHaveBeenCalledTimes(1);

      const still = fn();
      lab.render(<Fireflies seed={5} duration={200} onDone={still} />, { reduced: true });
      await waitFor(() => expect(lab.renderer()).toBe('static'));
      await waitFor(() => expect(still).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await waitFor(() =>
        expect(lab.el.querySelector('svg'), 'the still swarm is gone').toBeNull(),
      );
    } finally {
      lab.unmount();
      release();
    }
  },
};

/** Without `duration` the SVG fireflies keep wandering (even hours on) and never finish. */
export const FirefliesFallbackForever: Story = {
  play: async ({ canvasElement }) => {
    const release = holdCanvasSlot();
    const lab = mountRoot(canvasElement);
    try {
      const onDone = fn();
      lab.render(<Fireflies seed={6} onDone={onDone} />);
      await waitFor(() => expect(lab.renderer()).toBe('svg'));
      // Let the run start (its first frame) before the clock moves on.
      await sleep(200);
      await withClockAhead(2 * 3_600_000, async () => {
        await sleep(300);
        const before = firstFly(lab.el);
        await sleep(300);
        await expect(firstFly(lab.el), 'still wandering, two hours on').not.toBe(before);
      });
      await expect(onDone).not.toHaveBeenCalled();
      await expect(lab.renderer()).toBe('svg');
      await expect(lab.el.querySelector('svg')).not.toBeNull();
    } finally {
      lab.unmount();
      release();
    }
  },
};

/** Under StrictMode's double effects, reduced-motion confetti calls `onDone` once. */
export const ConfettiDoneOnceStrict: Story = {
  play: async ({ canvasElement }) => {
    const lab = mountRoot(canvasElement);
    try {
      const onDone = fn();
      lab.render(<Confetti onDone={onDone} />, { reduced: true, strict: true });
      await sleep(200);
      await expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      lab.unmount();
    }
  },
};

/**
 * Switching reduced motion on after a played confetti run does not call `onDone` again; a new
 * seed is a new run, which does.
 */
export const ConfettiDoneOnceAfterRun: Story = {
  play: async ({ canvasElement }) => {
    const release = holdCanvasSlot();
    const lab = mountRoot(canvasElement);
    try {
      const onDone = fn();
      lab.render(<Confetti seed={3} onDone={onDone} />);
      await waitFor(() => expect(lab.renderer()).toBe('svg'));
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
      lab.render(<Confetti seed={3} onDone={onDone} />, { reduced: true });
      await sleep(200);
      await expect(onDone, 'reduced motion after the run').toHaveBeenCalledTimes(1);
      lab.render(<Confetti seed={4} onDone={onDone} />, { reduced: true });
      await waitFor(() => expect(onDone, 'a new run').toHaveBeenCalledTimes(2));
    } finally {
      lab.unmount();
      release();
    }
  },
};

/**
 * Sparkle, Splash and Fireflies call `onDone` once per run under StrictMode, and not again when
 * reduced motion is switched off after the run (the playback path must not finish it twice).
 */
export const MotionEffectsDoneOnce: Story = {
  play: async ({ canvasElement }) => {
    const release = holdCanvasSlot();
    const sparkle = mountRoot(canvasElement);
    const splash = mountRoot(canvasElement);
    const flies = mountRoot(canvasElement);
    try {
      const done = { sparkle: fn(), splash: fn(), fireflies: fn() };
      const calls = () => ({
        sparkle: done.sparkle.mock.calls.length,
        splash: done.splash.mock.calls.length,
        fireflies: done.fireflies.mock.calls.length,
      });
      const once = { sparkle: 1, splash: 1, fireflies: 1 };
      const render = (reduced: boolean) => {
        const opts = { reduced, strict: true };
        sparkle.render(<Sparkle onDone={done.sparkle} />, opts);
        splash.render(<Splash onDone={done.splash} />, opts);
        flies.render(<Fireflies duration={200} onDone={done.fireflies} />, opts);
      };
      render(true);
      await waitFor(() => expect(calls()).toEqual(once), { timeout: 2000 });
      render(false);
      await sleep(1400);
      await expect(calls(), 'after reduced motion is switched off').toEqual(once);
    } finally {
      sparkle.unmount();
      splash.unmount();
      flies.unmount();
      release();
    }
  },
};
