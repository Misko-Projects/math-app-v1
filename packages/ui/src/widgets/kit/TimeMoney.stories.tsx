import type { StimulusSpec } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { expectHandsLeaveNumerals, expectNumeralsSolid } from '../../test-support/clockChecks';
import { ClockFace, faceTime } from './ClockView';
import { BillArt, CoinArt } from './CoinArt';
import { StimulusView } from './StimulusView';

/**
 * The U05 (#14) pictures: US coins and bills (`coins` stimulus) and the geared clock (`clock`
 * stimulus), as numeral-pick, number-pad and hints show them. Each story checks the maths the
 * picture states: the coins drawn are exactly the spec's, their sizes compare as real coins do,
 * and both hands come from the one time.
 */

const meta = {
  title: 'Widgets/Kit/Time and money',
  parameters: { ui: { stage: 'centered' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const COINS = ['penny', 'nickel', 'dime', 'quarter'] as const;

/** Every coin and a bill, side by side at one scale: dime < penny < nickel < quarter. */
export const CoinsAndBills: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      {COINS.map((c) => (
        <CoinArt key={c} kind={c} quarterPx={120} />
      ))}
      <BillArt dollars={1} height={96} />
      <BillArt dollars={5} height={96} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const d = (c: string) =>
      Number(canvasElement.querySelector(`[data-coin="${c}"]`)?.getAttribute('data-diameter'));
    await expect(d('dime')).toBeLessThan(d('penny'));
    await expect(d('penny')).toBeLessThan(d('nickel'));
    await expect(d('nickel')).toBeLessThan(d('quarter'));
    await expect(d('quarter')).toBeCloseTo(120, 1);
    // Faces: shell, wave, star, sun (no words, no portraits).
    const faces = COINS.map((c) =>
      canvasElement.querySelector(`[data-coin="${c}"] [data-face]`)?.getAttribute('data-face'),
    );
    await expect(faces).toEqual(['shell', 'wave', 'star', 'sun']);
    await expect(canvasElement.querySelectorAll('[data-bill]')).toHaveLength(2);
  },
};

const coinsSpec: StimulusSpec = {
  kind: 'coins',
  coins: ['quarter', 'quarter', 'dime', 'nickel', 'penny', 'penny', 'penny'],
  bills: [1],
};

/** A `coins` stimulus: $1.68 as a bill and seven coins; the picture is worth exactly that. */
export const CoinsStimulus: Story = {
  render: () => <StimulusView spec={coinsSpec} />,
  play: async ({ canvasElement }) => {
    const pic = within(canvasElement).getByRole('img', { name: 'Look at the picture' });
    await expect(pic).toHaveAttribute('data-cents', '168');
    await expect(canvasElement.querySelectorAll('.ni-coin-art')).toHaveLength(7);
    await expect(canvasElement.querySelectorAll('.ni-bill-art')).toHaveLength(1);
    await expect(canvasElement.querySelector('[data-unsupported]')).toBeNull();
  },
};

const TIMES: [number, number][] = [
  [3, 0],
  [3, 30],
  [9, 45],
  [12, 5],
  [6, 59],
];

/**
 * `clock` stimuli: at every time both hands come from the one time (hour 30° an hour + 0.5° a
 * minute, minute 6° a minute); 3:30 has the short hand exactly halfway between 3 and 4. With
 * `digital`, the readout says the same time.
 */
export const ClockStimulus: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
      {TIMES.map(([h, m], i) => (
        <StimulusView
          key={`${h}:${m}`}
          spec={{ kind: 'clock', h, m, numerals: i % 2 === 0, digital: i === 1 }}
          maxHeight={230}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const faces = [...canvasElement.querySelectorAll<SVGSVGElement>('.ni-clock')];
    await expect(faces).toHaveLength(TIMES.length);
    for (const [i, [h, m]] of TIMES.entries()) {
      const face = faces[i] as SVGSVGElement;
      await expect(face.getAttribute('data-time')).toBe(`${h}:${String(m).padStart(2, '0')}`);
      const hour = Number(face.querySelector('[data-hand="hour"]')?.getAttribute('data-angle'));
      const minute = Number(face.querySelector('[data-hand="minute"]')?.getAttribute('data-angle'));
      await expect(hour).toBeCloseTo((h % 12) * 30 + m * 0.5, 2);
      await expect(minute).toBeCloseTo(m * 6, 2);
      await expect(face.querySelectorAll('[data-tick]')).toHaveLength(60);
    }
    const half = faces[1] as SVGSVGElement;
    await expect(Number(half.querySelector('[data-hand="hour"]')?.getAttribute('data-angle'))).toBe(
      105,
    );
    await expect(canvasElement.querySelector('.ni-digital')).toHaveAttribute('data-time', '3:30');
    await expect(canvasElement.querySelector('[data-unsupported]')).toBeNull();
  },
};

/**
 * The hands over the numbers at 12:00, 3:00, 6:00 and 9:00: the long hand reaches the minute
 * ticks but slims to a needle across the number it points at, the short hand stops short of the
 * numbers, so every number stays readable (≤ 20% of its box under a hand); every number is the
 * same solid ink, nothing pale over it.
 */
export const ClockNumbersReadable: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
      {[12, 3, 6, 9].map((h) => (
        <ClockFace key={h} t={faceTime(h, 0)} size={288} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const faces = [...canvasElement.querySelectorAll<SVGSVGElement>('.ni-clock')];
    await expect(faces).toHaveLength(4);
    for (const face of faces) {
      await expectNumeralsSolid(face);
      await expectHandsLeaveNumerals(face, 0.2);
    }
  },
};
