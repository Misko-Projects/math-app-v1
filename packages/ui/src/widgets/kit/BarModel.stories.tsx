import type { StimulusSpec } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { pieceNeed } from './barModel';
import { StimulusView } from './StimulusView';

/**
 * The bar model (#17 slice 4d), as the story widget and the hint picture draw it: part–part–whole,
 * a comparison, and the two-step bars. Each story checks that the numerals are 32 px, no piece is
 * narrower than MIN_PIECE, the unknown is a "?" and the accessible name never states it.
 */

const meta = {
  title: 'Widgets/Kit/Bar model',
  parameters: { ui: { stage: 'centered' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

async function check(root: HTMLElement, unknown: number, pieces: number) {
  const bar = root.querySelector('.ni-bar') as HTMLElement;
  await expect(bar).toBeTruthy();
  const name = bar.getAttribute('aria-label') ?? '';
  await expect(name).not.toMatch(new RegExp(`\\b${unknown}\\b`));
  await expect(name).not.toMatch(/\b(add|subtract|plus|minus|take)\b/i);
  const ps = [...root.querySelectorAll<HTMLElement>('.ni-bar__piece')];
  await expect(ps).toHaveLength(pieces);
  for (const p of ps) {
    await expect(p.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      pieceNeed(p.textContent ?? '') - 1,
    );
    await expect(Number.parseFloat(getComputedStyle(p).fontSize)).toBeGreaterThanOrEqual(32);
  }
  for (const w of root.querySelectorAll<HTMLElement>('.ni-bar__whole'))
    await expect(Number.parseFloat(getComputedStyle(w).fontSize)).toBeGreaterThanOrEqual(32);
  await expect(root.textContent ?? '').not.toMatch(new RegExp(`\\b${unknown}\\b`));
  await expect(within(root).getAllByText('?').length).toBeGreaterThanOrEqual(1);
}

const partWhole: StimulusSpec = { kind: 'bar-model', parts: [45, '?'], whole: 72 };
/** Part–part–whole with the unknown part: 45 and ? make 72 (? is 27). */
export const PartUnknown: Story = {
  render: () => <StimulusView spec={partWhole} maxWidth={360} />,
  play: async ({ canvasElement }) => check(canvasElement, 27, 2),
};

const total: StimulusSpec = { kind: 'bar-model', parts: [38, 25, 12], whole: '?' };
/** Three parts, the whole unknown (75). */
export const WholeUnknown: Story = {
  render: () => <StimulusView spec={total} maxWidth={360} />,
  play: async ({ canvasElement }) => check(canvasElement, 75, 3),
};

const compare: StimulusSpec = {
  kind: 'bar-model',
  parts: [45, '?'],
  whole: 72,
  compare: { bigger: 72, smaller: 45 },
};
/** A comparison: 72 and 45, how many more (27). */
export const Compare: Story = {
  render: () => <StimulusView spec={compare} maxWidth={360} />,
  play: async ({ canvasElement }) => {
    await check(canvasElement, 27, 3);
    const [big, , extra] = canvasElement.querySelectorAll<HTMLElement>('.ni-bar__piece');
    const b = big?.getBoundingClientRect();
    const e = extra?.getBoundingClientRect();
    await expect(Math.abs((b?.right ?? 0) - (e?.right ?? 0))).toBeLessThanOrEqual(2);
  },
};

const twoStep: StimulusSpec = {
  kind: 'bar-model',
  parts: [15, null],
  whole: 60,
  lower: { parts: [null, 22], whole: '?' },
};
/** Two steps: 60, 15 go, 22 come (67); the blank part is shared by both bars. */
export const TwoSteps: Story = {
  render: () => <StimulusView spec={twoStep} maxWidth={420} />,
  play: async ({ canvasElement }) => {
    await check(canvasElement, 67, 4);
    const blanks = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind="first"]')];
    await expect(blanks).toHaveLength(2);
    const [a, b] = blanks.map((p) => p.getBoundingClientRect());
    await expect(Math.abs((a?.left ?? 0) - (b?.left ?? 9))).toBeLessThanOrEqual(1);
    await expect(Math.abs((a?.width ?? 0) - (b?.width ?? 9))).toBeLessThanOrEqual(1);
  },
};
