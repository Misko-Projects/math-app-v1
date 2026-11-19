import type { StimulusSpec } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { expectTargetGaps, expectTargetSize } from '../../test-support/storyHelpers';
import { NumeralTray, PickCard } from './controls';
import { NumberBondView, StimulusView } from './StimulusView';
import { ObjectSprite, SPRITE_IDS } from './sprites';

/**
 * The shared widget kit (U03): the pictures every number-sense widget shows, the countable
 * sprites, and the choice controls. Use the a11y addon's vision simulator (toolbar → Vision) to
 * check that groups and selections stay distinct under colour-vision deficiencies (06 §7): groups
 * differ in lightness and position, and a picked card has an ink ring and a check badge.
 */
const meta = {
  title: 'Widgets/Kit',
  parameters: { ui: { stage: 'padded' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PICTURES: { name: string; spec: StimulusSpec }[] = [
  {
    name: 'objects · line, two groups',
    spec: {
      kind: 'objects',
      set: { count: 7, sprite: 'fish', layout: 'line', groups: [4, 3], layoutSeed: 3 },
    },
  },
  {
    name: 'objects · scatter',
    spec: { kind: 'objects', set: { count: 9, sprite: 'shell', layout: 'scatter', layoutSeed: 7 } },
  },
  {
    name: 'objects · circle',
    spec: {
      kind: 'objects',
      set: { count: 8, sprite: 'starfish', layout: 'circle', layoutSeed: 1 },
    },
  },
  {
    name: 'objects · array 3 × 4',
    spec: {
      kind: 'objects',
      set: { count: 12, sprite: 'leaf', layout: 'array', rows: 3, layoutSeed: 1 },
    },
  },
  {
    name: 'objects · double ten-frame',
    spec: {
      kind: 'objects',
      set: { count: 15, sprite: 'crab', layout: 'double-ten-frame', layoutSeed: 1 },
    },
  },
  {
    name: 'objects · distractors, sizes vary',
    spec: {
      kind: 'objects',
      set: {
        count: 5,
        sprite: 'fish',
        layout: 'scatter',
        distractors: { sprite: 'crab', count: 3 },
        sizeVaries: true,
        layoutSeed: 11,
      },
    },
  },
  { name: 'dots · dice 5 + 3', spec: { kind: 'dots', arrangement: 'dice', groups: [5, 3] } },
  { name: 'dots · five-frame', spec: { kind: 'dots', arrangement: 'five-frame', groups: [3, 1] } },
  { name: 'dots · fingers 5 + 3', spec: { kind: 'dots', arrangement: 'fingers', groups: [5, 3] } },
  {
    name: 'ten-frame · 7 + 3',
    spec: {
      kind: 'ten-frame',
      frames: 1,
      filled: [10],
      colors: [['a', 'a', 'a', 'a', 'a', 'a', 'a', 'b', 'b', 'b']],
    },
  },
  { name: 'rekenrek · 7 and 4', spec: { kind: 'rekenrek', rows: [7, 4] } },
  {
    name: 'number line · jumps',
    spec: {
      kind: 'number-line',
      min: 0,
      max: 10,
      ticksEvery: 1,
      labelsEvery: 1,
      marks: [{ at: 7, arrow: true }],
      jumps: [
        { from: 3, to: 5 },
        { from: 5, to: 7 },
      ],
    },
  },
  { name: 'number bond · 8 = 5 + ?', spec: { kind: 'number-bond', whole: 8, parts: [5, '?'] } },
  {
    name: 'expression',
    spec: {
      kind: 'expression',
      expr: {
        tokens: [
          { t: 'num', v: 7 },
          { t: 'op', v: '+' },
          { t: 'blank', id: 'x' },
          { t: 'rel', v: '=' },
          { t: 'num', v: 10 },
        ],
      },
    },
  },
  { name: 'groups · 3 of 4', spec: { kind: 'groups', groups: 3, perGroup: 4, sprite: 'shell' } },
  { name: 'base ten · 34', spec: { kind: 'base-ten', hundreds: 0, tens: 3, ones: 4 } },
  {
    name: 'base ten · 1,000 and 100 (a cube has depth)',
    spec: { kind: 'base-ten', thousands: 1, hundreds: 1, tens: 0, ones: 0 },
  },
];

/** Every picture kind the number-sense widgets render (03 §5.1 `StimulusSpec`). */
export const Pictures: Story = {
  render: () => (
    <div className="story-grid" style={{ '--story-col': '520px' } as CSSProperties}>
      {PICTURES.map((p) => (
        <div key={p.name} className="story-cell">
          <StimulusView spec={p.spec} maxWidth={480} maxHeight={220} />
          <span className="story-cell__name">{p.name}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Pictures never announce the quantity (that is the question), only "Look at the picture".
    const named = within(canvasElement).getAllByRole('img', { name: 'Look at the picture' });
    // The expression is text a screen reader reads as is.
    await expect(named.length).toBe(PICTURES.length - 1);
    // A thousands cube must not look like a hundreds flat: it has bordered depth faces (borders,
    // unlike shadows, survive forced-colors mode).
    const cube = canvasElement.querySelector('.ni-baseten__block--cube') as HTMLElement;
    const flat = canvasElement.querySelector('.ni-baseten__block--flat') as HTMLElement;
    for (const face of ['::before', '::after']) {
      await expect(getComputedStyle(flat, face).content).toBe('none');
      await expect(getComputedStyle(cube, face).content).not.toBe('none');
      await expect(getComputedStyle(cube, face).borderTopStyle).toBe('solid');
    }
  },
};

/**
 * A number bond whose slots are controls (`renderSlot`, as the number-bond widget uses it): the
 * slots stay buttons for assistive technology, with or without a group label.
 */
export const BondWithControls: Story = {
  render: () => (
    <div className="story-row" style={{ gap: 64 }}>
      {[undefined, 'Number bond'].map((label) => (
        <NumberBondView
          key={label ?? 'none'}
          whole={7}
          parts={[3, null]}
          label={label}
          renderSlot={(slot, value) => (
            <button
              type="button"
              className="ni-bond__circle"
              aria-label={`${slot} ${value ?? ''}`.trim()}
            >
              {value ?? ''}
            </button>
          )}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('button', { name: 'part-1' })).toHaveLength(2);
    await expect(canvas.getByRole('group', { name: 'Number bond' })).toBeVisible();
    const slot = canvas.getAllByRole('button', { name: 'whole 7' })[0] as HTMLElement;
    slot.focus();
    await expect(slot).toHaveFocus();
  },
};

/**
 * A hidden term on a numbered line: the "?" mark replaces the tick's numeral (the answer 3 is
 * never printed under it); a bare arrow mark keeps its numeral (a count.sequence start).
 */
export const NumberLineHiddenTerm: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 32 }}>
      <div data-testid="hidden">
        <StimulusView
          spec={{
            kind: 'number-line',
            min: 0,
            max: 5,
            ticksEvery: 1,
            labelsEvery: 1,
            marks: [{ at: 3, label: '?' }],
          }}
          maxWidth={700}
        />
      </div>
      <div data-testid="start">
        <StimulusView
          spec={{
            kind: 'number-line',
            min: 31,
            max: 36,
            ticksEvery: 1,
            labelsEvery: 1,
            marks: [{ at: 33, arrow: true }],
          }}
          maxWidth={700}
        />
      </div>
      <div data-testid="decimal">
        <StimulusView
          spec={{
            kind: 'number-line',
            min: 0,
            max: 0.5,
            ticksEvery: 0.1,
            labelsEvery: 0.1,
            // A computed coordinate (0.30000000000000004) still hides the 0.3 numeral.
            marks: [{ at: 0.1 + 0.2, label: '?' }],
          }}
          maxWidth={700}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const texts = (id: string) =>
      [
        ...(canvasElement.querySelector(`[data-testid="${id}"]`) as HTMLElement).querySelectorAll(
          'text',
        ),
      ].map((t) => t.textContent);
    await expect(texts('hidden')).toEqual(expect.arrayContaining(['?', '2', '4']));
    await expect(texts('hidden')).not.toContain('3');
    await expect(texts('start')).toContain('33');
    await expect(texts('decimal')).toEqual(expect.arrayContaining(['?', '0.2', '0.4']));
    await expect(texts('decimal')).not.toContain('0.3');
  },
};

/**
 * A 0–20 tray in a padded 680 px box (584 px of content): balanced rows (5 + 4 + 4 + 4 + 4),
 * every card inside the tray. Narrowing the box reflows the rows without remounting any card,
 * so keyboard focus stays put.
 */
export const TrayTwentyK: Story = {
  globals: { ageMode: 'k' },
  render: () => (
    <div data-testid="box" style={{ width: 680, padding: '0 48px', boxSizing: 'border-box' }}>
      <NumeralTray
        values={Array.from({ length: 21 }, (_, i) => i)}
        selected={null}
        onPick={() => {}}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('group', { name: 'Numbers' });
    const rowsOf = () => {
      const rows = new Map<number, number>();
      for (const c of within(tray).getAllByRole('button')) {
        const top = Math.round(c.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      return [...rows.values()];
    };
    await waitFor(() => expect(rowsOf()).toEqual([5, 4, 4, 4, 4]));
    const t = tray.getBoundingClientRect();
    for (const c of within(tray).getAllByRole('button')) {
      const r = c.getBoundingClientRect();
      await expect(r.left).toBeGreaterThanOrEqual(t.left - 0.5);
      await expect(r.right).toBeLessThanOrEqual(t.right + 0.5);
    }
    await expectTargetGaps(within(tray).getAllByRole('button'));
    // Focus survives a reflow: focus 5, narrow the box, the same button still has focus.
    const five = within(tray).getByRole('button', { name: '5' });
    five.focus();
    (canvasElement.querySelector('[data-testid="box"]') as HTMLElement).style.width = '560px';
    await waitFor(() => expect(rowsOf().length).toBe(6));
    await expect(within(tray).getByRole('button', { name: '5' })).toBe(five);
    await expect(five).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(five).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Countable sprites in both group tones (tone b differs in lightness, not only hue). */
export const Sprites: Story = {
  render: () => (
    <div className="story-grid" style={{ '--story-col': '150px' } as CSSProperties}>
      {SPRITE_IDS.map((id) => (
        <div key={id} className="story-cell">
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ width: 72, height: 72 }}>
              <ObjectSprite sprite={id} tone="a" />
            </span>
            <span style={{ width: 72, height: 72 }}>
              <ObjectSprite sprite={id} tone="b" />
            </span>
          </div>
          <span className="story-cell__name">{id}</span>
        </div>
      ))}
    </div>
  ),
};

function TrayDemo() {
  const [picked, setPicked] = useState<number | null>(3);
  return (
    <div style={{ display: 'grid', gap: 32, justifyItems: 'center' }}>
      <NumeralTray
        values={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        selected={picked}
        onPick={setPicked}
      />
      <div className="story-row" style={{ gap: 40 }}>
        {(
          [
            ['idle', 4, {}],
            ['picked', 5, { selected: true }],
            ['shown by Pip (demo)', 6, { highlighted: true }],
            ['off', 7, { disabled: true }],
          ] as const
        ).map(([state, n, flags]) => (
          <div key={state} className="story-cell">
            <PickCard
              label={String(n)}
              selected={'selected' in flags}
              highlighted={'highlighted' in flags}
              disabled={'disabled' in flags}
              onPress={() => {}}
            >
              <span className="ni-pick__numeral">{n}</span>
            </PickCard>
            <span className="story-cell__name">{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The numeral tray (0–10) and pick-card states, in K mode (≥ 80 px, ≥ 12 px apart). */
export const ChoicesK: Story = {
  globals: { ageMode: 'k' },
  render: () => <TrayDemo />,
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('group', { name: 'Numbers' });
    const cards = within(tray).getAllByRole('button');
    await expect(cards).toHaveLength(11);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    // Balanced rows: when the tray wraps, no row is left with a lonely card.
    const rows = new Map<number, number>();
    for (const c of cards) {
      const top = Math.round(c.getBoundingClientRect().top);
      rows.set(top, (rows.get(top) ?? 0) + 1);
    }
    const counts = [...rows.values()];
    await expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // Equal cards: "10" is not a bigger target than "9".
    await expect(new Set(cards.map((c) => Math.round(c.getBoundingClientRect().width))).size).toBe(
      1,
    );
    await userEvent.click(within(tray).getByRole('button', { name: '9' }));
    await expect(within(tray).getByRole('button', { name: '9' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
