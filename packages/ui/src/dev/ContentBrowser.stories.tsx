import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { findWidget } from '../test-support/widgetStory';
import { ContentBrowser } from './ContentBrowser';

/**
 * Dev-only Content Browser (03 §10.1 step 9): the content sources compiled in the browser with
 * the same compiler as `pnpm content:build`. Pick a template, scrub the seed and target
 * difficulty, and see the widget, narration text, hints, answer and difficulty breakdown. Answer
 * in the widget to see `checkResponse`, or press "Show me" to play the worked solution.
 */
const meta = {
  title: 'Dev/Content Browser',
  component: ContentBrowser,
  parameters: { layout: 'fullscreen', ui: { stage: 'flush' } },
  args: { initialTemplateId: 'CNT.07.t4', initialSeed: 7 },
} satisfies Meta<typeof ContentBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

const templateSelect = (canvasElement: HTMLElement) =>
  within(canvasElement).getByLabelText('Template') as HTMLSelectElement;

const seedInput = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('spinbutton', { name: 'Seed' }) as HTMLInputElement;

/** The text of a JSON block, by its caption (it may sit in a closed <details>). */
function jsonBlock(canvasElement: HTMLElement, caption: string): string {
  const figure = Array.from(canvasElement.querySelectorAll('figure')).find(
    (f) => f.querySelector('figcaption')?.textContent === caption,
  );
  return figure?.querySelector('pre')?.textContent ?? '';
}

async function expectItemShown(canvasElement: HTMLElement, format: string) {
  const canvas = within(canvasElement);
  await waitFor(() =>
    expect(canvasElement.querySelector(`[data-format="${format}"]`)).not.toBeNull(),
  );
  const host = canvasElement.querySelector(`.ni-widget[data-format="${format}"]`) as HTMLElement;
  await expect(host).toHaveAttribute('data-registered', 'true');
  // The prompt is rendered text, never a bare narration key.
  const prompt = canvas.getByTestId('prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt.textContent ?? '').not.toMatch(/^(tp|p)\.[\w.-]+$/);
  await expect(prompt.textContent?.length ?? 0).toBeGreaterThan(5);
  await expect(canvas.getByTestId('difficulty-total')).toBeVisible();
  await expect(canvas.getByTestId('difficulty-total').textContent).toMatch(/^-?\d+\.\d\d$/);
}

/**
 * Browse: the template list holds every compiled template; switching template or seed regenerates
 * the item and remounts the widget. Ends where it starts (CNT.07.t4, seed 7) for the snapshot.
 */
export const Browse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Content Browser' })).toBeVisible();
    const select = templateSelect(canvasElement);
    await expect(select.options.length).toBeGreaterThan(50);
    await expect(select.querySelectorAll('optgroup').length).toBeGreaterThan(10);
    await expect(select.value).toBe('CNT.07.t4');
    await expectItemShown(canvasElement, 'numeral-pick');
    await findWidget(canvasElement, '.ni-npick');

    // Another template, another widget.
    await userEvent.selectOptions(select, 'ADD.01.t4');
    await expectItemShown(canvasElement, 'number-pad');

    // The filter narrows the list but keeps the current template selectable.
    await userEvent.type(canvas.getByLabelText('Filter'), 'numeral-pick');
    await waitFor(() => expect(select.options.length).toBeLessThan(40));
    for (const o of Array.from(select.options)) {
      if (o.value !== 'ADD.01.t4') await expect(o.textContent).toContain('numeral-pick');
    }
    await userEvent.selectOptions(select, 'CNT.07.t4');
    await userEvent.clear(canvas.getByLabelText('Filter'));
    await expectItemShown(canvasElement, 'numeral-pick');

    // Seed scrubbing: next, then previous, regenerates the item.
    const config = () => jsonBlock(canvasElement, 'Widget config JSON');
    const before = config();
    await userEvent.click(canvas.getByRole('button', { name: 'Next seed' }));
    await expect(seedInput(canvasElement).value).toBe('8');
    await expectItemShown(canvasElement, 'numeral-pick');
    await waitFor(() => expect(config()).not.toBe(before));
    await userEvent.click(canvas.getByRole('button', { name: 'Previous seed' }));
    await expect(seedInput(canvasElement).value).toBe('7');
    await expect(config()).toBe(before);

    // The difficulty breakdown adds up: base + Σ terms = total.
    const rows = canvas
      .getByRole('table', { name: 'Difficulty breakdown' })
      .querySelectorAll('tbody tr');
    const sum = Array.from(rows).reduce(
      (s, r) => s + Number(r.querySelector('td:last-child')?.textContent ?? 0),
      0,
    );
    await expect(sum.toFixed(2)).toBe(canvas.getByTestId('difficulty-total').textContent);
    await findWidget(canvasElement, '.ni-npick');
  },
};

/** Try answers: the widget's response goes through `checkResponse`; "Show me" plays the solution. */
export const TryAnswers: Story = {
  tags: ['!visual'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await findWidget(canvasElement, '.ni-npick');
    const answer = within(canvas.getByRole('region', { name: 'Answer' }));
    const id = /choice (\S+)/.exec(answer.getByText(/^choice /).textContent ?? '')?.[1] as string;
    await expect(id).toMatch(/^opt-/);
    const response = within(canvas.getByRole('region', { name: 'Last response' }));

    // A wrong choice first, then the right one.
    const wrong = canvasElement.querySelector(
      `.ni-npick [data-id]:not([data-id="${id}"])`,
    ) as HTMLElement;
    await userEvent.click(wrong);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(response.getByText('Not correct')).toBeVisible());
    await new Promise((r) => setTimeout(r, 450)); // CheckButton debounce (06 §4)
    await userEvent.click(
      canvasElement.querySelector(`.ni-npick [data-id="${id}"]`) as HTMLElement,
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(response.getByText('Correct')).toBeVisible());
    await expect(response.getByText(/^fb\.correct\./)).toBeVisible();
    await expect(response.getByText(/2 interactions/)).toBeVisible();

    // "Show me" plays the solution through demo mode; the widget is disabled while it plays.
    await userEvent.click(canvas.getByRole('button', { name: 'Show me' }));
    await waitFor(() =>
      expect(canvasElement.querySelector('.ni-npick')).toHaveAttribute('data-disabled', 'true'),
    );
    await waitFor(() => expect(canvas.getByText('Played every step.')).toBeVisible(), {
      timeout: 10_000,
    });
    await expect(canvasElement.querySelector('.ni-npick')).not.toHaveAttribute('data-disabled');
  },
};

/** Target difficulty and K mode on a number-pad template. */
export const TargetedKMode: Story = {
  args: { initialTemplateId: 'ADD.01.t4', initialSeed: 3, initialAgeMode: 'k' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectItemShown(canvasElement, 'number-pad');
    const slider = canvas.getByRole('slider', { name: 'Target difficulty slider' });
    await expect(slider).toBeDisabled();
    await expect(canvas.getByText('untargeted')).toBeVisible();
    await userEvent.click(canvas.getByLabelText('Target difficulty'));
    await expect(slider).toBeEnabled();
    await expect(canvas.queryByText('untargeted')).toBeNull();
    await expect(canvas.getByText(/within p10–p90|outside p10–p90/)).toBeVisible();
    // K mode: the widget's targets use the K size.
    await expect(canvas.getByRole('radio', { name: 'K' })).toBeChecked();
    await expect(canvasElement.querySelector('[data-age-mode="k"] .ni-widget')).not.toBeNull();
    await expectItemShown(canvasElement, 'number-pad');
  },
};
