import type { InteractionEvent } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { useNarrationText } from '../preferences/UiProvider';
import {
  center,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  touchDragAndHold,
  waitForSettled,
} from '../test-support/storyHelpers';
import { useInteractionTrace } from './trace';
import { useDragToTarget } from './useDragToTarget';
import { type PlaceEvent, useTapToPlace } from './useTapToPlace';

type Zone = 'pile' | 'basket';
type Shell = 's1' | 's2' | 's3' | 's4';
const SHELLS: Shell[] = ['s1', 's2', 's3', 's4'];
const TONES = [
  'var(--color-shallows)',
  'var(--color-sunshine-light)',
  '#f2a08a',
  'var(--color-leaf-light)',
];
const OUTLINES = [
  'var(--color-sea-deep)',
  'var(--color-sunshine-deep)',
  'var(--color-coral-deep)',
  'var(--color-leaf-deep)',
];

function ShellArt({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <path
        d="M32 8c13 0 24 11 24 25 0 9-6 17-13 19H21C14 50 8 42 8 33 8 19 19 8 32 8Z"
        fill={TONES[i]}
        stroke={OUTLINES[i]}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M32 14v34M20 20l6 28M44 20l-6 28"
        stroke={OUTLINES[i]}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

interface PlaygroundProps {
  onPlace?: (e: PlaceEvent<Shell, Zone>) => void;
  onMiss?: (item: Shell) => void;
  onInteract?: (e: InteractionEvent) => void;
  mode?: 'drag' | 'tap';
  /** Test fixture: a control that removes shell 1 (to test an item vanishing mid-interaction). */
  removable?: boolean;
  /** Test fixture: shells are native buttons, with a control that natively disables shell 1. */
  nativeButtons?: boolean;
  /** Test fixture: shell 1 carries its own inline transform (a widget's tilt). */
  tiltFirst?: boolean;
  /** Test fixture: a control that shifts the pile's layout 80 px to the right. */
  shiftable?: boolean;
}

/** Shells move between the sand pile and the basket by drag, tap-to-place or keyboard. */
function Playground({
  onPlace,
  onMiss,
  onInteract,
  mode = 'drag',
  removable,
  nativeButtons,
  tiltFirst,
  shiftable,
}: PlaygroundProps) {
  const text = useNarrationText();
  const [shifted, setShifted] = useState(false);
  const [gone, setGone] = useState(false);
  const [s1Disabled, setS1Disabled] = useState(false);
  const [where, setWhere] = useState<Record<Shell, Zone>>({
    s1: 'pile',
    s2: 'pile',
    s3: 'pile',
    s4: 'pile',
  });
  const [lastVia, setLastVia] = useState<string>('—');
  const trace = useInteractionTrace(onInteract);
  const options = {
    trace,
    canPlace: (item: Shell, target: Zone) => where[item] !== target,
    onPlace: (e: PlaceEvent<Shell, Zone>) => {
      setWhere((w) => ({ ...w, [e.item]: e.target }));
      setLastVia(e.via);
      onPlace?.(e);
    },
  };
  const drag = useDragToTarget<Shell, Zone>({ ...options, onMiss });
  const tap = useTapToPlace<Shell, Zone>(options);
  const dnd = mode === 'drag' ? drag : tap;

  const zone = (id: Zone, labelKey: string) => {
    const pad = dnd.targetProps(id, { label: text(labelKey) });
    return (
      <div className="pg-zone" data-zone={id}>
        <div {...pad} className={`${pad.className} pg-pad`} data-zone-pad={id} />
        <div className="pg-items" style={id === 'pile' && shifted ? { left: 80 } : undefined}>
          {SHELLS.filter((s) => where[s] === id && !(gone && s === 's1')).map((s) => {
            const i = SHELLS.indexOf(s);
            const props = dnd.itemProps(s, { label: `${text('ui.widget.pebble')} ${i + 1}` });
            if (nativeButtons) {
              return (
                <button
                  key={s}
                  type="button"
                  {...props}
                  disabled={s === 's1' && s1Disabled}
                  className={`${'className' in props ? props.className : ''} pg-shell pg-native`}
                  data-shell={s}
                >
                  <ShellArt i={i} />
                </button>
              );
            }
            return (
              <div
                key={s}
                {...props}
                className={`${'className' in props ? props.className : ''} pg-shell`}
                data-shell={s}
                style={tiltFirst && s === 's1' ? { transform: 'rotate(12deg)' } : undefined}
              >
                <ShellArt i={i} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="pg">
      <style>{PLAYGROUND_CSS}</style>
      {zone('pile', 'ui.widget.supply')}
      {zone('basket', 'ui.widget.basket')}
      <output className="pg-log" aria-live="polite">
        last: {lastVia}
      </output>
      {removable ? (
        <button type="button" className="pg-remove" data-remove="" onClick={() => setGone(true)}>
          Hide shell 1
        </button>
      ) : null}
      {nativeButtons ? (
        <button
          type="button"
          className="pg-remove"
          data-disable=""
          onClick={() => setS1Disabled(true)}
        >
          Disable shell 1
        </button>
      ) : null}
      {shiftable ? (
        <button type="button" className="pg-remove" data-shift="" onClick={() => setShifted(true)}>
          Shift pile
        </button>
      ) : null}
    </div>
  );
}

const PLAYGROUND_CSS = `
.pg { display: grid; grid-template-columns: 1fr 1fr; gap: 160px; width: min(1000px, 100%); position: relative; }
.pg-zone { position: relative; min-height: 260px; display: grid; place-items: center; }
.pg-pad { position: absolute; inset: 0; border-radius: 36px; border: 3px solid var(--color-sand-deep); background: var(--color-sand); box-shadow: inset 0 -10px 0 var(--color-sand-shadow); }
.pg-zone[data-zone="basket"] .pg-pad { border-color: var(--color-wood-deep); background: var(--color-horizon); box-shadow: inset 0 -10px 0 rgb(201 138 85 / 0.35); }
.pg-items { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--target-gap); padding: 24px; pointer-events: none; max-width: 100%; }
.pg-shell { width: var(--target-min); height: var(--target-min); border-radius: 50%; pointer-events: auto; }
.pg-log { position: absolute; left: 0; bottom: -44px; font: 700 1rem var(--font-body); color: var(--color-ink-soft); }
.pg-native { padding: 0; border: 0; background: none; }
.pg-remove { position: absolute; right: 0; bottom: -56px; min-height: 44px; padding: 0 16px; border-radius: 12px; border: 2px solid var(--color-ink); background: var(--color-paper); color: var(--color-ink); font: 700 1rem var(--font-body); }
`;

const meta = {
  title: 'Interaction/DragToTarget',
  args: { onPlace: fn(), onMiss: fn(), onInteract: fn() },
  render: (args) => <Playground {...args} />,
  parameters: { ui: { stage: 'centered' } },
} satisfies Meta<PlaygroundProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const shell = (root: HTMLElement, id: Shell) =>
  root.querySelector(`[data-shell="${id}"]`) as HTMLElement;
const pad = (root: HTMLElement, id: Zone) =>
  root.querySelector(`[data-zone-pad="${id}"]`) as HTMLElement;
const zoneOf = (root: HTMLElement, id: Shell) =>
  shell(root, id)?.closest('[data-zone]')?.getAttribute('data-zone') ?? null;

/** Try it: drag, tap-then-tap, or Tab + Enter. Switch "Tap-only" in the toolbar to disable drag. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const shells = SHELLS.map((s) => shell(canvasElement, s));
    for (const s of shells) await expectTargetSize(s, 'g1-up');
    await expectTargetGaps(shells);
  },
};

/** K mode: shells are 80 px (06 §4). */
export const KSizes: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement }) => {
    const shells = SHELLS.map((s) => shell(canvasElement, s));
    for (const s of shells) await expectTargetSize(s, 'k');
    await expectTargetGaps(shells);
  },
};

/** Mouse: drag a shell onto the basket; it snaps in and the trace records drag → drop. */
export const MouseDrag: Story = {
  play: async ({ canvasElement, args }) => {
    await pointerDrag(shell(canvasElement, 's1'), center(pad(canvasElement, 'basket')), 'mouse');
    await waitFor(() => expect(zoneOf(canvasElement, 's1')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenCalledWith({ item: 's1', target: 'basket', via: 'drag' });
    const kinds = (args.onInteract as ReturnType<typeof fn>).mock.calls.map(
      ([e]) => `${(e as InteractionEvent).t}:${(e as InteractionEvent).target}`,
    );
    await expect(kinds).toEqual(['drag:s1', 'drop:basket']);
  },
};

/** Touch emulation (pointerType "touch", as on the tablet): the same drag works with a finger. */
export const TouchDrag: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    await pointerDrag(
      shell(canvasElement, 's2'),
      center(pad(canvasElement, 'basket')),
      'touch',
      12,
    );
    await waitFor(() => expect(zoneOf(canvasElement, 's2')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenCalledWith({ item: 's2', target: 'basket', via: 'drag' });
    // And back out again by touch.
    await pointerDrag(shell(canvasElement, 's2'), center(pad(canvasElement, 'pile')), 'touch', 12);
    await waitFor(() => expect(zoneOf(canvasElement, 's2')).toBe('pile'));
  },
};

/** A drop away from every target glides the shell home, with no penalty (06 §4). */
export const MisDropReturns: Story = {
  play: async ({ canvasElement, args }) => {
    const s3 = shell(canvasElement, 's3');
    const start = s3.getBoundingClientRect();
    const basket = pad(canvasElement, 'basket').getBoundingClientRect();
    // The gap between the zones is 160 px: its middle is > 48 px from both.
    await pointerDrag(s3, { x: basket.left - 80, y: start.top + start.height / 2 + 140 }, 'mouse');
    await expect(args.onMiss).toHaveBeenCalledWith('s3');
    await expect(args.onPlace).not.toHaveBeenCalled();
    await waitFor(() => {
      const now = shell(canvasElement, 's3').getBoundingClientRect();
      expect(Math.abs(now.left - start.left)).toBeLessThan(1);
      expect(Math.abs(now.top - start.top)).toBeLessThan(1);
    });
    await expect(zoneOf(canvasElement, 's3')).toBe('pile');
  },
};

/** Snap: a drop whose centre lands within 48 px of the basket snaps in; farther away misses. */
export const SnapRadius: Story = {
  play: async ({ canvasElement, args }) => {
    const basket = pad(canvasElement, 'basket').getBoundingClientRect();
    const y = basket.top + basket.height / 2;
    // 70 px left of the basket edge: outside the 48 px radius.
    await pointerDrag(shell(canvasElement, 's1'), { x: basket.left - 70, y }, 'mouse');
    await expect(args.onMiss).toHaveBeenCalledTimes(1);
    await waitForSettled(shell(canvasElement, 's1'));
    // 36 px left of the edge: inside the radius, so it snaps.
    await pointerDrag(shell(canvasElement, 's1'), { x: basket.left - 36, y }, 'mouse');
    await waitFor(() => expect(zoneOf(canvasElement, 's1')).toBe('basket'));
  },
};

/** Picking a shell up again while it is still gliding home: it follows the finger and snaps. */
export const DragDuringGlideHome: Story = {
  play: async ({ canvasElement, args }) => {
    const basket = pad(canvasElement, 'basket').getBoundingClientRect();
    const y = basket.top + basket.height / 2;
    await pointerDrag(shell(canvasElement, 's1'), { x: basket.left - 70, y }, 'mouse');
    await expect(args.onMiss).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 40)); // the 320 ms glide is still running
    // A slow frame between press and move: the item must stay under the finger meanwhile.
    await pointerDrag(shell(canvasElement, 's1'), { x: basket.left - 36, y }, 'mouse', 8, 120);
    await waitFor(() => expect(zoneOf(canvasElement, 's1')).toBe('basket'));
  },
};

/** A wider snap radius (06 §7 motor setting): 100 px. */
export const WideSnapRadius: Story = {
  parameters: { ui: { snapRadiusPx: 100 } },
  play: async ({ canvasElement }) => {
    const basket = pad(canvasElement, 'basket').getBoundingClientRect();
    await pointerDrag(
      shell(canvasElement, 's4'),
      { x: basket.left - 80, y: basket.top + basket.height / 2 },
      'mouse',
    );
    await waitFor(() => expect(zoneOf(canvasElement, 's4')).toBe('basket'));
  },
};

/** Tap-to-place: tap a shell (it lifts with a sunshine ring), then tap the basket. */
export const TapToPlace: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(shell(canvasElement, 's1'));
    await expect(shell(canvasElement, 's1')).toHaveAttribute('aria-pressed', 'true');
    await expect(pad(canvasElement, 'basket')).toHaveAttribute('data-armed', 'true');
    await userEvent.click(pad(canvasElement, 'basket'));
    await waitFor(() => expect(zoneOf(canvasElement, 's1')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenCalledWith({ item: 's1', target: 'basket', via: 'tap' });
    // Tapping a selected shell again puts it down.
    await userEvent.click(shell(canvasElement, 's2'));
    await userEvent.click(shell(canvasElement, 's2'));
    await expect(shell(canvasElement, 's2')).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Keyboard (06 §7): Tab to a shell, Enter picks it up and focuses the basket, Enter places it. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    pad(canvasElement, 'pile').focus();
    await userEvent.tab();
    await expect(shell(canvasElement, 's1')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(shell(canvasElement, 's2')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(pad(canvasElement, 'basket')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(zoneOf(canvasElement, 's2')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenCalledWith({
      item: 's2',
      target: 'basket',
      via: 'keyboard',
    });
    // Space works too; Escape cancels a pick-up.
    shell(canvasElement, 's3').focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Escape}');
    await expect(shell(canvasElement, 's3')).toHaveFocus();
    await expect(shell(canvasElement, 's3')).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Tap-only mode (06 §7): drags do nothing; tap-to-place still works. */
export const TapOnlyMode: Story = {
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement, args }) => {
    await pointerDrag(shell(canvasElement, 's1'), center(pad(canvasElement, 'basket')), 'touch');
    await expect(zoneOf(canvasElement, 's1')).toBe('pile');
    await expect(args.onPlace).not.toHaveBeenCalled();
    await userEvent.click(shell(canvasElement, 's1'));
    await userEvent.click(pad(canvasElement, 'basket'));
    await waitFor(() => expect(zoneOf(canvasElement, 's1')).toBe('basket'));
  },
};

/** useTapToPlace on its own (no drag at all): the same tap and keyboard paths. */
export const TapToPlaceHook: Story = {
  args: { mode: 'tap' },
  play: async ({ canvasElement, args }) => {
    await pointerDrag(shell(canvasElement, 's1'), center(pad(canvasElement, 'basket')), 'mouse');
    await expect(zoneOf(canvasElement, 's1')).toBe('pile');
    await userEvent.click(shell(canvasElement, 's1'));
    await userEvent.click(pad(canvasElement, 'basket'));
    await waitFor(() => expect(zoneOf(canvasElement, 's1')).toBe('basket'));
    shell(canvasElement, 's2').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(zoneOf(canvasElement, 's2')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenLastCalledWith({
      item: 's2',
      target: 'basket',
      via: 'keyboard',
    });
    // Standalone tap-to-place shows the picked-up item too.
    await userEvent.click(shell(canvasElement, 's3'));
    await expect(getComputedStyle(shell(canvasElement, 's3')).outlineStyle).toBe('solid');
  },
};

/**
 * Mixed input: a key released outside the widget (focus moved away mid-press) must not lock out
 * later taps.
 */
export const KeyReleasedElsewhereKeepsTapsWorking: Story = {
  play: async ({ canvasElement, args }) => {
    shell(canvasElement, 's3').focus();
    await userEvent.keyboard('{Enter>}');
    await expect(shell(canvasElement, 's3')).toHaveAttribute('aria-pressed', 'true');
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{/Enter}');
    await userEvent.click(pad(canvasElement, 'basket'));
    await waitFor(() => expect(zoneOf(canvasElement, 's3')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenCalledWith({ item: 's3', target: 'basket', via: 'tap' });
    // And a plain tap on another shell still selects it.
    await userEvent.click(shell(canvasElement, 's4'));
    await expect(shell(canvasElement, 's4')).toHaveAttribute('aria-pressed', 'true');
  },
};

/** A picked-up shell that disappears can no longer be placed. */
export const SelectedItemRemoved: Story = {
  args: { removable: true },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(shell(canvasElement, 's1'));
    await expect(pad(canvasElement, 'basket')).toHaveAttribute('data-armed', 'true');
    await userEvent.click(canvasElement.querySelector('[data-remove]') as HTMLElement);
    await waitFor(() => expect(shell(canvasElement, 's1')).toBeNull());
    await waitFor(() => expect(pad(canvasElement, 'basket')).not.toHaveAttribute('data-armed'));
    await userEvent.click(pad(canvasElement, 'basket'));
    await expect(args.onPlace).not.toHaveBeenCalled();
  },
};

/** A shell that disappears mid-drag doesn't land when the finger lifts. */
export const DraggedItemRemoved: Story = {
  args: { removable: true },
  play: async ({ canvasElement, args }) => {
    const release = await touchDragAndHold(
      shell(canvasElement, 's1'),
      center(pad(canvasElement, 'basket')),
    );
    (canvasElement.querySelector('[data-remove]') as HTMLButtonElement).click();
    await waitFor(() => expect(shell(canvasElement, 's1')).toBeNull());
    await release();
    await expect(args.onPlace).not.toHaveBeenCalled();
    // The next drag works normally.
    await pointerDrag(shell(canvasElement, 's2'), center(pad(canvasElement, 'basket')), 'touch');
    await waitFor(() => expect(zoneOf(canvasElement, 's2')).toBe('basket'));
  },
};

/** A picked-up native button that becomes `disabled` can no longer be placed. */
export const SelectedItemNativelyDisabled: Story = {
  args: { nativeButtons: true },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(shell(canvasElement, 's1'));
    await expect(shell(canvasElement, 's1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvasElement.querySelector('[data-disable]') as HTMLElement);
    await waitFor(() => expect(shell(canvasElement, 's1')).toBeDisabled());
    await waitFor(() => expect(pad(canvasElement, 'basket')).not.toHaveAttribute('data-armed'));
    await userEvent.click(pad(canvasElement, 'basket'));
    await expect(args.onPlace).not.toHaveBeenCalled();
    await expect(zoneOf(canvasElement, 's1')).toBe('pile');
  },
};

/** A native button disabled mid-drag doesn't land when the finger lifts. */
export const DragSourceNativelyDisabled: Story = {
  args: { nativeButtons: true },
  play: async ({ canvasElement, args }) => {
    const release = await touchDragAndHold(
      shell(canvasElement, 's1'),
      center(pad(canvasElement, 'basket')),
    );
    (canvasElement.querySelector('[data-disable]') as HTMLButtonElement).click();
    await waitFor(() => expect(shell(canvasElement, 's1')).toBeDisabled());
    await release();
    await expect(args.onPlace).not.toHaveBeenCalled();
    await expect(zoneOf(canvasElement, 's1')).toBe('pile');
  },
};

/** A plain tap leaves a widget's own inline styles on the item alone. */
export const TapKeepsInlineStyles: Story = {
  args: { tiltFirst: true },
  play: async ({ canvasElement }) => {
    await expect(shell(canvasElement, 's1').style.transform).toBe('rotate(12deg)');
    await userEvent.click(shell(canvasElement, 's1'));
    await expect(shell(canvasElement, 's1')).toHaveAttribute('aria-pressed', 'true');
    await expect(shell(canvasElement, 's1').style.transform).toBe('rotate(12deg)');
  },
};

/**
 * The layout moves between pressing and dragging: snapping follows where the item really is
 * (under the finger, 80 px further right), not where it was at pointerdown.
 */
export const LayoutShiftBeforeDrag: Story = {
  args: { shiftable: true },
  play: async ({ canvasElement, args }) => {
    const s2 = shell(canvasElement, 's2');
    const from = center(s2);
    const startLeft = s2.getBoundingClientRect().left;
    const basket = pad(canvasElement, 'basket').getBoundingClientRect();
    const ev = (type: string, x: number, y: number, buttons: number) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 77,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
      });
    s2.dispatchEvent(ev('pointerdown', from.x, from.y, 1));
    (canvasElement.querySelector('[data-shift]') as HTMLButtonElement).click();
    await waitFor(() =>
      expect(shell(canvasElement, 's2').getBoundingClientRect().left).toBeGreaterThan(
        startLeft + 70,
      ),
    );
    // The finger ends 70 px left of the basket; the item, drawn 80 px right of where the finger
    // went, sits just inside the basket's edge.
    const to = { x: basket.left - 70, y: basket.top + basket.height / 2 };
    for (let i = 1; i <= 8; i++) {
      const x = from.x + ((to.x - from.x) * i) / 8;
      const y = from.y + ((to.y - from.y) * i) / 8;
      window.dispatchEvent(ev('pointermove', x, y, 1));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    window.dispatchEvent(ev('pointerup', to.x, to.y, 0));
    await waitFor(() => expect(zoneOf(canvasElement, 's2')).toBe('basket'));
    await expect(args.onPlace).toHaveBeenCalledWith({ item: 's2', target: 'basket', via: 'drag' });
  },
};
