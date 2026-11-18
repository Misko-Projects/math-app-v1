import type { InteractionEvent, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BigButton } from '../primitives/BigButton';
import { ArrowIcon } from '../primitives/icons';
import {
  center,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
} from '../test-support/storyHelpers';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from './demo';
import type { ConfigFor, WidgetRegistry } from './types';
import { WidgetHost, type WidgetHostProps } from './WidgetHost';

/**
 * The widget registry end to end (U01): a story-local registry maps `make-set` to the SAMPLE
 * widget, and WidgetHost renders it through the same lazy lookup the app uses. The production
 * registry (registry.ts) stays empty until U03–U05 register the real widgets.
 */
const sampleRegistry: WidgetRegistry = {
  'make-set': () => import('./sample/SampleSetWidget'),
};

const makeSet: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 3,
  mode: 'make',
  source: { sprite: 'pebble', supply: 6 },
  container: 'basket',
  capacity: 10,
  showRunningCount: true,
};

const clockSet: ConfigFor<'clock-set'> = {
  format: 'clock-set',
  target: { h: 3, m: 0 },
  start: { h: 12, m: 0 },
  precision: 60,
  showDigital: false,
  prompt: 'spoken',
};

const meta = {
  title: 'Widgets/Registry',
  component: WidgetHost,
  args: {
    config: makeSet as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    registry: sampleRegistry,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: (args) => (
    <div style={{ width: 'min(1100px, 100%)', minHeight: 520, display: 'grid' }}>
      <WidgetHost {...args} />
    </div>
  ),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const pebblesIn = (root: HTMLElement) => root.querySelectorAll('.ni-sample__in').length;
const basketPad = (root: HTMLElement) => root.querySelector('[data-basket-pad]') as HTMLElement;
const pilePebbles = (root: HTMLElement) =>
  [...root.querySelectorAll('.ni-sample__pile [data-pebble]')] as HTMLElement[];

/** The sample widget, loaded lazily through the registry. Try dragging pebbles into the basket. */
export const SampleWidget: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('group', { name: 'Pebble pile' });
    await expect(canvasElement.querySelector('.ni-widget')).toHaveAttribute(
      'data-registered',
      'true',
    );
  },
};

/**
 * End to end: drag two pebbles (mouse and touch), tap-to-place a third, take one out and put it
 * back, then "check". The widget emits one `state` response and an interaction trace.
 */
export const EndToEnd: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('group', { name: 'Pebble pile' });
    await pointerDrag(
      pilePebbles(canvasElement)[0] as HTMLElement,
      center(basketPad(canvasElement)),
      'mouse',
    );
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(1));
    await pointerDrag(
      pilePebbles(canvasElement)[0] as HTMLElement,
      center(basketPad(canvasElement)),
      'touch',
    );
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(2));
    await userEvent.click(pilePebbles(canvasElement)[0] as HTMLElement);
    await userEvent.click(basketPad(canvasElement));
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(3));
    // Take one back out (undo), then return it by keyboard.
    await userEvent.click(
      canvasElement.querySelectorAll<HTMLElement>('.ni-sample__in')[2] as HTMLElement,
    );
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(2));
    (pilePebbles(canvasElement)[0] as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(3));
    await expect(canvas.getByRole('button', { name: '3' })).toBeVisible();
    // The pebbles in the basket are tap targets too: K size, ≥ 12 px apart (06 §4).
    const inBasket = [...canvasElement.querySelectorAll<HTMLElement>('.ni-sample__in')];
    for (const b of inBasket) await expectTargetSize(b, 'k');
    await expectTargetGaps(inBasket);

    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { count: 3 } });

    const trace = (args.onInteract as ReturnType<typeof fn>).mock.calls.map(
      ([e]) => e as InteractionEvent,
    );
    await expect(trace.map((e) => e.t)).toEqual([
      'drag',
      'drop',
      'drag',
      'drop',
      'tap',
      'tap',
      'undo',
      'tap',
      'tap',
    ]);
    for (let i = 1; i < trace.length; i++) {
      await expect((trace[i] as InteractionEvent).ms).toBeGreaterThanOrEqual(
        (trace[i - 1] as InteractionEvent).ms,
      );
    }
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3): a lesson drives the widget with `demo.play` (input disabled), then
 * `demo.invite` pulses the basket under a hand pointer for the child's step.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('group', { name: 'Pebble pile' });
    await demoController.play({ op: 'drag', args: { count: 2 } });
    await expect(pebblesIn(canvasElement)).toBe(2);
    await demoController.play({ op: 'count-aloud' });
    await demoController.play({ op: 'remove', args: { count: 1 } });
    await expect(pebblesIn(canvasElement)).toBe(1);
    await demoController.play({ op: 'drag', args: { count: 2 } });
    await expect(pebblesIn(canvasElement)).toBe(3);
    // An op the format doesn't define throws in development (03 §6.3).
    await expect(demoController.play({ op: 'bundle' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'drag', args: { count: 1 } });
    await waitFor(() => expect(canvasElement.querySelector('.ni-invite')).not.toBeNull());
    await expect(canvasElement.querySelector('.ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** With reduced motion, demo ops become instant state changes (03 §6.3, 06 §7). */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('group', { name: 'Pebble pile' });
    const started = performance.now();
    await reducedController.play({ op: 'drag', args: { count: 3 } });
    await expect(pebblesIn(canvasElement)).toBe(3);
    await expect(performance.now() - started).toBeLessThan(400);
    // Remove is instant too, and doesn't depend on animation frames (suspended in hidden tabs).
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      await reducedController.play({ op: 'remove', args: { count: 2 } });
    } finally {
      window.requestAnimationFrame = raf;
    }
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(1));
    await expect(canvasElement.querySelector('.ni-sample__flight')).toBeNull();
  },
};

/** `disabled`: nothing responds (feedback showing, or demo playback). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    await within(canvasElement).findByRole('group', { name: 'Pebble pile' });
    await pointerDrag(
      pilePebbles(canvasElement)[0] as HTMLElement,
      center(basketPad(canvasElement)),
      'mouse',
    );
    await userEvent.click(pilePebbles(canvasElement)[0] as HTMLElement, { pointerEventsCheck: 0 });
    await expect(pebblesIn(canvasElement)).toBe(0);
    await expect(within(canvasElement).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

/** A format with no registered widget shows the placeholder; "next" answers `skip`. */
export const UnregisteredFormat: Story = {
  args: { config: clockSet as WidgetConfig },
  play: async ({ canvasElement, args }) => {
    const host = canvasElement.querySelector('.ni-widget');
    await expect(host).toHaveAttribute('data-registered', 'false');
    await expect(host).toHaveAttribute('data-format', 'clock-set');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Next' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'skip' });
  },
};

/** The placeholder in K mode: Pip's line is spoken (tap the bubble), not printed. */
export const UnregisteredFormatK: Story = {
  globals: { ageMode: 'k' },
  args: { config: clockSet as WidgetConfig },
};

function NextItemDemo(args: WidgetHostProps) {
  const [item, setItem] = useState(1);
  return (
    <div style={{ width: 'min(1100px, 100%)', display: 'grid', gap: 24, justifyItems: 'center' }}>
      <WidgetHost {...args} itemKey={item} />
      <BigButton
        label="ui.btn.next"
        icon={<ArrowIcon tone="light" />}
        onPress={() => setItem((n) => n + 1)}
      />
    </div>
  );
}

/** A new item of the same format (`itemKey`) starts with fresh widget state. */
export const NewItemResets: Story = {
  render: (args) => <NextItemDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('group', { name: 'Pebble pile' });
    await userEvent.click(pilePebbles(canvasElement)[0] as HTMLElement);
    await userEvent.click(basketPad(canvasElement));
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(1));
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(0));
    await expect(pilePebbles(canvasElement)).toHaveLength(6);
  },
};

const effectController: WidgetDemo = createDemoController({ strict: true });

/** Calls demo.play from inside a React effect, as a lesson player's step effect would. */
function PlayInEffect({ demo }: { demo: WidgetDemo }) {
  useEffect(() => {
    void demo.play({ op: 'remove', args: { count: 1 } });
  }, [demo]);
  return null;
}

function DemoFromEffectHarness(args: WidgetHostProps) {
  const [playing, setPlaying] = useState(false);
  return (
    <div style={{ width: 'min(1100px, 100%)', display: 'grid', gap: 24, justifyItems: 'center' }}>
      <WidgetHost {...args} demo={effectController} />
      <BigButton
        label="ui.btn.next"
        icon={<ArrowIcon tone="light" />}
        onPress={() => setPlaying(true)}
      />
      {playing ? <PlayInEffect demo={effectController} /> : null}
    </div>
  );
}

/** Demo playback started from a React effect still animates the pebble back to the pile. */
export const DemoFromEffect: Story = {
  args: { disabled: true, config: { ...makeSet, start: 2 } as WidgetConfig },
  render: (args) => <DemoFromEffectHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('group', { name: 'Pebble pile' });
    await waitFor(() => expect(pebblesIn(canvasElement)).toBe(2));
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    const flight = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>('.ni-sample__flight');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    // It starts on the basket slot and travels left to the pile (not stuck where it started).
    const startLeft = Number.parseFloat(flight.style.left);
    const basketLeft = basketPad(canvasElement).getBoundingClientRect().left;
    await expect(startLeft).toBeGreaterThan(basketLeft);
    await waitFor(() => expect(Number.parseFloat(flight.style.left)).toBeLessThan(basketLeft));
    await waitFor(() => expect(canvasElement.querySelector('.ni-sample__flight')).toBeNull());
    await expect(pebblesIn(canvasElement)).toBe(1);
  },
};
