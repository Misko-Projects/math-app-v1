import type { StimulusSpec } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { expectTargetGaps, expectTargetSize } from '../../test-support/storyHelpers';
import { expectHandClearOfOthers, expectPointerOn } from '../../test-support/widgetStory';
import { layoutBox, NumeralTray, PickCard } from './controls';
import { useInviteHand } from './inviteHand';
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
 * never printed under it); a bare arrow mark keeps its numeral (a count.sequence start). Each
 * row is captioned, so the start marker is not mistaken for a hidden term.
 */
export const NumberLineHiddenTerm: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 4 }}>
      <div data-testid="hidden" className="story-cell">
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
        <span className="story-cell__name">hidden term: numeral hidden</span>
      </div>
      <div data-testid="start" className="story-cell">
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
        <span className="story-cell__name">start marker: numeral shown</span>
      </div>
      <div data-testid="decimal" className="story-cell">
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
        <span className="story-cell__name">hidden decimal term: numeral hidden</span>
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

function TrayTwenty({ highlighted = null }: { highlighted?: number | null }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div data-testid="box" style={{ width: 1000, maxWidth: '100%', marginInline: 'auto' }}>
      <NumeralTray
        values={Array.from({ length: 21 }, (_, i) => i)}
        selected={picked}
        onPick={setPicked}
        highlighted={highlighted}
      />
    </div>
  );
}

/** Card counts per laid-out row, top to bottom (by untransformed offsetTop). */
function trayRows(tray: HTMLElement): number[] {
  const rows = new Map<number, number>();
  for (const c of within(tray).getAllByRole('button')) {
    const top = c.offsetTop; // layout position: a pulsing card is scaled, not moved
    rows.set(top, (rows.get(top) ?? 0) + 1);
  }
  return [...rows.values()];
}

/** Sets the story box so the tray's content box is exactly `content` px wide. */
function setTrayContentWidth(canvasElement: HTMLElement, tray: HTMLElement, content: number) {
  const box = layoutBox(getComputedStyle(tray));
  const edges = box.border - box.content;
  (canvasElement.querySelector('[data-testid="box"]') as HTMLElement).style.width =
    `${content + edges}px`;
}

/** Every card inside the tray, and every full row's columns lined up with the first row's. */
async function expectEvenGrid(tray: HTMLElement) {
  const t = tray.getBoundingClientRect();
  const cards = within(tray).getAllByRole('button');
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    await expect(r.left).toBeGreaterThanOrEqual(t.left - 0.5);
    await expect(r.right).toBeLessThanOrEqual(t.right + 0.5);
  }
  const rows = trayRows(tray);
  const cols = rows[0] ?? 0;
  const firstLefts = cards.slice(0, cols).map((c) => c.offsetLeft);
  let i = 0;
  for (const size of rows) {
    if (size === cols) {
      const lefts = cards.slice(i, i + size).map((c) => c.offsetLeft);
      await expect(lefts).toEqual(firstLefts);
    }
    i += size;
  }
}

/**
 * A 0–20 tray in a 1000 px box: a visible tray panel with an even 7 × 3 grid, centred. Narrowed
 * to a fractional 771.75 px of content (one hair short of seven 100 px cards and six 12 px gaps),
 * it reflows to 6 + 6 + 6 + 3 (even columns, short last row centred) without remounting any card,
 * so keyboard focus stays put and Enter still picks the focused card.
 */
export const TrayTwentyK: Story = {
  globals: { ageMode: 'k' },
  render: () => <TrayTwenty />,
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('group', { name: 'Numbers' });
    await waitFor(() => expect(trayRows(tray)).toEqual([7, 7, 7]));
    await expectEvenGrid(tray);
    await expectTargetGaps(within(tray).getAllByRole('button'));
    // A visible tray: a filled panel with a border, not bare cards on the page.
    const panel = getComputedStyle(tray);
    await expect(panel.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    await expect(Number.parseFloat(panel.borderTopWidth)).toBeGreaterThan(0);
    // Focus survives a reflow to a fractional content width: focus 5, narrow the tray, wait for
    // the new grid, and the same button still has focus and picks on Enter.
    const five = within(tray).getByRole('button', { name: '5' });
    five.focus();
    setTrayContentWidth(canvasElement, tray, 771.75);
    await waitFor(() => expect(trayRows(tray)).toEqual([6, 6, 6, 3]));
    await expectEvenGrid(tray);
    await expect(within(tray).getByRole('button', { name: '5' })).toBe(five);
    await expect(five).toHaveFocus();
    await expect(five).toHaveAttribute('aria-pressed', 'false');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(five).toHaveAttribute('aria-pressed', 'true'));
    // Back to the full width: 7 × 3 again, still the same focused card.
    (canvasElement.querySelector('[data-testid="box"]') as HTMLElement).style.width = '1000px';
    await waitFor(() => expect(trayRows(tray)).toEqual([7, 7, 7]));
    await expectEvenGrid(tray);
    await expect(five).toHaveFocus();
    // The picked card's check badge stays clear of its right-hand neighbour.
    const badge = five.querySelector('.ni-pick__badge') as HTMLElement;
    const six = within(tray).getByRole('button', { name: '6' });
    await expect(
      six.getBoundingClientRect().left - badge.getBoundingClientRect().right,
    ).toBeGreaterThanOrEqual(4);
  },
};

/**
 * The same tray with a demo invite on 0. Its pulse scales the card (up to 1.05×) without changing
 * its layout width, so a resize at the pulse's peak must still plan the grid from the 100 px
 * layout width: at exactly 772 px of content seven cards fit (7 × 3). With reduced motion the
 * invite is a static ring (no pulse) and the same grid holds.
 */
export const TrayTwentyInviteK: Story = {
  globals: { ageMode: 'k' },
  render: () => <TrayTwenty highlighted={0} />,
  play: async ({ canvasElement, globals }) => {
    const tray = within(canvasElement).getByRole('group', { name: 'Numbers' });
    await waitFor(() => expect(trayRows(tray)).toEqual([7, 7, 7]));
    const zero = within(tray).getByRole('button', { name: '0' });
    await expect(zero).toHaveClass('ni-invite');
    // The Motion toolbar ("reduced") or the system preference turns the pulse off.
    const reduced =
      globals.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulses = zero.getAnimations();
    if (reduced) {
      await expect(pulses).toHaveLength(0);
    } else {
      // Hold the pulse at its 50% keyframe (scale 1.05).
      await expect(pulses.length).toBeGreaterThan(0);
      for (const a of pulses) {
        const duration = Number(a.effect?.getComputedTiming().duration) || 0;
        a.pause();
        a.currentTime = duration / 2;
      }
      await waitFor(() =>
        expect(zero.getBoundingClientRect().width).toBeGreaterThan(zero.offsetWidth * 1.04),
      );
    }
    // At the pulse's peak (or static, with reduced motion) the invite ring stays clear of the
    // next card: the outline's outer edge (offset + width, scaled with the card) is left of "1".
    const ring = getComputedStyle(zero);
    const zr = zero.getBoundingClientRect();
    const scale = zr.width / zero.offsetWidth;
    const ringEdge =
      zr.right +
      (Number.parseFloat(ring.outlineOffset) + Number.parseFloat(ring.outlineWidth)) * scale;
    const one = within(tray).getByRole('button', { name: '1' });
    await expect(one.getBoundingClientRect().left - ringEdge).toBeGreaterThanOrEqual(2);
    setTrayContentWidth(canvasElement, tray, 772);
    // Let the resize observer run and React re-render, then check the grid it planned (a
    // transformed measurement would have planned 6 a row: 6 + 6 + 6 + 3).
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 100));
    await expect(trayRows(tray)).toEqual([7, 7, 7]);
    await expect(layoutBox(getComputedStyle(tray)).content).toBeCloseTo(772, 1);
  },
};

/** TrayTwentyInviteK with the Motion toolbar on Reduced motion: a static invite ring, same grid. */
export const TrayTwentyInviteReducedK: Story = {
  ...TrayTwentyInviteK,
  globals: { ageMode: 'k', motion: 'reduced' },
};

/**
 * A G1+ 0–9 tray exactly at a fractional fit boundary: four 73.59375 px cards and three 12 px
 * gaps take 330.375 px, so a tray with 330.375 px of content fits 4 a row (4 + 4 + 2), even
 * though computed styles serialize the card as 73.5938 px. One layout unit (1/64 px) narrower,
 * only 3 fit, and the even grid becomes 2 × 5 (3 + 3 + 3 + 1 would leave a lone card). Pinned to
 * G1+, whose card geometry it asserts.
 */
export const TrayTenBoundary: Story = {
  globals: { ageMode: 'g1-up' },
  render: () => (
    <div data-testid="box" style={{ width: 400 }}>
      <NumeralTray
        values={Array.from({ length: 10 }, (_, i) => i)}
        selected={null}
        onPick={() => {}}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('group', { name: 'Numbers' });
    const card = within(tray).getByRole('button', { name: '0' });
    await expect(card.getBoundingClientRect().width).toBeCloseTo(73.59375, 4);
    setTrayContentWidth(canvasElement, tray, 330.375);
    await waitFor(() => expect(layoutBox(getComputedStyle(tray)).content).toBeCloseTo(330.375, 3));
    await waitFor(() => expect(trayRows(tray)).toEqual([4, 4, 2]));
    setTrayContentWidth(canvasElement, tray, 330.375 - 1 / 64);
    await waitFor(() => expect(trayRows(tray)).toEqual([2, 2, 2, 2, 2]));
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

// ---------- Pip's invite hand: never over another control ----------

/**
 * A 3 × 3 grid of K buttons with Pip's invite on one of them (kit `useInviteHand`, no fixed side).
 * `colGap` / `rowGap` set the room between the buttons.
 */
function InviteGrid({
  invite,
  colGap,
  rowGap,
  padTop = 24,
}: {
  invite: number;
  colGap: number;
  rowGap: number;
  padTop?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { hand, rootStyle } = useInviteHand(
    ref,
    (root) =>
      [...root.querySelectorAll<HTMLElement>('[data-cell]')].find(
        (el) => el.dataset.cell === String(invite),
      ) ?? null,
    `cell:${invite}`,
  );
  return (
    <div
      ref={ref}
      data-testid="grid"
      style={{
        position: 'relative',
        display: 'inline-grid',
        gridTemplateColumns: 'repeat(3, 80px)',
        gridAutoRows: '80px',
        gap: `${rowGap}px ${colGap}px`,
        padding: 24,
        paddingTop: padTop,
        ...rootStyle,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed cells
          key={i}
          type="button"
          data-cell={i}
          className={i === invite ? 'ni-invite' : undefined}
          style={{
            width: 80,
            height: 80,
            border: '3px solid var(--color-ink)',
            borderRadius: 16,
            background: 'var(--color-cloud)',
            font: '800 32px var(--font-display)',
          }}
        >
          <span className="ni-invite-glyph">{i + 1}</span>
        </button>
      ))}
      {hand}
    </div>
  );
}

/** The hand at rest: which way it points and its fingertip on the invited button. */
async function inviteHandOn(canvasElement: HTMLElement, invite: number) {
  const grid = within(canvasElement).getByTestId('grid');
  await waitFor(() => expect(grid.querySelector('.ni-hand svg')).not.toBeNull());
  // Placed again once the fonts are in (a numeral's box sets the room around it).
  await document.fonts?.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const target = grid.querySelector(`[data-cell="${invite}"]`) as HTMLElement;
  await expectPointerOn(grid.querySelector('.ni-hand') as HTMLElement, target, grid);
  return {
    grid,
    target,
    direction: (grid.querySelector('.ni-hand svg') as SVGElement).dataset.direction,
  };
}

/**
 * The middle button of a 3 × 3 grid whose rows are only 16 px apart: Pip's hand below it would
 * cover the button under it (and above it, the one over it), so the kit points from beside it,
 * where the columns leave room; the hand stays ≥ 12 px from all eight other buttons and their
 * numerals.
 */
export const InviteHandBesideK: Story = {
  globals: { ageMode: 'k' },
  render: () => <InviteGrid invite={4} colGap={80} rowGap={16} />,
  play: async ({ canvasElement }) => {
    const { grid, target, direction } = await inviteHandOn(canvasElement, 4);
    await expect(direction).toBe('left');
    await expectHandClearOfOthers(grid, target);
  },
};

/** With room between the rows, the hand keeps its usual place: below the button, pointing up. */
export const InviteHandBelowK: Story = {
  globals: { ageMode: 'k' },
  render: () => <InviteGrid invite={4} colGap={16} rowGap={80} />,
  play: async ({ canvasElement }) => {
    const { grid, target, direction } = await inviteHandOn(canvasElement, 4);
    await expect(direction).toBe('up');
    await expectHandClearOfOthers(grid, target);
  },
};

/**
 * The bottom-middle button of a grid tight both ways (16 px): below it there is nothing to cover,
 * so the hand points up from below as usual, clear of its neighbours.
 */
export const InviteHandBottomRowK: Story = {
  globals: { ageMode: 'k' },
  render: () => <InviteGrid invite={7} colGap={16} rowGap={16} />,
  play: async ({ canvasElement }) => {
    const { grid, target, direction } = await inviteHandOn(canvasElement, 7);
    await expect(direction).toBe('up');
    await expectHandClearOfOthers(grid, target);
  },
};

/**
 * The top-middle button, tight columns and roomy rows above it only: the kit points down from
 * above (below would cover the button under it, beside the ones next to it).
 */
export const InviteHandAboveK: Story = {
  globals: { ageMode: 'k' },
  // Room above the top row for the hand, inside the grid's own box.
  render: () => <InviteGrid invite={1} colGap={16} rowGap={16} padTop={80} />,
  play: async ({ canvasElement }) => {
    const grid = within(canvasElement).getByTestId('grid');
    const { target, direction } = await inviteHandOn(canvasElement, 1);
    await expect(direction).toBe('down');
    await expectHandClearOfOthers(grid, target);
  },
};
