import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { createAudioManager } from '../AudioManager';
import { MUSIC_IDS } from '../music/tracks';
import { SFX_IDS } from '../sfx/catalog';
import type { SpeechBackend } from '../speech';
import { asAudioContext, FakeAudioContext, fakeEncodedClip } from '../testing/fakeAudioContext';
import { AudioLab, type ClipSource } from './AudioLab';
import { labManifest, labNarration } from './labNarration';

const meta = {
  title: 'Audio/Audio Lab',
  component: AudioLab,
  parameters: { layout: 'fullscreen', ui: { stage: 'flush' } },
} satisfies Meta<typeof AudioLab>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The real AudioManager. Tap "Tap to start audio", then play any SFX, music track, sample line or
 * composed number. "No manifest: Web Speech" shows the on-device fallback.
 */
export const Lab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Audio Lab' })).toBeVisible();
    // Every 05 §12 sound effect and every music track has a button.
    const sfx = within(canvas.getByRole('region', { name: 'Sound effects' })).getAllByRole(
      'button',
    );
    await expect(sfx).toHaveLength(SFX_IDS.length);
    const tracks = within(canvas.getByRole('region', { name: 'Music' })).getAllByRole('button');
    await expect(tracks).toHaveLength(MUSIC_IDS.length);

    // The number composer shows the caption, the words and the clips (03 §8.3).
    const composer = within(canvas.getByRole('region', { name: 'Number composer' }));
    await expect(composer.getByText('12,345')).toBeVisible();
    await expect(composer.getByText('“twelve thousand three hundred forty-five”')).toBeVisible();
    const chips = within(composer.getByRole('list', { name: 'Clips' }));
    await expect(chips.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'num.12',
      'num.thousand',
      'num.3',
      'num.hundred',
      'num.45.end',
    ]);

    await userEvent.selectOptions(composer.getByLabelText('Slot type'), 'dollars');
    await expect(composer.getByText('$1.25')).toBeVisible();
    await expect(composer.getByText('“one dollar and twenty-five cents”')).toBeVisible();

    await userEvent.clear(composer.getByLabelText('Value'));
    await userEvent.type(composer.getByLabelText('Value'), 'lots');
    // A friendly, slot-aware message; the precise reason stays out of sight in data-detail.
    const value = composer.getByLabelText('Value');
    await expect(value).toHaveAttribute('aria-invalid', 'true');
    await expect(value).toHaveAccessibleDescription(
      'Enter the amount in cents, like 125 for $1.25.',
    );
    const hint = composer.getByText('Enter the amount in cents, like 125 for $1.25.');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveAttribute('data-detail', 'slot $v needs an integer, got "lots"');
    await expect(composer.queryByText(/\$v/)).toBeNull();
    await expect(composer.getByRole('button', { name: 'Say it' })).toBeDisabled();

    // Back to a valid value: the error state clears.
    await userEvent.clear(value);
    await userEvent.type(value, '305');
    await expect(value).not.toHaveAttribute('aria-invalid');
    await expect(composer.getByText('“three dollars and five cents”')).toBeVisible();
    await userEvent.clear(value);
    await userEvent.type(value, 'lots');
  },
};

/** The lab in its Web Speech fallback mode (no manifest). */
export const WebSpeechFallback: Story = {
  args: { initialSource: 'speech' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'No manifest: Web Speech' })).toBeChecked();
  },
};

class ScriptedSpeech implements SpeechBackend {
  available = true;
  readonly said: string[] = [];
  speak(text: string) {
    this.said.push(text);
    return { done: new Promise<void>(() => {}), cancel: () => {} };
  }
  cancel() {}
  prime() {}
}

/**
 * Test-only: the lab on a scripted engine (fake AudioContext), so the play function can check the
 * caption, clip list and event log without real audio output.
 */
export const ScriptedEngine: Story = {
  tags: ['!dev', '!autodocs'],
  args: {
    createManager: (source: ClipSource) => {
      const ctx = new FakeAudioContext();
      const manifest = source === 'demo' ? labManifest() : null;
      return createAudioManager({
        narration: labNarration,
        manifest,
        createContext: () => asAudioContext(ctx),
        fetchClip: async (url) => fakeEncodedClip(url, 0.4),
        speech: new ScriptedSpeech(),
        warn: () => {},
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tap to start audio' }));
    await waitFor(() => expect(canvas.getByText('Audio on')).toBeVisible());

    await userEvent.click(canvas.getByRole('button', { name: /Prompt with numbers/ }));
    const now = within(canvas.getByRole('region', { name: 'Now speaking' }));
    await waitFor(() =>
      expect(now.getByText('Fill the shell to make ten. How many is 7 + 3?')).toBeVisible(),
    );
    await expect(now.getByText('Stitched clips')).toBeVisible();
    const clips = within(now.getByRole('list', { name: 'Clips of the current line' }));
    await expect(clips.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'tp.ADD.08.t1.prompt',
      'num.7',
      'tp.ADD.08.t1.prompt#1',
      'num.3.end',
      'tp.ADD.08.t1.prompt#2',
    ]);

    // A new line cuts in: the log records the cancellation.
    await userEvent.click(canvas.getByRole('button', { name: /Guide welcome/ }));
    await waitFor(() => expect(now.getByText('Line 1 cancelled')).toBeVisible());

    // Switching to the fallback routes the next line through Web Speech.
    await userEvent.click(canvas.getByRole('radio', { name: 'No manifest: Web Speech' }));
    await waitFor(() => expect(canvas.getByText('Audio on')).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: /Money/ }));
    await waitFor(() => expect(now.getByText('Web Speech')).toBeVisible());
    await expect(now.getByText('Pay $1.25.')).toBeVisible();
  },
};
