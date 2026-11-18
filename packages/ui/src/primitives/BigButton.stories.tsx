import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../test-support/storyHelpers';
import { BigButton } from './BigButton';
import { ArrowIcon, CheckIcon, HomeIcon, StarIcon } from './icons';

const audio = spyAudio();

const meta = {
  title: 'Primitives/BigButton',
  component: BigButton,
  args: {
    label: 'ui.btn.check',
    icon: <CheckIcon />,
    tone: 'sun',
    onPress: fn(),
  },
  parameters: { ui: { audio } },
} satisfies Meta<typeof BigButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default "check" button. Change the age mode in the toolbar to see the K size. */
export const Playground: Story = {};

function StatesGrid() {
  return (
    <div className="story-grid" style={{ ['--story-col' as string]: '230px' }}>
      <div className="story-cell">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" />
        <span className="story-cell__name">sun · default</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.next" icon={<ArrowIcon tone="light" />} tone="sea" />
        <span className="story-cell__name">sea · default</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.home" icon={<HomeIcon tone="light" />} tone="leaf" />
        <span className="story-cell__name">leaf · default</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.close" icon={<StarIcon />} tone="cloud" />
        <span className="story-cell__name">cloud · default</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" pressed />
        <span className="story-cell__name">selected (aria-pressed)</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.next" icon={<ArrowIcon tone="light" />} tone="sea" pressed />
        <span className="story-cell__name">sea · selected</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" disabled />
        <span className="story-cell__name">disabled</span>
      </div>
      <div className="story-cell">
        <BigButton label="ui.btn.next" tone="sea" />
        <span className="story-cell__name">text only (G1+)</span>
      </div>
    </div>
  );
}

async function checkSizes(canvasElement: HTMLElement, ageMode: 'k' | 'g1-up') {
  const buttons = within(canvasElement).getAllByRole('button');
  for (const b of buttons) await expectTargetSize(b, ageMode);
  await expectTargetGaps(buttons);
}

/** Every state at the K size: icons only, labels spoken (06 §5), ≥ 80 px (06 §4). */
export const StatesK: Story = {
  globals: { ageMode: 'k' },
  render: () => <StatesGrid />,
  play: async ({ canvasElement }) => {
    await checkSizes(canvasElement, 'k');
    // K mode: no visible words; the label is the accessible name.
    const check = within(canvasElement).getAllByRole('button', { name: 'Check' })[0];
    await expect(check).toBeDefined();
    await expect(check?.textContent).toBe('');
  },
};

/** Every state at the G1+ size: text beside the icon, ≥ 64 px. */
export const StatesG1: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => <StatesGrid />,
  play: async ({ canvasElement }) => {
    await checkSizes(canvasElement, 'g1-up');
    await expect(within(canvasElement).getAllByText('Check').length).toBeGreaterThan(0);
  },
};

/** K mode speaks the label on press; G1+ only presses. "Check" ignores a double tap (06 §4). */
export const SpeaksAndDebounces: Story = {
  globals: { ageMode: 'k' },
  args: { debounceMs: 400 },
  play: async ({ canvasElement, args }) => {
    clearSpies(audio);
    const button = within(canvasElement).getByRole('button', { name: 'Check' });
    // A double tap: two clicks in the same instant (no awaits, so a slow runner can't spread them
    // past the 400 ms window).
    button.click();
    button.click();
    await expect(args.onPress).toHaveBeenCalledTimes(1);
    await expect(audio.say).toHaveBeenCalledWith('ui.btn.check', undefined);
    await new Promise((r) => setTimeout(r, 420));
    await userEvent.click(button);
    await expect(args.onPress).toHaveBeenCalledTimes(2);
  },
};

/** A disabled button ignores presses. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Check' });
    await expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

/** Keyboard: Enter and Space press the button (desktop play, 06 §7). */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Check' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.onPress).toHaveBeenCalledTimes(2);
  },
};
