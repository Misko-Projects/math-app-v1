import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { clearSpies, expectTargetSize, spyAudio } from '../test-support/storyHelpers';
import { NumberDisplay } from './NumberDisplay';
import { SpeechBubble } from './SpeechBubble';

const audio = spyAudio();

const meta = {
  title: 'Primitives/SpeechBubble',
  component: SpeechBubble,
  args: { say: 'game.pip.welcome' },
  parameters: { ui: { audio } },
} satisfies Meta<typeof SpeechBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

function Plank() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <rect
        x="4"
        y="16"
        width="40"
        height="16"
        rx="4"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path
        d="M12 22h12M28 27h10"
        stroke="var(--color-wood-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Variants() {
  return (
    <div
      className="story-grid story-grid--bubbles"
      style={{ ['--story-col' as string]: '320px', rowGap: 72, columnGap: 64 }}
    >
      <style>{'.story-grid--bubbles .story-cell { gap: 44px; }'}</style>
      <div className="story-cell">
        <SpeechBubble say="game.pip.welcome" tail="bottom-left" />
        <span className="story-cell__name">Pip · tail bottom-left</span>
      </div>
      <div className="story-cell">
        <SpeechBubble say="res.shelly.hello" tail="bottom" tone="sky" />
        <span className="story-cell__name">resident · sky</span>
      </div>
      <div className="story-cell">
        <SpeechBubble say="req.dock.needs-planks" tone="sun" tail="bottom-right" onPress={fn()}>
          <Plank />
          <Plank />
          <Plank />
          <Plank />
        </SpeechBubble>
        <span className="story-cell__name">request with pictures</span>
      </div>
      <div className="story-cell">
        <SpeechBubble say="req.dock.needs-planks" recommended onPress={fn()}>
          <Plank />
          <NumberDisplay value={4} speakOnTap={false} />
        </SpeechBubble>
        <span className="story-cell__name">recommended request (pulses)</span>
      </div>
      <div className="story-cell">
        <SpeechBubble say="res.shelly.hello" tail="left" />
        <span className="story-cell__name">tail left</span>
      </div>
      <div className="story-cell">
        <SpeechBubble say="res.shelly.hello" tail="right" />
        <span className="story-cell__name">tail right</span>
      </div>
    </div>
  );
}

/** K mode: no required reading (06 §5). Words are spoken on tap; pictures stay; a speaker invites a tap. */
export const VariantsK: Story = {
  globals: { ageMode: 'k' },
  render: () => <Variants />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Hello! Can you help me fix my boat?')).toBeNull();
    const bubbles = canvas.getAllByRole('button');
    for (const b of bubbles) await expectTargetSize(b, 'k');
    clearSpies(audio);
    await userEvent.click(
      canvas.getAllByRole('button', {
        name: 'Hello! Can you help me fix my boat?',
      })[0] as HTMLElement,
    );
    await expect(audio.say).toHaveBeenCalledWith('res.shelly.hello', undefined);
  },
};

/** G1+: the words show beside the pictures (06 §5 text mode). */
export const VariantsG1: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => <Variants />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByText('Hello! Can you help me fix my boat?').length,
    ).toBe(3);
  },
};

/** Long text wraps inside a narrow column without overflowing. */
export const LongTextStress: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => (
    <div style={{ width: 340 }}>
      <SpeechBubble say="ui.widget.coming-soon" tail="bottom-left" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bubble = within(canvasElement).getByRole('button');
    await expect(bubble.scrollWidth).toBeLessThanOrEqual(bubble.clientWidth + 1);
    await expect(bubble.getBoundingClientRect().width).toBeLessThanOrEqual(341);
  },
};
