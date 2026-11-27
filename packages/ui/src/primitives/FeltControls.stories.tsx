import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { expect } from 'storybook/test';
import { BigButton } from './BigButton';
import { IconButton } from './IconButton';
import { ArrowIcon, CheckIcon, HomeIcon } from './icons';
import { NumberDisplay } from './NumberDisplay';
import { HintButton, HomeButton, ReplayButton } from './presets';
import { SpeechBubble } from './SpeechBubble';
import '../widgets/kit/kit.css';

/**
 * Felt & Stitch (05 §11): every shared control in every state on one sheet: rest, focus, pressed,
 * selected, disabled, and the entry box's active and right states. The play checks the two rules the
 * felt look must never break: a border is the same width on all four sides, and a 50% radius is
 * only ever drawn on a square box (no ovals).
 */
const meta: Meta = {
  title: 'Foundations/Felt controls',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

function Cell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="story-cell">
      {children}
      <span className="story-cell__name">{name}</span>
    </div>
  );
}

const sheet: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  alignItems: 'center',
  justifyItems: 'center',
  gap: '18px 12px',
  padding: 24,
  minHeight: '100vh',
  boxSizing: 'border-box',
  background: 'var(--color-sand)',
};

function Key({ digit, state }: { digit: string; state?: 'pressed' | 'disabled' | 'focus' }) {
  const style: CSSProperties = { width: 'var(--target-big)', height: 'var(--target-big)' };
  return (
    <button
      type="button"
      className="ni-pad__key"
      style={style}
      disabled={state === 'disabled'}
      data-preview={state}
    >
      <span className="ni-pad__digit">{digit}</span>
    </button>
  );
}

function Pick({ n, state }: { n: number; state?: 'selected' | 'disabled' }) {
  return (
    <button
      type="button"
      className="ni-pick"
      data-selected={state === 'selected' ? 'true' : undefined}
      disabled={state === 'disabled'}
    >
      <span className="ni-pick__face ni-pick__numeral">{n}</span>
    </button>
  );
}

function Sheet() {
  return (
    <div style={sheet} data-testid="felt-sheet">
      <Cell name="Check · rest">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" showLabel />
      </Cell>
      <Cell name="Check · pressed">
        <BigButton
          label="ui.btn.check"
          icon={<CheckIcon />}
          tone="sun"
          showLabel
          previewState="pressed"
        />
      </Cell>
      <Cell name="Check · focus">
        <BigButton
          label="ui.btn.check"
          icon={<CheckIcon />}
          tone="sun"
          showLabel
          previewState="focus"
        />
      </Cell>
      <Cell name="Check · selected">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" showLabel pressed />
      </Cell>
      <Cell name="Check · disabled">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" showLabel disabled />
      </Cell>
      <Cell name="Check · icon only">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" showLabel={false} />
      </Cell>

      <Cell name="Next · rest">
        <BigButton label="ui.btn.next" icon={<ArrowIcon tone="light" />} tone="leaf" showLabel />
      </Cell>
      <Cell name="sea · rest">
        <BigButton label="ui.btn.next" icon={<ArrowIcon tone="light" />} tone="sea" showLabel />
      </Cell>
      <Cell name="cloud · rest">
        <BigButton label="ui.btn.done" icon={<CheckIcon />} tone="cloud" showLabel />
      </Cell>
      <Cell name="icon only · disabled">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" showLabel={false} disabled />
      </Cell>
      <Cell name="Go home · rest">
        <HomeButton caption={false} />
      </Cell>
      <Cell name="Go home · pressed">
        <HomeButton caption={false} previewState="pressed" />
      </Cell>

      <Cell name="Help me · focus">
        <HintButton caption={false} previewState="focus" />
      </Cell>
      <Cell name="Help me · glow">
        <HintButton caption={false} glow />
      </Cell>
      <Cell name="Sound · rest">
        <ReplayButton caption={false} />
      </Cell>
      <Cell name="Go home · selected">
        <IconButton
          label="ui.btn.home"
          icon={<HomeIcon tone="navy" />}
          tone="wood"
          caption={false}
          pressed
        />
      </Cell>
      <Cell name="Go home · disabled">
        <HomeButton caption={false} disabled />
      </Cell>
      <Cell name="bubble">
        <SpeechBubble say="ui.btn.check" tail="left" />
      </Cell>

      <Cell name="key · rest">
        <Key digit="7" />
      </Cell>
      <Cell name="key · pressed">
        <Key digit="7" state="pressed" />
      </Cell>
      <Cell name="key · disabled">
        <Key digit="7" state="disabled" />
      </Cell>
      <Cell name="card · rest">
        <Pick n={3} />
      </Cell>
      <Cell name="card · selected">
        <Pick n={3} state="selected" />
      </Cell>
      <Cell name="card · disabled">
        <Pick n={3} state="disabled" />
      </Cell>

      <Cell name="entry · idle">
        <NumberDisplay value={12} />
      </Cell>
      <Cell name="entry · active">
        <NumberDisplay value={null} digits={2} state="active" />
      </Cell>
      <Cell name="entry · right">
        <NumberDisplay value={12} state="celebrate" />
      </Cell>
      <Cell name="beads">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ni-bead" data-done="true" />
          <span className="ni-bead" data-done="true" />
          <span className="ni-bead" />
          <span className="ni-bead" />
        </div>
      </Cell>
    </div>
  );
}

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/** Every control's border is the same width on all four sides; 50% radii only on square boxes. */
async function checkFelt(root: HTMLElement) {
  const controls = root.querySelectorAll<HTMLElement>(
    '.ni-btn, .ni-pad__key, .ni-pick, .ni-number, .ni-bubble, .ni-bead',
  );
  await expect(controls.length).toBeGreaterThan(20);
  for (const el of controls) {
    const cs = getComputedStyle(el);
    const widths = SIDES.map((s) => cs.getPropertyValue(`border-${s.toLowerCase()}-width`));
    await expect(new Set(widths).size, `${el.className}: borders ${widths.join(' ')}`).toBe(1);
    if (cs.borderTopLeftRadius.endsWith('%')) {
      // The layout box (a pressed control is squished by a transform, which is not its shape).
      const off = Math.abs(el.offsetWidth - el.offsetHeight);
      await expect(off, `${el.className}: a 50% radius on a box that is not square`).toBe(0);
    }
  }
}

export const G1: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => <Sheet />,
  play: async ({ canvasElement }) => checkFelt(canvasElement),
};

export const K: Story = {
  globals: { ageMode: 'k' },
  render: () => <Sheet />,
  play: async ({ canvasElement }) => checkFelt(canvasElement),
};
