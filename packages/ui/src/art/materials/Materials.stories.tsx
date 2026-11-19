import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { expect } from 'storybook/test';
import { ProductTray } from '../../primitives/ProductTray';
import { CVD_FILTERS } from '../../tokens/cvd';
import type { Lighting } from '../../tokens/tokens';
import {
  expectArtInsideCells,
  expectCellsApart,
  expectOneScreen,
  GALLERY_ROOM,
  GALLERY_VIEWPORT,
} from '../decor/galleryChecks';
import { CvdMatrix, GallerySection } from '../gallery/Gallery';
import { MATERIAL_IDS, type MaterialId, materialArt } from '.';

/**
 * Art Gallery: material icons (05 §4 "Produces"; rule 3: every correct action yields a visible,
 * countable product). Each icon has its own silhouette (06 §7: never colour alone) and reads at the
 * product tray's 48 px; use the controls to change size and lighting.
 */

interface MaterialArgs {
  size: number;
  lighting: Lighting;
}

const name = (id: string) => id.replace('-', ' ');

const CELL = { pad: 8, border: 3, gap: 6, captionH: 20 } as const;
const GRID_GAP = 16;

const cellStyle: CSSProperties = {
  margin: 0,
  display: 'grid',
  justifyItems: 'center',
  alignContent: 'end',
  gap: CELL.gap,
  padding: CELL.pad,
  borderRadius: 20,
  background: 'var(--color-paper)',
  border: `${CELL.border}px solid var(--color-sand-deep)`,
  boxSizing: 'border-box',
};

function Cell({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <figure data-cell={id} style={{ ...cellStyle, ...style }}>
      {children}
      <figcaption
        className="story-cell__name"
        style={{ color: 'var(--color-ink)', lineHeight: `${CELL.captionH}px` }}
      >
        {name(id.split('@')[0] ?? id)}
      </figcaption>
    </figure>
  );
}

/** Columns for 14 icons at `size`: as few rows as fit the room, then the rows evened out. */
function iconCols(size: number): number {
  const fit = Math.floor(
    (GALLERY_ROOM.w + GRID_GAP) / (size + 2 * (CELL.pad + CELL.border) + 16 + GRID_GAP),
  );
  const rows = Math.ceil(MATERIAL_IDS.length / Math.max(1, fit));
  return Math.ceil(MATERIAL_IDS.length / rows);
}

function IconGrid({
  size,
  lighting,
  row,
}: {
  size: number;
  lighting?: Lighting;
  /** A test hook naming the grid. */
  row?: string;
}) {
  return (
    <div
      data-lighting={lighting}
      data-row={row}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${iconCols(size)}, minmax(0, 1fr))`,
        gap: GRID_GAP,
        width: `min(${GALLERY_ROOM.w}px, 100%)`,
      }}
    >
      {MATERIAL_IDS.map((id) => {
        const Icon = materialArt[id];
        return (
          <Cell key={id} id={row ? `${id}@${row}` : id}>
            <Icon size={size} lighting={lighting} title={name(id)} />
          </Cell>
        );
      })}
    </div>
  );
}

const meta = {
  title: 'Art Gallery/Materials',
  parameters: { ui: { stage: 'centered' }, ...GALLERY_VIEWPORT.parameters },
  globals: GALLERY_VIEWPORT.globals,
  argTypes: {
    size: { control: { type: 'range', min: 32, max: 160, step: 4 } },
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
  },
  args: { size: 96, lighting: 'day' },
} satisfies Meta<MaterialArgs>;

export default meta;
type Story = StoryObj<Meta<MaterialArgs>>;

/** Every material icon at the chosen size and lighting. */
export const Icons: Story = {
  render: (args) => (
    <GallerySection title="Materials">
      <IconGrid size={args.size} lighting={args.lighting} />
    </GallerySection>
  ),
  play: async ({ canvasElement, args }) => {
    const icons = [...canvasElement.querySelectorAll<SVGSVGElement>('svg[data-material]')];
    await expect(icons.map((s) => s.dataset.material).sort()).toEqual([...MATERIAL_IDS].sort());
    for (const s of icons) {
      await expect(s.getAttribute('role')).toBe('img');
      await expect(Math.round(s.getBoundingClientRect().width)).toBe(args.size);
    }
    await expectCellsApart(canvasElement);
    await expectArtInsideCells(canvasElement);
    await expectOneScreen();
  },
};

const TITLE = { h: 24, gap: 10 } as const;
const MATRIX_COL = 64;

function SizeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={{ display: 'grid', gap: TITLE.gap }}>
      <h2
        className="story-heading"
        style={{ margin: 0, fontSize: '1.25rem', lineHeight: `${TITLE.h}px` }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Every icon at 96 px, then at the product tray's 48 px under each simulated colour-vision
 * deficiency (06 §7): a row per simulation, a column per material, so each silhouette can be
 * compared down its column.
 */
export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 20, width: `min(${GALLERY_ROOM.w}px, 100%)` }}>
      <SizeSection title="Every material, large">
        <IconGrid size={96} row="96" />
      </SizeSection>
      <SizeSection title="At the product tray's size, under colour-vision simulations">
        <CvdMatrix
          columns={MATERIAL_IDS.map((id) => ({ key: id, label: name(id), width: MATRIX_COL }))}
          cell={(id) => {
            const Icon = materialArt[id as MaterialId];
            return <Icon size={48} title={name(id)} />;
          }}
          headSize="0.8rem"
          rowGap={6}
          colGap={8}
        />
      </SizeSection>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const big = canvasElement.querySelectorAll<SVGSVGElement>('[data-row="96"] svg[data-material]');
    await expect(big.length).toBe(MATERIAL_IDS.length);
    for (const s of big) await expect(Math.round(s.getBoundingClientRect().width)).toBe(96);
    await expect(canvasElement.querySelectorAll('[data-col]').length).toBe(MATERIAL_IDS.length);
    for (const f of CVD_FILTERS) {
      const row = canvasElement.querySelector(`[data-cvd-row="${f.id}"]`) as HTMLElement;
      await expect(row.textContent).toContain(f.name);
      const icons = [...row.querySelectorAll<SVGSVGElement>('svg[data-material]')];
      await expect(icons.map((s) => s.dataset.material)).toEqual([...MATERIAL_IDS]);
      for (const s of icons) await expect(Math.round(s.getBoundingClientRect().width)).toBe(48);
    }
    await expectCellsApart(canvasElement);
    await expectArtInsideCells(canvasElement);
    await expectOneScreen();
  },
};

const tray = (ids: readonly MaterialId[]) =>
  ids.map((id, i) => {
    const Icon = materialArt[id];
    return { id: `${id}-${i}`, icon: <Icon /> };
  });

/** A tray with its caption above it; captions carry counts, so they are ≥ 32 px (05 §11). */
function TraySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} data-cell={title} style={{ display: 'grid', gap: 10 }}>
      <h2 className="story-heading" style={{ margin: 0, fontSize: '2rem', lineHeight: 1.2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Icons where they live: the workshop's product tray, in ten-frames (05 §4 rule 3, 06 §2), shown
 * at the K size (the youngest players). The tray is a display of earned, countable products, not a
 * control: no cell takes a tap or focus (05 §2 step 3: products fly to the tray and parade to the
 * Storehouse), so tap-target sizes don't apply; each icon is about 40 px with clear gaps.
 */
export const InTray: Story = {
  parameters: { controls: { disable: true } },
  globals: { ...GALLERY_VIEWPORT.globals, ageMode: 'k' },
  render: () => (
    <div style={{ display: 'grid', gap: 24, justifyItems: 'start' }}>
      <TraySection title="Ten-Boat Dock: 7 planks of 10">
        <ProductTray
          items={tray(Array.from({ length: 7 }, () => 'plank' as const))}
          goal={10}
          showLabel
        />
      </TraySection>
      <TraySection title="Bakery: 4 loaves of 6">
        <ProductTray items={tray(['bread', 'bread', 'bread', 'bread'])} goal={6} showLabel />
      </TraySection>
      <TraySection title="One of every material">
        <ProductTray items={tray(MATERIAL_IDS)} showLabel />
      </TraySection>
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const h of canvasElement.querySelectorAll('h2')) {
      await expect(Number.parseFloat(getComputedStyle(h).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await expectCellsApart(canvasElement);
    const items = [...canvasElement.querySelectorAll<HTMLElement>('.ni-tray__item')];
    await expect(items.length).toBe(7 + 4 + MATERIAL_IDS.length);
    for (const item of items) {
      const slot = (item.closest('.ni-tray__slot') as HTMLElement).getBoundingClientRect();
      const icon = (
        item.querySelector('svg[data-material]') as SVGSVGElement
      ).getBoundingClientRect();
      // Countable at a glance for a K child: about 40 px icons, inside their slots.
      await expect(icon.width).toBeGreaterThanOrEqual(38);
      await expect(icon.width).toBeLessThanOrEqual(slot.width);
      await expect(icon.height).toBeLessThanOrEqual(slot.height);
    }
    // Display only: nothing in a tray is interactive or focusable.
    for (const t of canvasElement.querySelectorAll<HTMLElement>('.ni-tray')) {
      const interactive = t.querySelectorAll(
        'button, a, input, [tabindex], [role="button"], [role="link"], [onclick]',
      );
      await expect(interactive.length).toBe(0);
      await expect(t.hasAttribute('tabindex')).toBe(false);
    }
    await expectOneScreen();
  },
};
