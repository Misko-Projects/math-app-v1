import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../test-support/storyHelpers';
import { IconButton } from './IconButton';
import { ArrowIcon, CheckIcon, LightbulbIcon } from './icons';
import { HintButton, HomeButton, ReplayButton } from './presets';

const audio = spyAudio();

const meta = {
  title: 'Primitives/IconButton',
  component: IconButton,
  args: { label: 'ui.btn.hint', icon: <LightbulbIcon />, onPress: fn() },
  parameters: { ui: { audio } },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * A selected toggle with a caption (G1+), beside a plain button. Keyboard focus on the selected one
 * draws inside the button (no outer ring reaching the caption), its caption sits clear of the
 * selection ring, and both captions line up.
 */
export const SelectedFocusWithCaption: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => (
    <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>
      <IconButton label="ui.btn.next" icon={<ArrowIcon />} tone="sun" pressed />
      <IconButton label="ui.btn.hint" icon={<LightbulbIcon />} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Next' });
    const [caption, otherCaption] = [
      ...canvasElement.querySelectorAll<HTMLElement>('.ni-caption'),
    ] as [HTMLElement, HTMLElement];
    const unfocused = getComputedStyle(button).boxShadow;
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(button.matches(':focus-visible')).toBe(true);
    const style = getComputedStyle(button);
    // Focus is visible as a change inside the button, and no outer ring reaches the caption.
    await expect(style.boxShadow).not.toBe(unfocused);
    await expect(style.boxShadow).toContain('inset');
    await expect(style.outlineStyle).toBe('none');
    // The selection ring reaches 7px past the (sunk) button; the caption starts below it.
    await expect(caption.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      button.getBoundingClientRect().bottom + 7,
    );
    // Captions in a row line up whether or not the button is a selected toggle.
    await expect(
      Math.abs(caption.getBoundingClientRect().top - otherCaption.getBoundingClientRect().top),
    ).toBeLessThanOrEqual(1);
  },
};

function StatesGrid() {
  return (
    <div className="story-grid" style={{ ['--story-col' as string]: '150px' }}>
      <div className="story-cell">
        <HomeButton />
        <span className="story-cell__name">HomeButton</span>
      </div>
      <div className="story-cell">
        <HintButton />
        <span className="story-cell__name">HintButton</span>
      </div>
      <div className="story-cell">
        <HintButton glow />
        <span className="story-cell__name">hint · glowing</span>
      </div>
      <div className="story-cell">
        <HintButton disabled />
        <span className="story-cell__name">hint · used up</span>
      </div>
      <div className="story-cell">
        <ReplayButton />
        <span className="story-cell__name">ReplayButton</span>
      </div>
      <div className="story-cell">
        <ReplayButton playing />
        <span className="story-cell__name">replay · playing</span>
      </div>
      <div className="story-cell">
        <IconButton label="ui.btn.done" icon={<CheckIcon />} />
        <span className="story-cell__name">cloud</span>
      </div>
      <div className="story-cell">
        <IconButton label="ui.btn.next" icon={<ArrowIcon tone="light" />} tone="sea" />
        <span className="story-cell__name">sea</span>
      </div>
      <div className="story-cell">
        <HomeButton previewState="pressed" />
        <span className="story-cell__name">pressed (finger down)</span>
      </div>
      <div className="story-cell">
        <IconButton
          label="ui.btn.next"
          icon={<ArrowIcon tone="light" />}
          tone="sea"
          previewState="focus"
        />
        <span className="story-cell__name">keyboard focus</span>
      </div>
      <div className="story-cell">
        <IconButton label="ui.btn.next" icon={<ArrowIcon />} tone="sun" pressed />
        <span className="story-cell__name">selected (ring + check badge)</span>
      </div>
      <div className="story-cell">
        <IconButton
          label="ui.btn.next"
          icon={<ArrowIcon />}
          tone="sun"
          pressed
          previewState="focus"
        />
        <span className="story-cell__name">selected + keyboard focus (inner ring)</span>
      </div>
      <div className="story-cell">
        <IconButton label="ui.btn.done" icon={<CheckIcon />} disabled />
        <span className="story-cell__name">disabled (hatched, dashed)</span>
      </div>
    </div>
  );
}

async function checkSizes(canvasElement: HTMLElement, ageMode: 'k' | 'g1-up') {
  const buttons = within(canvasElement).getAllByRole('button');
  await expect(buttons.length).toBe(13);
  for (const b of buttons) await expectTargetSize(b, ageMode);
  await expectTargetGaps(buttons);
}

/** K mode: 88 px round buttons, no captions; the label is spoken on press (06 §4, §5). */
export const StatesK: Story = {
  globals: { ageMode: 'k' },
  render: () => <StatesGrid />,
  play: async ({ canvasElement }) => {
    await checkSizes(canvasElement, 'k');
    await expect(within(canvasElement).queryByText('Go home')).toBeNull();
    await expect(within(canvasElement).getAllByRole('button', { name: 'Go home' })).toHaveLength(2);
  },
};

/** G1+: 72 px buttons with a caption under each (06 §5 text mode). */
export const StatesG1: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => <StatesGrid />,
  play: async ({ canvasElement }) => {
    await checkSizes(canvasElement, 'g1-up');
    await expect(within(canvasElement).getAllByText('Go home')[0]).toBeVisible();
    await expect(within(canvasElement).getAllByRole('button', { name: 'Go home' })).toHaveLength(2);
  },
};

/** A spoken label (06 §5): in K mode a press says the label, then acts. */
export const SpokenLabel: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    clearSpies(audio);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Help me' }));
    await expect(audio.say).toHaveBeenCalledWith('ui.btn.hint', undefined);
    await expect(args.onPress).toHaveBeenCalledTimes(1);
  },
};

/** The replay button never speaks its own label: pressing it replays the prompt. */
export const ReplayIsSilent: Story = {
  globals: { ageMode: 'k' },
  render: (args) => <ReplayButton onPress={args.onPress} />,
  play: async ({ canvasElement, args }) => {
    clearSpies(audio);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Hear it again' }));
    await expect(audio.say).not.toHaveBeenCalled();
    await expect(args.onPress).toHaveBeenCalledTimes(1);
  },
};
