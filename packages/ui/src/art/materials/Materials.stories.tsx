import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { expect } from 'storybook/test';
import { ProductTray } from '../../primitives/ProductTray';
import type { Lighting } from '../../tokens/tokens';
import { expectCellsApart, expectNoSidewaysScroll } from '../decor/galleryChecks';
import { CvdCompare, GallerySection } from '../gallery/Gallery';
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

const cellStyle: CSSProperties = {
  margin: 0,
  display: 'grid',
  justifyItems: 'center',
  alignContent: 'end',
  gap: 8,
  padding: 12,
  borderRadius: 20,
  background: 'var(--color-paper)',
  border: '3px solid var(--color-sand-shadow)',
};

function Cell({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <figure data-cell={id} style={{ ...cellStyle, ...style }}>
      {children}
      <figcaption className="story-cell__name" style={{ color: 'var(--color-ink)' }}>
        {name(id.split('@')[0] ?? id)}
      </figcaption>
    </figure>
  );
}

function IconGrid({
  size,
  lighting,
  title = true,
}: {
  size: number;
  lighting?: Lighting;
  title?: boolean;
}) {
  return (
    <div
      data-lighting={lighting}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(112, size + 28)}px, 1fr))`,
        gap: 16,
        width: 'min(1180px, 100%)',
      }}
    >
      {MATERIAL_IDS.map((id) => {
        const Icon = materialArt[id];
        return (
          <Cell key={id} id={id}>
            <Icon size={size} lighting={lighting} title={title ? name(id) : undefined} />
          </Cell>
        );
      })}
    </div>
  );
}

const meta = {
  title: 'Art Gallery/Materials',
  parameters: { ui: { stage: 'padded' } },
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
    await expectNoSidewaysScroll();
  },
};

/** 48 px (the tray) and 96 px side by side, then the 48 px icons under simulated CVD. */
export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 28, justifyItems: 'center' }}>
      {[48, 96].map((size) => (
        <GallerySection key={size} title={`${size} px`}>
          <div
            data-row={size}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'center',
              width: 'min(1180px, 100%)',
            }}
          >
            {MATERIAL_IDS.map((id) => {
              const Icon = materialArt[id];
              return (
                <Cell key={id} id={`${id}@${size}`} style={{ padding: 8, minWidth: size + 16 }}>
                  <Icon size={size} title={name(id)} />
                </Cell>
              );
            })}
          </div>
        </GallerySection>
      ))}
      <GallerySection title="Silhouettes under colour-vision simulation">
        <div style={{ width: 'min(1180px, calc(100vw - 80px))' }}>
          <CvdCompare col={300}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 48px)',
                gap: 10,
                justifyContent: 'center',
              }}
            >
              {MATERIAL_IDS.map((id) => {
                const Icon = materialArt[id];
                return <Icon key={id} size={48} />;
              })}
            </div>
          </CvdCompare>
        </div>
      </GallerySection>
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const size of [48, 96]) {
      const row = canvasElement.querySelector(`[data-row="${size}"]`) as HTMLElement;
      const icons = row.querySelectorAll<SVGSVGElement>('svg[data-material]');
      await expect(icons.length).toBe(MATERIAL_IDS.length);
      for (const s of icons) await expect(Math.round(s.getBoundingClientRect().width)).toBe(size);
    }
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

const tray = (ids: readonly MaterialId[]) =>
  ids.map((id, i) => {
    const Icon = materialArt[id];
    return { id: `${id}-${i}`, icon: <Icon /> };
  });

/** Icons where they live: the workshop's product tray, in ten-frames (05 §4 rule 3, 06 §2). */
export const InTray: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 28, justifyItems: 'center' }}>
      <GallerySection title="Ten-Boat Dock: 7 planks of 10">
        <ProductTray
          items={tray(Array.from({ length: 7 }, () => 'plank' as const))}
          goal={10}
          showLabel
        />
      </GallerySection>
      <GallerySection title="Bakery: 4 loaves of 6">
        <ProductTray items={tray(['bread', 'bread', 'bread', 'bread'])} goal={6} showLabel />
      </GallerySection>
      <GallerySection title="One of every material">
        <ProductTray items={tray(MATERIAL_IDS)} showLabel />
      </GallerySection>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('.ni-tray__item')];
    await expect(items.length).toBe(7 + 4 + MATERIAL_IDS.length);
    for (const item of items) {
      const slot = (item.closest('.ni-tray__slot') as HTMLElement).getBoundingClientRect();
      const icon = (
        item.querySelector('svg[data-material]') as SVGSVGElement
      ).getBoundingClientRect();
      await expect(icon.width).toBeGreaterThan(30);
      await expect(icon.width).toBeLessThanOrEqual(slot.width);
      await expect(icon.height).toBeLessThanOrEqual(slot.height);
    }
    await expectNoSidewaysScroll();
  },
};
