import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { CvdCompare, GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { Glim } from './Glim';
import { Pebbling } from './Pebbling';
import { Pip } from './Pip';
import { PebbleFrame } from './parts';
import {
  PALETTE_FILLS,
  PEBBLING_FAMILIES,
  PEBBLING_PALETTES,
  PEBBLING_POSES,
  PEBBLING_SPECIES,
  type PebblingFamily,
  type PebblingPalette,
  type PebblingPose,
  type PebblingSpecies,
} from './pebbling';
import {
  expectArtInsideBox,
  expectCellsApart,
  expectLitMatchesNumber,
  expectNoLoops,
  expectNoSidewaysScroll,
  expectSomeLoops,
  expectTopRowFirst,
  litCount,
} from './storyChecks';

/**
 * Art Gallery: Pebblings (05 §5). Shore critters whose shell or back holds their number as lit
 * pebbles in a 2 × 5 ten-frame (top row first, so the five is always visible). Above ten, families
 * ride together: Ten Turtles carry the tens and a small friend the ones; the Hundred Whale carries
 * ten ten-frames; the Half-Crab, Clockfish and Coin Clam carry fractions, time and money. Lit and
 * empty differ by shape (a filled stone vs a hollow ring), never by colour alone (06 §7).
 */

interface PebblingArgs {
  species: PebblingSpecies;
  palette: PebblingPalette;
  number: number;
  family: PebblingFamily | 'none';
  pose: PebblingPose;
  lighting: Lighting;
  showValue: boolean;
  size: number;
}

const meta = {
  title: 'Art Gallery/Characters/Pebblings',
  parameters: { ui: { stage: 'padded' } },
  argTypes: {
    species: { control: 'select', options: PEBBLING_SPECIES },
    palette: { control: 'select', options: PEBBLING_PALETTES },
    number: { control: { type: 'number', min: 0, max: 100, step: 1 } },
    family: { control: 'select', options: ['none', ...PEBBLING_FAMILIES] },
    pose: { control: 'inline-radio', options: PEBBLING_POSES },
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
    showValue: { control: 'boolean' },
    size: { control: { type: 'range', min: 80, max: 480, step: 10 } },
  },
  args: {
    species: 'crab',
    palette: 'coral',
    number: 7,
    family: 'none',
    pose: 'idle',
    lighting: 'day',
    showValue: false,
    size: 320,
  },
  render: (a: PebblingArgs) => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <Pebbling
        species={a.species}
        palette={a.palette}
        number={a.number}
        family={a.family === 'none' ? undefined : a.family}
        pose={a.pose}
        lighting={a.lighting}
        showValue={a.showValue}
        size={a.size}
        title={`${a.species} ${a.number}`}
      />
    </div>
  ),
} satisfies Meta<PebblingArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One Pebbling, driven by the controls (species, palette, number, family, pose, lighting). */
export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await expectLitMatchesNumber(canvasElement);
    await expectTopRowFirst(canvasElement);
    // 05 §5 legibility: a single critter's pebble is ≥ 9 CSS px across when it is 120 px wide.
    const svg = canvasElement.querySelector('svg[data-pebbling]') as SVGSVGElement;
    const mark = svg.querySelector('[data-pebble="lit"] circle, [data-pebble="empty"]');
    if (mark && !svg.dataset.family) {
      const ring = mark.getAttribute('data-pebble') === 'empty' ? 9 / 7.25 : 1;
      const px =
        (mark.getBoundingClientRect().width * ring * 120) / svg.getBoundingClientRect().width;
      await expect(px).toBeGreaterThanOrEqual(9);
    }
  },
};

const SPECIES_NUMBERS = [3, 6, 10];

/** The species on each species page: shore critters first, then sea friends and the specials. */
const SPECIES_PAGES = {
  shore: ['crab', 'hermit-crab', 'turtle', 'snail', 'starfish', 'seal'],
  sea: ['puffin', 'seahorse', 'whale', 'clockfish', 'clam'],
} as const satisfies Record<string, readonly PebblingSpecies[]>;

/** One column per species (each in its own palettes), carrying 3, 6 and 10 down the column. */
function SpeciesSheet({ title, species }: { title: string; species: readonly PebblingSpecies[] }) {
  return (
    <GallerySection title={title}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${species.length}, minmax(0, 176px))`,
          gridAutoFlow: 'column',
          gridTemplateRows: `repeat(${SPECIES_NUMBERS.length}, auto)`,
          gap: '22px 24px',
          alignItems: 'end',
          justifyContent: 'center',
          width: 'min(1200px, 100%)',
        }}
      >
        {species.flatMap((s) => {
          const i = PEBBLING_SPECIES.indexOf(s);
          return SPECIES_NUMBERS.map((n, j) => {
            const palette = PEBBLING_PALETTES[
              (i + j * 3) % PEBBLING_PALETTES.length
            ] as PebblingPalette;
            return (
              <GalleryCell key={`${s}-${n}`} name={`${s} · ${n}`}>
                <Pebbling
                  species={s}
                  palette={palette}
                  number={n}
                  size={150}
                  title={`${s} ${n}`}
                  pose={j === 1 ? 'wave' : 'idle'}
                />
              </GalleryCell>
            );
          });
        })}
      </div>
    </GallerySection>
  );
}

async function expectSpeciesSheet(root: HTMLElement, species: readonly PebblingSpecies[]) {
  const all = Object.values(SPECIES_PAGES).flat();
  await expect([...all].sort()).toEqual([...PEBBLING_SPECIES].sort());
  await expect(root.querySelectorAll('svg[data-pebbling]').length).toBe(
    species.length * SPECIES_NUMBERS.length,
  );
  await expect(
    new Set([...root.querySelectorAll('[data-critter]')].map((e) => e.getAttribute('data-critter')))
      .size,
  ).toBe(species.length);
  await expectLitMatchesNumber(root);
  await expectTopRowFirst(root);
  await expectCellsApart(root);
  await expectArtInsideBox(root, 'svg[data-pebbling]');
  // Closed clams keep their lid level in every pose, so the ten-frame reads straight.
  for (const clam of root.querySelectorAll('svg[data-pebbling="clam"]')) {
    const rows = [...clam.querySelectorAll('[data-pebble]')].map((m) => {
      const r = m.getBoundingClientRect();
      return Math.round((r.top + r.height / 2) / 2);
    });
    await expect(new Set(rows).size, 'two level rows').toBe(2);
  }
  await expectNoSidewaysScroll();
}

/** The shore critters, each in its own palettes, carrying 3, 6 and 10. */
export const SpeciesShore: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <SpeciesSheet title="Pebbling species: shore critters" species={SPECIES_PAGES.shore} />
  ),
  play: async ({ canvasElement }) => expectSpeciesSheet(canvasElement, SPECIES_PAGES.shore),
};

/** The sea friends and the specials' species, carrying 3, 6 and 10. */
export const SpeciesSea: Story = {
  parameters: { controls: { disable: true } },
  render: () => <SpeciesSheet title="Pebbling species: sea friends" species={SPECIES_PAGES.sea} />,
  play: async ({ canvasElement }) => expectSpeciesSheet(canvasElement, SPECIES_PAGES.sea),
};

const ONES = Array.from({ length: 11 }, (_, i) => i);
const TEENS = Array.from({ length: 10 }, (_, i) => i + 11);

/** 0–10 as one species: the ten-frame fills its top row first, so the five is always visible. */
export const NumbersToTen: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <GallerySection title="0 to 10: one ten-frame">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 190px))',
          gap: '28px 16px',
          alignItems: 'end',
          justifyContent: 'center',
          width: 'min(1200px, 100%)',
        }}
      >
        {ONES.map((n) => (
          <GalleryCell key={n} name={String(n)}>
            <Pebbling species="crab" palette="sun" number={n} size={176} title={`crab ${n}`} />
          </GalleryCell>
        ))}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    const all = [...canvasElement.querySelectorAll<SVGSVGElement>('svg[data-pebbling]')];
    await expect(all.map((s) => litCount(s))).toEqual(ONES);
    await expectLitMatchesNumber(canvasElement);
    await expectTopRowFirst(canvasElement);
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

/** 11–20: a Ten Turtle carrying a full ten-frame, and a small friend carrying the ones. */
export const NumbersTeens: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <GallerySection title="11 to 20: a Ten Turtle and a friend">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 228px))',
          gap: '28px 12px',
          alignItems: 'end',
          justifyContent: 'center',
          width: 'min(1200px, 100%)',
        }}
      >
        {TEENS.map((n) => (
          <GalleryCell key={n} name={String(n)}>
            <Pebbling
              species="crab"
              palette="sun"
              number={n}
              family="tens"
              size={220}
              title={`crab ${n}`}
            />
          </GalleryCell>
        ))}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    const all = [...canvasElement.querySelectorAll<SVGSVGElement>('svg[data-pebbling]')];
    await expect(all.map((s) => litCount(s))).toEqual(TEENS);
    await expectLitMatchesNumber(canvasElement);
    await expectTopRowFirst(canvasElement);
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

const TENS = [20, 30, 50, 70, 100];

/** Teens and tens: Ten Turtles ride together, every one drawn the same size. */
export const TenTurtles: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <GallerySection title="Teens and tens: Ten Turtles riding together">
      {/* Default sizes: every Ten Turtle is drawn the same size however many ride together. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '20px 40px',
          alignItems: 'flex-end',
          width: 'min(1200px, 100%)',
        }}
      >
        {[14, 19, ...TENS].map((n, i) => (
          <GalleryCell key={n} name={String(n)}>
            <Pebbling
              species={n < 20 ? 'snail' : 'turtle'}
              palette={
                n < 20
                  ? 'coral'
                  : (['leaf', 'sea', 'sunshine', 'wood', 'sky'][i % 5] as PebblingPalette)
              }
              number={n}
              family="tens"
              style={{ maxWidth: '100%' }}
              title={`tens ${n}`}
            />
          </GalleryCell>
        ))}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    await expectLitMatchesNumber(canvasElement);
    const ten100 = canvasElement.querySelector(
      'svg[data-family="tens"][data-number="100"]',
    ) as SVGSVGElement;
    await expect(ten100.querySelectorAll('[data-role="ten"]').length).toBe(10);
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

/** The Hundred Whale carries ten ten-frames: 100, and 46 (four full frames and six). */
export const HundredWhale: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <GallerySection title="The Hundred Whale">
      <div style={{ display: 'flex', justifyContent: 'center', gap: 48, alignItems: 'flex-end' }}>
        {[100, 46].map((n) => (
          <GalleryCell key={n} name={String(n)}>
            <Pebbling
              species="whale"
              palette={n === 100 ? 'sky' : 'sea'}
              number={n}
              family="hundreds"
              size={480}
              title={`hundred whale ${n}`}
            />
          </GalleryCell>
        ))}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    await expectLitMatchesNumber(canvasElement);
    const whale = canvasElement.querySelector(
      'svg[data-family="hundreds"][data-number="100"]',
    ) as SVGSVGElement;
    await expect(litCount(whale)).toBe(100);
    await expect(whale.querySelectorAll('[data-part="ten-frame"]').length).toBe(10);
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

/** The specials: Half-Crabs (fractions), Clockfish (o'clock) and Coin Clams. */
export const FractionsClocksCoins: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 28 }}>
      <GallerySection title="Half-Crabs (fractions)">
        <GalleryGrid col={170}>
          {[
            [0.5, '1/2'],
            [0.25, '1/4'],
            [0.75, '3/4'],
            [1 / 3, '1/3'],
            [2 / 3, '2/3'],
            [1, 'whole'],
          ].map(([v, name]) => (
            <GalleryCell key={name} name={String(name)}>
              <Pebbling
                species="crab"
                palette="coral"
                number={Number(v)}
                family="fraction"
                size={160}
                title={`half-crab ${name}`}
              />
            </GalleryCell>
          ))}
        </GalleryGrid>
      </GallerySection>
      <GallerySection title="Clockfish (o'clock) and Coin Clams">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, minmax(0, 140px))',
            gap: 12,
            alignItems: 'end',
            justifyContent: 'center',
            width: 'min(1200px, 100%)',
          }}
        >
          {[3, 7, 12].map((h, i) => (
            <GalleryCell key={`h${h}`} name={`${h} o'clock`}>
              <Pebbling
                species="clockfish"
                palette={(['sky', 'sunshine', 'sea'] as const)[i] ?? 'sky'}
                number={h}
                family="clock"
                size={136}
                title={`clockfish ${h}`}
              />
            </GalleryCell>
          ))}
          {[1, 5, 10, 25].map((v) => (
            <GalleryCell key={`c${v}`} name={`${v}¢`}>
              <Pebbling
                species="clam"
                palette="sand"
                number={v}
                family="coin"
                size={136}
                title={`coin clam ${v}`}
              />
            </GalleryCell>
          ))}
          <GalleryCell name="25¢ with numeral">
            <Pebbling
              species="clam"
              palette="wood"
              number={25}
              family="coin"
              showValue
              size={136}
              title="coin clam 25 with numeral"
            />
          </GalleryCell>
        </div>
      </GallerySection>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expectLitMatchesNumber(canvasElement);
    const fractions = [
      ...canvasElement.querySelectorAll<SVGGElement>('[data-part="fraction"]'),
    ].map((f) => `${f.dataset.filled}/${f.dataset.parts}`);
    await expect(fractions).toEqual(['1/2', '1/4', '3/4', '1/3', '2/3', '2/2']);
    const hours = [...canvasElement.querySelectorAll<SVGGElement>('[data-part="clock"]')].map(
      (c) => c.dataset.hour,
    );
    await expect(hours).toEqual(['3', '7', '12']);
    const coins = [...canvasElement.querySelectorAll<SVGGElement>('[data-part="coin"]')];
    await expect(coins.map((c) => c.dataset.value)).toEqual(['1', '5', '10', '25', '25']);
    // Size tells the coins apart: dime < penny < nickel < quarter.
    const w = (v: string) =>
      (
        canvasElement.querySelector(
          `[data-part="coin"][data-value="${v}"] circle:nth-of-type(1)`,
        ) as SVGCircleElement
      ).r.baseVal.value;
    await expect(w('10')).toBeLessThan(w('1'));
    await expect(w('1')).toBeLessThan(w('5'));
    await expect(w('5')).toBeLessThan(w('25'));
    await expectCellsApart(canvasElement);
    await expectNoSidewaysScroll();
  },
};

/**
 * The cast at rest, each in its idle loop: Pip bobs and blinks, Glim hovers and glows, a crab and
 * the Ten Turtles bob and blink. (Reduced motion holds them still: see ReducedMotion.)
 */
export const IdleCast: Story = {
  parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
  render: () => (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: '24px 56px',
        width: 'min(1200px, 100%)',
      }}
    >
      <GalleryCell name="Pip">
        <Pip pose="idle" size={300} title="Pip idle" />
      </GalleryCell>
      <GalleryCell name="Glim">
        <Glim state="idle" size={230} title="Glim idle" />
      </GalleryCell>
      <GalleryCell name="Crab Pebbling · 7">
        <Pebbling species="crab" palette="coral" number={7} size={240} title="crab 7 idle" />
      </GalleryCell>
      <GalleryCell name="Ten Turtles · 30">
        <Pebbling
          species="turtle"
          palette="leaf"
          number={30}
          family="tens"
          size={420}
          title="tens 30 idle"
        />
      </GalleryCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg[role="img"]').length).toBe(4);
    await expectSomeLoops();
    await expectNoSidewaysScroll();
  },
};

/** Ten-frames on every palette's shell, 7 lit: one filled stone kind, one hollow ring kind. */
function PaletteFrames() {
  const tileW = 150;
  const tileH = 80;
  return (
    <ArtSvg width={tileW * 2} height={tileH * 4} size="100%" title="Ten-frames on every palette">
      {PEBBLING_PALETTES.map((p, i) => {
        const c = PALETTE_FILLS[p];
        const x = (i % 2) * tileW;
        const y = Math.floor(i / 2) * tileH;
        return (
          <g key={p}>
            <rect
              x={x + 4}
              y={y + 4}
              width={tileW - 8}
              height={tileH - 8}
              rx={20}
              fill={paint(c.body)}
              stroke={paint(c.deep)}
              strokeWidth={3}
            />
            <PebbleFrame
              x={x + tileW / 2}
              y={y + tileH / 2}
              lit={7}
              bed={c.belly}
              edge={c.deep}
              scale={0.98}
            />
          </g>
        );
      })}
    </ArtSvg>
  );
}

/**
 * 06 §7 colour-vision check: lit pebbles vs empty sockets on every palette, and a Half-Crab's
 * filled vs empty parts, under simulated CVD. They differ by shape, so every column still counts 7.
 */
export const ColourVision: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <CvdCompare col={224}>
      <PaletteFrames />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
        <Pebbling species="turtle" palette="leaf" number={7} size={86} title="turtle 7" />
        <Pebbling
          species="crab"
          palette="sun"
          number={0.75}
          family="fraction"
          size={86}
          title="half-crab 3/4"
        />
      </div>
    </CvdCompare>
  ),
  play: async ({ canvasElement }) => {
    for (const cell of canvasElement.querySelectorAll<HTMLElement>('[data-cvd]')) {
      const frames = cell.querySelectorAll('[data-part="ten-frame"]');
      for (const f of frames) await expect(litCount(f)).toBe(7);
    }
  },
};

/** 06 §7: with reduced motion every character holds still: no bob, blink, sway, glow or hop. */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
  globals: { motion: 'reduced' },
  render: () => (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: '24px 56px',
        width: 'min(1200px, 100%)',
      }}
    >
      {/* The same sizes as the Idle cast story, so every character is at the shared scale. */}
      <GalleryCell name="Pip cheering">
        <Pip pose="cheer" size={300} title="Pip cheering" />
      </GalleryCell>
      <GalleryCell name="Glim talking">
        <Glim state="talk" size={230} title="Glim talking" />
      </GalleryCell>
      <GalleryCell name="Seahorse waving">
        <Pebbling
          species="seahorse"
          palette="sky"
          number={4}
          pose="wave"
          size={240}
          title="seahorse 4"
        />
      </GalleryCell>
      <GalleryCell name="Ten Turtles cheering">
        <Pebbling
          species="turtle"
          palette="leaf"
          number={30}
          family="tens"
          pose="cheer"
          size={420}
          title="tens 30 cheering"
        />
      </GalleryCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg[role="img"]').length).toBe(4);
    // Every pebble is a readable size (≥ 9 CSS px across), the Ten Turtles' included.
    for (const mark of canvasElement.querySelectorAll('[data-pebble="lit"] circle')) {
      await expect(mark.getBoundingClientRect().width).toBeGreaterThanOrEqual(9);
    }
    await expectNoLoops();
    await expectNoSidewaysScroll();
  },
};
