import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { clearSpies, spyAudio } from '../test-support/storyHelpers';
import { NumberDisplay } from './NumberDisplay';

const audio = spyAudio();

const meta = {
  title: 'Primitives/NumberDisplay',
  component: NumberDisplay,
  args: { value: 23 },
  parameters: { ui: { audio } },
} satisfies Meta<typeof NumberDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Every state: empty blanks, typing (caret), a value, a celebration, and the three sizes. */
export const States: Story = {
  render: () => (
    <div
      className="story-grid"
      style={{ ['--story-col' as string]: '220px', width: 'min(1100px, 100%)' }}
    >
      <div className="story-cell">
        <NumberDisplay value={null} label="ui.story.answer" />
        <span className="story-cell__name">empty</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value={null} digits={2} state="active" label="ui.story.answer" />
        <span className="story-cell__name">empty · 2 digits · typing</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value="4" state="active" label="ui.story.answer" />
        <span className="story-cell__name">typing "4"</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value={7} />
        <span className="story-cell__name">value</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value={10} state="celebrate" />
        <span className="story-cell__name">celebrate</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value={1000} />
        <span className="story-cell__name">4 digits</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value={36} size="lg" />
        <span className="story-cell__name">lg (72 px)</span>
      </div>
      <div className="story-cell">
        <NumberDisplay value={58} size="xl" />
        <span className="story-cell__name">xl (96 px)</span>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 05 §11: numerals in math widgets are ≥ 32 px.
    for (const el of canvasElement.querySelectorAll('.ni-number')) {
      await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
    }
  },
};

/** Tapping a number speaks it (06 §5). */
export const SpeaksOnTap: Story = {
  globals: { ageMode: 'k' },
  args: { value: 23 },
  play: async ({ canvasElement }) => {
    clearSpies(audio);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '23' }));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 23 }]);
  },
};

/** The celebrate star is decoration: a tap on the part outside the display does not speak it. */
export const CelebrateSparkleIsDecorative: Story = {
  globals: { ageMode: 'k' },
  args: { value: 10, state: 'celebrate' },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: '10' });
    const sparkle = button.querySelector('.ni-number__sparkle') as HTMLElement;
    await expect(sparkle).not.toBeNull();
    const box = button.getBoundingClientRect();
    const star = sparkle.getBoundingClientRect();
    // A point on the star's box but outside the display's border box.
    const x = (box.right + star.right) / 2;
    const y = (box.top + star.top) / 2;
    await expect(x).toBeGreaterThan(box.right);
    await expect(y).toBeLessThan(box.top);
    const hit = document.elementFromPoint(x, y);
    await expect(hit === null || !button.contains(hit)).toBe(true);
  },
};
